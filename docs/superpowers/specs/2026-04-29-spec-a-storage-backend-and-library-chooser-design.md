# Spec A — Storage Backend Abstraction, S3 Driver, First-Run Library Chooser

**Date:** 2026-04-29
**Status:** Draft, awaiting review
**Scope:** Items 1 + 2 of the multi-feature request. Web app target (item 3) builds on this spec; agent capabilities (items 4 + 5) and zip import/export (item 6) are independent and tracked separately.

## Goals

1. Refactor `Library` so storage I/O goes through a `StorageBackend` interface, with a `LocalBackend` (filesystem) implementation that preserves today's behavior bit-for-bit.
2. Add an `S3Backend` implementation for any S3-compatible service (AWS S3, Cloudflare R2, Backblaze B2, MinIO).
3. Replace the launch-time auto-create-default-library behavior with a first-run welcome screen that lets the user open an existing folder, create a new local library, or connect an S3 library.
4. Persist the set of configured libraries across launches; the app reopens the last-used library on subsequent launches and only shows the welcome screen when no libraries are configured.

## Non-Goals

- Web app target (Spec B).
- Agent vision / PDF view tool / web fetch (Spec C).
- Zip import/export (Spec D).
- Multi-library "workspace" UX (switching between two libraries side-by-side). Switching remains one-at-a-time as today.
- Sync / offline cache for S3. S3 calls are made on demand. A local cache is a future optimization.

## Architecture

### Storage backend interface

New file `src/main/paperdb/backend.ts`:

```ts
import type { Readable } from 'node:stream'

export interface StorageBackend {
  /** Read a file as bytes. Reject with a typed error if missing. */
  readFile(relPath: string): Promise<Buffer>

  /** Write a file, creating parent "directories" as needed. Atomic where possible. */
  writeFile(relPath: string, data: Buffer | string): Promise<void>

  /** Delete a file. No-op if it does not exist. */
  deleteFile(relPath: string): Promise<void>

  /** List relative paths under a prefix (recursive). Returns [] if prefix is empty. */
  listFiles(prefix: string): Promise<string[]>

  /** Existence check, used by initialization detection. */
  exists(relPath: string): Promise<boolean>

  /** Streaming read, used by the PDF viewer and large attachments. */
  createReadStream(relPath: string): Readable

  /** Human-readable label for logs and error messages ("local: /path", "s3: bucket/prefix"). */
  describe(): string
}
```

All paths are POSIX-style relative paths (`papers/2017-vaswani-attention.md`). The backend translates them into filesystem paths or S3 object keys.

Errors are normalized into a small set of classes: `BackendNotFoundError`, `BackendAuthError`, `BackendNetworkError`, `BackendError`. Callers in `Library` can catch the typed errors and produce useful UI messages.

### Local backend

`src/main/paperdb/backendLocal.ts` — wraps `fs/promises`. Constructor takes a root path. `writeFile` writes to a temp file then renames (atomic on the same filesystem). `listFiles` walks recursively. `createReadStream` is `fs.createReadStream`.

### S3 backend

`src/main/paperdb/backendS3.ts` — wraps `@aws-sdk/client-s3` (`GetObjectCommand`, `PutObjectCommand`, `DeleteObjectCommand`, `ListObjectsV2Command`, `HeadObjectCommand`). Constructor takes:

```ts
interface S3BackendConfig {
  endpoint?: string        // omit for AWS, set for R2/B2/MinIO
  region: string
  bucket: string
  prefix?: string          // optional key prefix, e.g. "verko/"
  accessKeyId: string
  secretAccessKey: string
  forcePathStyle?: boolean // true for MinIO
}
```

`createReadStream` returns the readable stream from `GetObjectCommand`. `writeFile` is single-shot `PutObject` (libraries are small; multipart is future work). `listFiles` paginates `ListObjectsV2`.

### Library refactor

`src/main/paperdb/store.ts` — `Library` constructor signature changes from `new Library(rootPath)` to `new Library(backend: StorageBackend)`. All references to `path.join(this.root, ...)` and `fs.*` are replaced with `this.backend.*` calls. `papers.csv`, `schema.md`, paper `.md` files, attachments — all flow through the backend.

Side effects:
- `manager.ts`, `csv.ts`, `schema.ts`, `import.ts`, `search.ts` — audit each for direct `fs`/`path` usage and route through the backend. Any helper that legitimately needs a real filesystem (e.g. PDF import from a user-selected file outside the library) takes the source path as input but writes via the backend.
- Tests in `src/main/__tests__/` continue to use a real `mkdtemp` directory wrapped in `LocalBackend`. No mocking.

### Library registry

New module `src/main/libraries/registry.ts`. Owns `libraries.json` in `app.getPath('userData')`:

```ts
interface LibraryEntry {
  id: string                       // uuid
  name: string                     // display name
  type: 'local' | 's3'
  lastOpenedAt?: number            // epoch ms
  // discriminated by type
  path?: string                    // when type === 'local'
  s3?: {
    endpoint?: string
    region: string
    bucket: string
    prefix?: string
    forcePathStyle?: boolean
    credentialRef: string          // opaque key into the encrypted credential store
  }
}

interface LibrariesFile {
  version: 1
  entries: LibraryEntry[]
  lastOpenedId?: string
}
```

API:

```ts
listLibraries(): LibraryEntry[]
addLibrary(entry: Omit<LibraryEntry, 'id'>): LibraryEntry
removeLibrary(id: string): void
markOpened(id: string): void
getLastOpened(): LibraryEntry | undefined
```

### Credential store

New module `src/main/libraries/credentials.ts`. Wraps Electron `safeStorage`:

- File: `<userData>/credentials.bin` — JSON `{ [credentialRef: string]: { accessKeyId: string; secretAccessKey: string } }`, encrypted as a whole blob via `safeStorage.encryptString`.
- API: `getCredentials(ref): { accessKeyId, secretAccessKey } | null`, `setCredentials(ref, creds)`, `deleteCredentials(ref)`.
- On platforms where `safeStorage.isEncryptionAvailable()` returns false (rare, e.g. headless Linux), fall back to a plaintext file with a warning logged once. Document this in the settings UI ("encryption unavailable on this system").

### LibraryManager changes

`main/index.ts` currently auto-creates a default library. New behavior:

1. On app ready, read the registry.
2. If `entries` is empty: emit `library:none` to the renderer; do not instantiate a `Library`.
3. Otherwise: open `lastOpenedId` (or first entry if missing), instantiate the backend, instantiate `Library`, register IPC handlers as today.
4. Switching libraries (existing flow) is generalized: takes a `LibraryEntry`, builds the right backend, swaps in the new `Library`.

## Data Flow

### Opening an existing local folder

1. Renderer welcome screen → user clicks "Open existing folder" → IPC `library:pickFolder` opens an Electron dialog, returns the chosen path.
2. Renderer calls `library:probe` with `{ type: 'local', path }`. Main checks for `papers/` and `schema.md`.
3. If both exist → returns `{ status: 'ready' }`. Renderer calls `library:add` to register and open it.
4. If missing → returns `{ status: 'uninitialized' }`. Renderer shows a confirm: "This folder isn't a Verko library yet. Initialize it?". On yes, renderer calls `library:add` with `{ initialize: true }`; main creates `papers/`, `schema.md` (default columns), empty `papers.csv`, registers the entry, opens it.
5. If the folder is non-empty but doesn't look like one we'd want to take over (e.g. has unrelated files), the dialog warns ("This folder contains other files. Initialize anyway?").

### Creating a new local library

1. User clicks "Create new local library" → folder picker.
2. Main creates the folder structure unconditionally (it's empty or new) → registers entry → opens.

### Connecting an S3 library

1. User clicks "Connect S3 library" → form (provider preset dropdown for convenience: Custom / AWS / Cloudflare R2 / Backblaze B2 / MinIO; preset only seeds default endpoint and `forcePathStyle`, the user fills the rest).
2. On submit, renderer calls `library:probeS3` with the config (creds included, in-memory only). Main builds a transient `S3Backend`, attempts a `HeadBucket` and a `ListObjectsV2` with `MaxKeys: 1`. Reports success / auth error / network error / wrong-bucket.
3. On success, main checks for `schema.md` in the bucket. If absent → "Initialize this bucket as a Verko library?" (writes `schema.md`, empty `papers.csv`). If present → ready to open.
4. Main writes credentials into the credential store under a fresh `credentialRef`, writes the registry entry, opens.

### Reopening on next launch

`LibraryManager` reads the registry, finds `lastOpenedId`, builds the backend (loading S3 creds via `credentialRef` if needed), opens the library. If the local path has gone missing, or S3 auth fails, fall back to the welcome screen with an error toast naming the failed library.

## UI

### Welcome screen

New route/component `features/onboarding/WelcomeScreen.tsx`. Shown by `App.tsx` when `useLibrary().status === 'none'`. Three large buttons matching the three flows above. Below, a "Recent libraries" list pulled from the registry (only shown if `entries.length > 0` but `lastOpenedId` failed to open).

### Settings → Library tab

The existing tab gains:

- A list of all configured libraries with name, type, last-opened time, and per-row actions (Open, Rename, Remove).
- "Add library" button that opens the same flow as the welcome screen.
- For S3 entries: an "Edit credentials" action that re-opens the form pre-filled (creds masked).

Removing a library de-registers it and deletes its credentials; **never** deletes the underlying folder or bucket contents. The confirm dialog says so explicitly.

### IPC additions

In `shared/types.ts`:

```
library:list           → LibraryEntry[]
library:add            (entry: NewLibraryInput) → LibraryEntry
library:remove         (id: string) → void
library:rename         (id: string, name: string) → void
library:open           (id: string) → void
library:pickFolder     → string | null
library:probe          ({ type:'local', path }) → ProbeResult
library:probeS3        (S3BackendConfig) → ProbeResult
```

`ProbeResult = { status: 'ready' | 'uninitialized' | 'error'; message?: string }`.

The existing `library:switched` event continues to fire whenever the active library changes; the renderer's `useLibrary` store reacts as today.

## Error Handling

- **Backend errors** are caught at the IPC boundary and converted to user-facing messages. Auth errors specifically mention "check your access key and secret"; network errors mention "check the endpoint URL or your connection".
- **Registry corruption** (malformed `libraries.json`): rename to `libraries.json.corrupt-<timestamp>`, start fresh, surface a one-time toast on next launch.
- **Credential store unreadable** (e.g. user moved machines and OS keychain key changed): the affected S3 entries appear in the registry but cannot open; the welcome screen shows them with an "Re-enter credentials" action.
- **Concurrent writes** (two app instances against the same S3 bucket): out of scope. S3 writes are last-writer-wins; we accept that and document it.

## Testing

- `LocalBackend` and `S3Backend` each get a contract test suite asserting the same `StorageBackend` behavior. Local runs against `mkdtemp`. S3 runs against an in-process MinIO container if available; if not, the suite is skipped with `it.skip` and a clear message (CI configures MinIO; local dev is fine without it).
- `Library` tests are re-pointed at `LocalBackend(mkdtemp)`. No behavior changes expected; the existing 39 tests must pass unchanged.
- New tests cover: registry CRUD, credential store round-trip with `safeStorage` mocked at the module boundary, `probe` for both backends (ready / uninitialized / error), and the `LibraryManager` cold-start branches (empty registry, last-opened succeeds, last-opened fails).
- Renderer tests are still out of scope (matches current convention).

## Migration

On first launch after upgrade:

1. If `libraries.json` does not exist but the previously hard-coded default library path *does* (it has `papers/` and `schema.md`), seed the registry with a single `local` entry pointing at it, set `lastOpenedId` to that entry, and proceed normally. No welcome screen for existing users.
2. If neither exists, show the welcome screen.

This keeps existing users transparent to the change.

## Open Questions

None blocking. The provider preset list and exact welcome-screen copy will be finalized during implementation.

## Out of Scope For This Spec (Forward References)

- **Spec B (web target)** will reuse `S3Backend` directly in the browser via `@aws-sdk/client-s3`'s browser bundle. The credential store will be replaced with a passphrase-derived key in IndexedDB. The library registry will live in IndexedDB. None of that affects desktop.
- **Spec D (zip import/export)** will operate on a `StorageBackend` and is therefore backend-agnostic by construction.

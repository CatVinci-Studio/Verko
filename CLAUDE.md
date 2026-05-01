# Verko — Claude Code Guide

## Project Overview
Agent-first academic paper management desktop app. Built with Tauri 2 (Rust shell) + React 19. Storage is plain files in a CSV-first model: `papers.csv` is the canonical store of field data (title, authors, status, custom columns…), `papers/<id>.md` files hold the notes body only (no frontmatter), `schema.md` defines columns. The AI agent runs in-process and reads/writes papers through the same `Library` abstraction the UI uses.

## Tech Stack
- **Runtime**: Tauri 2 (Rust shell) + Vite 8 (renderer + Tauri-side bundle)
- **Frontend**: React 19, Tailwind CSS 4, shadcn/ui (Radix primitives copied into `components/ui/`)
- **State**: Zustand 5 (`ui`, `library`, `agent`, `dialogs` stores)
- **Data fetching**: TanStack Query v5 over the `IApi` adapter
- **Tables**: TanStack Table v8 (headless) — drives the library paper view
- **Editor**: CodeMirror 6 (Markdown)
- **Search**: MiniSearch (in-memory full-text)
- **Agent**: pluggable provider layer (`src/shared/agent/providers/`) speaking OpenAI / Anthropic / Gemini protocols natively; agent loop runs in the renderer; multi-conversation history persisted under `<appConfig>/conversations/<id>.json`
- **Tests**: Vitest 4 (Node env; targets `src/shared`)
- **Package manager**: npm
- **i18n**: i18next + react-i18next; English + 简体中文 (`src/renderer/src/locales/{en,zh}.json`); language preference persists to localStorage and is forwarded to the agent so the system prompt swaps with the UI
- **Style enforcement**: `.editorconfig` (indent / EOL) + TypeScript strict mode (`noUnusedLocals`, `noUnusedParameters` on) + ESLint 10 flat config (`eslint.config.js` — JS/TS recommended + `react-hooks/{rules-of-hooks,exhaustive-deps}` + `react-refresh/only-export-components`)

## Repository Layout
```
src/
  shared/             # Runtime-neutral code — runs in any JS env (Node, browser, webview)
    paperdb/
      store.ts        #   Library class (operates on the StorageBackend interface)
      backend.ts      #   StorageBackend interface (Uint8Array + ReadableStream)
      backendS3.ts    #   S3-compatible backend (AWS SDK v3, browser-safe)
      __tests__/      #   Vitest specs + a node-fs LocalBackend test helper
    agent/
      loop.ts         #   runAgentLoop(provider, dispatchTool, …) — tool-agnostic
      runtime.ts      #   Agent class — owns subscribers, send orchestration, abort
      conversationStore.ts  # ConversationStore over StorageBackend (one .json per conv)
      prompt.ts       #   buildSystemPrompt(language, ctx) — EN + ZH
      providers/      #   openai/anthropic/gemini SDK adapters (dangerouslyAllowBrowser)
      tools/          #   Single source of truth for tools — runs wherever called from:
                      #     paperTools / collectionTools / fileTools / webTools
                      #     pdfTools (OffscreenCanvas)
                      #     documentTools (mammoth + pdfjs + turndown, via backend.readFile)
    types.ts          # Master type contract (AgentEvent, LibraryInfo, …)
    providers.ts      # PROVIDER_DEFINITIONS catalog
    presets.ts        # DEFAULT_AGENT_CONFIG derived from the catalog

  renderer/src/       # React frontend — owns Library + agent runtime at runtime
    desktop/          # Desktop adapter (used by both Tauri and web stub paths)
      backendIpc.ts   #   StorageBackend over fs.* preload calls
      libraryHost.ts  #   Owns active Library, listens for library:switched
      desktopTools.ts #   Tool registry (SHARED_TOOLS + manager tools using IPC)
      desktopApi.ts   #   makeDesktopApi(preload) → full IApi
      preloadApi.ts   #   Type for the narrow preload-bridged surface (the IPC contract)
    tauri/
      tauriPreload.ts #   IPreloadApi implementation: invoke() + listen() over Tauri commands
    web/              # Web build (S3-only, single library)
      webApi.ts       #   Same IApi shape, S3Backend + LocalStorage agent
      webAgent.ts     #   Web-flavored agent (will fold into shared Agent in time)
      apiKeys.ts      #   Per-provider key store (localStorage / memory)
      credentials.ts  #   S3 credential store (IndexedDB)
    store/            # Zustand stores: library, ui, agent, dialogs
    features/         # library/, paper/, agent/, command/, settings/, dialogs/, onboarding/
    components/ui/    # shadcn primitives (kebab-case)
    components/common/# TitleBar, ChipStatus, ChipTag
    lib/              # ipc.ts (IApi + pickApi), utils.ts, i18n.ts
    locales/          # en.json + zh.json
    styles/           # globals.css (CSS variables for dark/light theme)

src-tauri/            # Rust shell — zero-trust IO shim (~1k lines)
  src/
    lib.rs            #   App entry, command registration, AppState init, menu install
    scope.rs          #   allowedRoots + resolveScoped (path validation, symlink-safe)
    state.rs          #   AppState { data_dir, roots, registry, active_id }
    registry.rs       #   libraries.json on-disk shape
    fs_cmd.rs         #   fs_read / fs_write / fs_delete / fs_list / fs_exists commands
    paths_cmd.rs      #   paths_library_root / paths_user_data
    dialog_cmd.rs     #   dialog_open_pdf (native picker → bytes)
    keychain.rs       #   keyring-backed secret storage (replaces Electron safeStorage)
    agent_cmd.rs      #   agent_save_key / agent_load_key / agent_has_key (two-tier: session + keyring)
    libraries_cmd.rs  #   libraries_* commands; emits library:switched / library:none
    zip_cmd.rs        #   library export/import zip
    menu.rs           #   macOS native menu (predefined roles only)
  capabilities/       # Tauri permissions (window controls + dialog)
  tauri.conf.json     # Window/build/bundle config; decorations: false (custom titlebar)
```

**Single source of truth for everything except IO.** Library, agent loop,
all tools, providers, prompts, conversation persistence — all in `shared`,
all run in the renderer for both web and desktop. The Rust shell exists
only to expose the OS file system and the OS keychain through narrow,
scoped commands (`fs_read/write/list/exists/delete`, `agent_save_key`,
`dialog_open_pdf`, etc).

## Storage Format
A library is just a folder:
```
<library-root>/
  papers.csv          # CANONICAL field data (title, authors, status, custom cols…)
  papers/<id>.md      # Notes body only — no frontmatter
  attachments/<id>.pdf
  schema.md           # Column definitions (YAML frontmatter + notes body)
  collections.json    # Collection membership
  <Name>.csv          # Per-collection projection (auto-rebuilt)
```

**`papers.csv` is the source of truth for fields.** Adding/renaming/removing
columns only touches the CSV (and schema.md). `.md` files are free-form notes
and are independent of the row data.

Library bootstrap (`Library._init`) reads CSV in one shot to populate the in-memory
ref Map; the search index (which needs notes body) is built lazily on first
search. A library with old-style frontmatter `.md` files is migrated automatically
on first open: frontmatter is extracted into CSV and stripped from the `.md`.

Paper IDs are `{year}-{lastname}-{titleword}` (e.g. `2017-vaswani-attention`). Generation falls back to `randomBytes` to avoid timestamp collisions on rapid adds.

## IPC Pattern
The IPC contract is `IPreloadApi` in `src/renderer/src/desktop/preloadApi.ts`. Two implementations:
- **Tauri** (`src/renderer/src/tauri/tauriPreload.ts`): wraps `invoke()` / `listen()` over Rust commands.
- **Web** (`src/renderer/src/web/webApi.ts`): same shape, backed by S3Backend + localStorage / IndexedDB.

Renderer code consumes `IApi` (broader surface) from `src/renderer/src/lib/ipc.ts`, where `pickApi()` detects the runtime: `__TAURI_INTERNALS__` → `makeDesktopApi(tauriPreload)`, `__WEB_BUILD__` → `webApi`.

The IPC surface is small and primitive — file IO, keychain, dialogs. There is **no** `papers:*`, `schema:*`, `collections:*`, `agent:send`, or streaming `agent:event` IPC: those are renderer-local. `library:switched` and `library:none` are the only Rust → renderer events.

### Zero-trust file scope
`fs_read/write/list/exists/delete` commands take `(rootId, relPath)` — never absolute paths. `src-tauri/src/scope.rs` maintains a `rootId → absolute root` map (libraries register on add; the conversation store registers `'conversations'` and `'transcripts'` on boot) and rejects any path that escapes its root via `..` or symlinks. If the renderer is compromised, the blast radius is the union of registered roots.

## Theme System
All colors live in CSS variables defined in `src/renderer/src/styles/globals.css`. Two themes:
- **Dark** (default): black background `#0a0a0a`, accent `#FFE99D`
- **Light**: white background `#ffffff`, accent `#58C8F2`

Theme switches by adding/removing the `light` class on `<html>`. Preference is persisted in `localStorage`. Never hard-code hex values in component className — always use `var(--token-name)` (Tailwind arbitrary value syntax: `bg-[var(--bg-elevated)]`).

## Async Dialog API
Native `window.confirm` / `window.prompt` are banned (they look terrible inside a webview). Use the global async helpers:

```ts
import { confirmDialog, promptDialog } from '@/store/dialogs'

const ok = await confirmDialog({
  title: 'Delete paper?',
  message: 'This removes the Markdown file and any attachments.',
  confirmLabel: 'Delete',
  danger: true,
})

const result = await promptDialog({
  title: 'Add library',
  fields: [
    { name: 'name', label: 'Display name', required: true },
    { name: 'path', label: 'Absolute path', required: true },
  ],
})
```

The `DialogHost` component (mounted once in `App.tsx`) renders the active queue. Use this pattern for one-shot prompts/confirms; build a dedicated component when the dialog has a specific UI (e.g. a future "reset all settings" with custom layout).

## Settings Primitives
Tabs in `features/settings/tabs/` compose three small primitives from `components/ui/`:
- `SettingSection` — heading + description + body, auto dividers between rows
- `SettingRow` — label + description on the left, control on the right
- `SettingSegmented` — segmented control (typed-generic over the value union)

Use these for any new setting rather than hand-rolling row layouts. Add a `SettingToggle` primitive when you need an actual on/off control (none yet — the prior placeholder was deleted as YAGNI).

## i18n
The renderer uses i18next:

- `src/renderer/src/lib/i18n.ts` — config + `setLanguage(lang)` / `getCurrentLanguage()` helpers, persists to `localStorage('language')`. Auto-detects from `navigator.language` on first run.
- `src/renderer/src/locales/{en,zh}.json` — flat-ish translation tree. Add new keys here; both languages must be in sync (lint/typecheck won't catch missing keys, only runtime fallback to English).
- `src/shared/agent/prompt.ts` — `buildSystemPrompt(language, ctx)` returns the EN or ZH system-prompt template for the agent. Tool semantics are identical across languages; only the surface wording changes. The renderer-side `Agent` passes the current language when constructing each system prompt.
- Components use `const { t } = useTranslation()` and `t('namespace.key')`. For data-driven labels (e.g. column headers, tab metadata), pass `t` into pure helpers and re-key memoization on `i18n.language` so the labels refresh when the language flips.

## Library Table
The papers list is a TanStack Table v8 (headless) instance. The contract:

- **Column definitions** (`features/library/columns.tsx`): `buildColumns(extras)` returns `ColumnDef<PaperRef>[]` for the core columns plus any user-defined schema extras. Title is `enableResizing: false, enableHiding: false` (always present, always flexible).
- **Persistence** (`features/library/useColumnPersistence.ts`): TanStack's `columnSizing` and `columnVisibility` state piped through `localStorage`, scoped per-library. Key prefix is `verko:column-state:<libraryName>`. **The library schema (`schema.md`, `papers.csv`, paper `.md` files) intentionally never sees these preferences** — keeping the data layer agent-readable is more important than syncing prefs across machines.
- **Header** (`features/library/ColumnHeader.tsx`): renders sort toggle, drag-to-resize handle (right edge), and ⋮ dropdown on hover (Hide / New column). Hidden columns surface again via the 👁 button at the right end of the header bar.
- **Add column** flow: a context-menu "New column" opens a `promptDialog` for name + type and calls `api.schema.addColumn`. Schema changes are persisted (they're real data); only sizing/visibility live in localStorage.

## Window chrome
`tauri.conf.json` sets `decorations: false` and the renderer draws its own titlebar in `components/common/TitleBar.tsx`. macOS gets a native menu via `src-tauri/src/menu.rs` (predefined system roles only — no custom Verko commands; the renderer owns its own keyboard shortcuts). Window dragging is wired explicitly: a `mousedown` handler on the titlebar calls `getCurrentWindow().startDragging()` because Tauri ignores `-webkit-app-region: drag` and the `data-tauri-drag-region` attribute walk is unreliable on webkit2gtk.

## Commands
```bash
npm run dev          # tauri dev — full Tauri app (Rust shell + Vite renderer)
npm run build        # tauri build — bundle .dmg / .msi / .AppImage / .deb
npm run dev:web      # Renderer-only web preview at http://localhost:5173
npm run build:web    # Web build (S3-backed, deployed to GitHub Pages)
npm test             # Run shared-side unit tests (Vitest, node env)
npm run typecheck    # tsc --noEmit on tsconfig.node.json + tsconfig.web.json
npm run lint         # ESLint over src/
npm run lint:fix     # ESLint with --fix
```

`npm run tauri:dev:vite` and `npm run tauri:build:vite` are internal — Tauri invokes them as `beforeDevCommand` / `beforeBuildCommand`.

## Releases
- Tag with `v*` (e.g. `v0.5.0`) → full release. Tag with a semver prerelease suffix (e.g. `v0.5.0-dev.1`) → GitHub prerelease.
- `package.json` and `src-tauri/tauri.conf.json` versions must match — `release-guard.yml` enforces this on PRs to `main`.
- The release workflow runs four matrix jobs (mac arm64, mac intel, win, linux) via `tauri-apps/tauri-action`.

## Testing
- Specs live under `src/shared/paperdb/__tests__/` (Library + schema + LocalBackend integration coverage).
- The `LocalBackend` and `atomicWrite` helpers under `__tests__/helpers/` are **test-only** — production filesystem IO is the Rust shell's job. Don't import them from app code.
- `vitest.config.ts` picks up `src/shared/**/*.test.ts`.
- All tests must pass before committing.
- Tests mount a real `Library` against a fresh `mkdtemp` directory — never mock filesystem boundaries; the storage format IS part of the contract.

## Code Conventions
- **No hardcoded colors** in TSX. Use `bg-[var(--token-name)]` etc.
- **No `window.confirm` / `window.prompt`** — see Async Dialog API above
- **No barrel files** for `paperdb/` and `agent/` — import directly from the submodule (`import { Library } from '../paperdb/store'`). Barrels were removed because they added an extra hop without value
- **CSV is the source of truth** for paper field data; `.md` files are free-form notes
- **Authors** and **tags** in CSV are **semicolon-separated** (`"Vaswani, A.; Ho, J."`), because author names themselves contain commas
- **Keep Rust commands thin** — business logic belongs in `Library` and the agent loop on the renderer side, not in `*_cmd.rs`
- **Two-space indent, single quotes, no semicolons** — locked by `.editorconfig` and existing code; match what's there
- **Component files**: PascalCase (`SettingsModal.tsx`); UI primitives in `components/ui/`: kebab-case (`dialog.tsx`); hooks: camelCase with `use` prefix (`useAgent.ts`)
- **JSDoc** on the major public surfaces (`Library` class entry, `Agent.send`, IPC type contract). Don't JSDoc trivial getters or things the TS signature already explains
- **Comments explain WHY, not WHAT.** If a line of code needs a comment to be understood, rewrite the code first
- **Tests** describe behavior in `it` strings (`it('removes paper from all collections on delete')`), not implementation (`it('calls deleteFile')`)

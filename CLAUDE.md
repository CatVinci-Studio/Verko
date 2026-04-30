# Verko — Claude Code Guide

## Project Overview
Agent-first academic paper management desktop app. Built with Electron + React 19. Storage is plain files in a CSV-first model: `papers.csv` is the canonical store of field data (title, authors, status, custom columns…), `papers/<id>.md` files hold the notes body only (no frontmatter), `schema.md` defines columns. The AI agent runs in-process and reads/writes papers through the same `Library` abstraction the UI uses.

## Tech Stack
- **Runtime**: Electron 41 + electron-vite 6 (beta) + Vite 8
- **Frontend**: React 19, Tailwind CSS 4, shadcn/ui (Radix primitives copied into `components/ui/`)
- **State**: Zustand 5 (`ui`, `library`, `agent`, `dialogs` stores)
- **Data fetching**: TanStack Query v5 over IPC
- **Tables**: TanStack Table v8 (headless) — drives the library paper view
- **Editor**: CodeMirror 6 (Markdown)
- **Search**: MiniSearch (in-memory full-text)
- **Agent**: pluggable provider layer (`src/shared/agent/providers/`) speaking OpenAI / Anthropic / Gemini protocols natively; agent loop runs in the renderer; multi-conversation history persisted under `<userData>/conversations/<id>.json`
- **Tests**: Vitest 4 (Node env; targets `src/{electron,shared}`)
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
    types.ts          # Master type contract (IpcChannels, AgentEvent, …)
    providers.ts      # PROVIDER_DEFINITIONS catalog
    presets.ts        # DEFAULT_AGENT_CONFIG derived from the catalog

  electron/           # Electron main process — zero-trust IO shim (~400 lines)
    scope.ts          #   allowedRoots + resolveScoped (path validation, symlink-safe)
    paperdb/
      backendLocal.ts #   fs-backed StorageBackend (used by main-side bulk ops only)
      importPdf.ts    #   (legacy helper, no longer wired)
      manager.ts      #   LibraryManager — registry + credential store, NO Library cache
      zip.ts          #   exportLibraryZip(backend, …) / importLibraryZip
    libraries/        #   registry.ts (libraries.json) + credentials.ts (safeStorage)
    agent/
      auth.ts         #   API key store: safeStorage (remember=true) or memory (false)
      config.ts       #   electron-store + catalog sync migration
    ipc/              # Tiny IPC handlers — fs / paths / dialog / agent-config / libraries
    index.ts          # App entry, LibraryManager init, IPC registration
    __tests__/        # Vitest specs (Library + scope + zip)

  preload/
    index.ts          # contextBridge → window.api (narrow IPreloadApi surface)

  renderer/src/       # React frontend — owns Library + agent runtime at runtime
    desktop/          # Desktop adapter
      backendIpc.ts   #   StorageBackend over fs:* IPC
      libraryHost.ts  #   Owns active Library, listens for library:switched
      desktopTools.ts #   Tool registry (SHARED_TOOLS + manager tools using IPC)
      desktopApi.ts   #   makeDesktopApi(preload) → full IApi
      preloadApi.ts   #   Type for the narrow preload-bridged surface
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
```

**Single source of truth for everything except IO.** Library, agent loop,
all tools, providers, prompts, conversation persistence — all in `shared`,
all run in the renderer for both web and desktop. Main exists only to
expose the OS file system and the OS keychain through narrow, scoped IPC
channels (`fs:read/write/list/exists/delete`, `keychain` via
`agent:loadKey/saveKey`, `dialog:openPdf`, etc).

This makes the Tauri / Rust port a mechanical exercise: replace `src/electron/`
with a Rust shim that exposes the same IPC surface. No business logic
moves.

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
`IpcChannels` in `shared/types.ts` is the single source of truth for IPC channel names, argument types, and return types. The preload script exposes a narrow `window.api` (typed as `IPreloadApi` in `desktop/preloadApi.ts`); renderer code imports the consumer-facing `IApi` via `src/renderer/src/lib/ipc.ts`, where `pickApi()` wraps the preload surface with `makeDesktopApi()` (or returns `webApi` / a stub).

The IPC surface is small and primitive — file IO, keychain, dialogs, agent config. There is **no** `papers:*`, `schema:*`, `collections:*`, `agent:send`, or streaming `agent:event` IPC: those are renderer-local now. `library:switched` and `library:none` are the only main → renderer events.

### Zero-trust file scope
`fs:read/write/list/exists/delete` IPC takes `(rootId, relPath)` — never absolute paths. `src/electron/scope.ts` maintains a `rootId → absolute root` map (libraries register on add; the conversation store registers `'conversations'` on boot) and rejects any path that escapes its root via `..` or symlinks. If the renderer is compromised, the blast radius is the union of registered roots.

## Theme System
All colors live in CSS variables defined in `src/renderer/src/styles/globals.css`. Two themes:
- **Dark** (default): black background `#0a0a0a`, accent `#FFE99D`
- **Light**: white background `#ffffff`, accent `#58C8F2`

Theme switches by adding/removing the `light` class on `<html>`. Preference is persisted in `localStorage`. Never hard-code hex values in component className — always use `var(--token-name)` (Tailwind arbitrary value syntax: `bg-[var(--bg-elevated)]`).

## Async Dialog API
Native `window.confirm` / `window.prompt` are banned (they look terrible in Electron). Use the global async helpers:

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

## Commands
```bash
npm run dev          # Start full Electron app (main + renderer)
npm run dev:web      # Renderer-only web preview at http://localhost:5173
npm test             # Run main-process unit tests (Vitest, node env)
npm run typecheck    # tsc --noEmit on tsconfig.node.json + tsconfig.web.json
npm run lint         # ESLint over src/
npm run lint:fix     # ESLint with --fix
npm run build        # Production build (electron-vite)
npm run dist:mac     # Build + package macOS DMG (electron-builder)
npm run dist:win     # Build + package Windows installer
npm run dist:linux   # Build + package Linux AppImage
```

## Testing
- Electron-side specs live in `src/electron/__tests__/`; shared specs sit beside their modules under `src/shared/`
- `vitest.config.ts` picks up `src/{electron,shared}/**/*.test.ts` (no renderer tests yet)
- All **39 main-process tests** must pass before committing
- Tests mount a real `Library` against a fresh `mkdtemp` directory — never mock filesystem boundaries; the storage format IS part of the contract

## Code Conventions
- **No hardcoded colors** in TSX. Use `bg-[var(--token-name)]` etc.
- **No `window.confirm` / `window.prompt`** — see Async Dialog API above
- **No barrel files** for `paperdb/` and `agent/` — import directly from the submodule (`import { Library } from '../paperdb/store'`). Barrels were removed because they added an extra hop without value
- **CSV is derived**, not source of truth. `.md` files are authoritative; the CSV index is rebuilt on every write
- **Authors** and **tags** in CSV are **semicolon-separated** (`"Vaswani, A.; Ho, J."`), because author names themselves contain commas
- **Keep IPC handlers thin** — business logic belongs in `Library` and `AgentSession`, not in IPC wrappers
- **Two-space indent, single quotes, no semicolons** — locked by `.editorconfig` and existing code; match what's there
- **Component files**: PascalCase (`SettingsModal.tsx`); UI primitives in `components/ui/`: kebab-case (`dialog.tsx`); hooks: camelCase with `use` prefix (`useAgent.ts`)
- **JSDoc** on the major public surfaces (`Library` class entry, `AgentSession.send`, IPC type contract). Don't JSDoc trivial getters or things the TS signature already explains
- **Comments explain WHY, not WHAT.** If a line of code needs a comment to be understood, rewrite the code first
- **Tests** describe behavior in `it` strings (`it('removes paper from all collections on delete')`), not implementation (`it('calls deleteFile')`)

# Verko — Claude Code Guide

## Project Overview
Agent-first academic paper management desktop app. Built with Electron + React 19. Storage is plain files: one Markdown per paper (YAML frontmatter + notes body), `schema.md` for column definitions (also YAML frontmatter), and a derived `papers.csv` index. The AI agent runs in-process and reads/writes papers through the same `Library` abstraction the UI uses.

## Tech Stack
- **Runtime**: Electron 41 + electron-vite 6 (beta) + Vite 8
- **Frontend**: React 19, Tailwind CSS 4, shadcn/ui (Radix primitives copied into `components/ui/`)
- **State**: Zustand 5 (`ui`, `library`, `agent`, `dialogs` stores)
- **Data fetching**: TanStack Query v5 over IPC
- **Tables**: TanStack Table v8 (headless) — drives the library paper view
- **Editor**: CodeMirror 6 (Markdown)
- **Search**: MiniSearch (in-memory full-text)
- **Agent**: pluggable provider layer (`src/main/agent/providers/`) speaking OpenAI / Anthropic / Gemini protocols natively; multi-conversation history persisted under `<userData>/conversations/<id>.json`
- **Tests**: Vitest 4 (main process only, node env)
- **Package manager**: npm
- **i18n**: i18next + react-i18next; English + 简体中文 (`src/renderer/src/locales/{en,zh}.json`); language preference persists to localStorage and is forwarded to the agent so the system prompt swaps with the UI
- **Style enforcement**: `.editorconfig` (indent / EOL) + TypeScript strict mode (`noUnusedLocals`, `noUnusedParameters` on) + ESLint 10 flat config (`eslint.config.js` — JS/TS recommended + `react-hooks/{rules-of-hooks,exhaustive-deps}` + `react-refresh/only-export-components`)

## Repository Layout
```
src/
  shared/             # Runtime-neutral code — runs in main, renderer, AND browser
    paperdb/          # Library + pure helpers (csv/frontmatter/schema/search/id/import)
      store.ts        #   Library class (operates on the StorageBackend interface)
      backend.ts      #   StorageBackend interface (Uint8Array + ReadableStream)
      backendS3.ts    #   S3-compatible backend (AWS SDK v3, browser-safe)
    agent/            # Agent loop, system prompt, provider adapters
      loop.ts         #   runAgentLoop(provider, dispatchTool, …) — tool-agnostic
      prompt.ts       #   buildSystemPrompt(language, ctx) — EN + ZH
      providers/      #   openai/anthropic/gemini SDK adapters; dangerouslyAllowBrowser
                      #   is set in browser so user keys go straight to the LLM provider
    types.ts          # Master type contract (PaperRef, IpcChannels, AgentEvent, …)
    providers.ts      # PROVIDER_DEFINITIONS catalog (id, name, defaults, fields)
    presets.ts        # DEFAULT_AGENT_CONFIG derived from the catalog

  main/               # Electron main process (Node.js only)
    paperdb/
      backendLocal.ts #   fs-backed StorageBackend
      importPdf.ts    #   PDF copy from arbitrary fs path (uses fs.copyFile)
      manager.ts      #   LibraryManager: registry + credential store + Library cache
      zip.ts          #   Library export/import (.zip) via JSZip
    libraries/        # registry.ts (libraries.json) + credentials.ts (safeStorage)
    agent/
      session.ts      #   AgentSession: per-window agent gateway
      tools.ts        #   Full tool registry + dispatch (uses LibraryManager)
      tools/          #   web_fetch (web.ts), view_pdf_page + read_document (documents.ts)
      conversations.ts#   per-conversation JSON files in userData
      auth.ts         #   API key store: safeStorage (remember=true) or memory (false)
      config.ts       #   electron-store + catalog sync migration
    ipc/              # Thin handler wrappers over Library + AgentSession + manager
    index.ts          # App entry, LibraryManager init, IPC registration
    __tests__/        # Vitest specs for main-process modules

  preload/
    index.ts          # contextBridge → window.api

  renderer/src/       # React frontend
    web/              # Web-build adapter — re-uses shared Library + agent loop
      webApi.ts       #   Wraps shared Library + WebAgent into the IApi shape
      webAgent.ts     #   Drives shared runAgentLoop with localStorage conversations
      webTools.ts     #   Reduced toolset: read/search/list/web_fetch (S3 read-only)
      apiKeys.ts      #   Per-provider key store (localStorage / memory)
      credentials.ts  #   S3 credential store (IndexedDB)
    store/            # Zustand stores: library, ui, agent, dialogs
    features/         # library/, paper/, agent/, command/, settings/, dialogs/, onboarding/
    components/ui/    # shadcn primitives (kebab-case)
    components/common/# TitleBar, ChipStatus, ChipTag
    lib/              # ipc.ts, utils.ts, i18n.ts
    locales/          # en.json + zh.json
    styles/           # globals.css (CSS variables for dark/light theme)
```

The hard-fork between desktop and web is **only** the StorageBackend
implementation (LocalBackend in main; S3Backend works in both) and a
handful of platform-specific tools (importPdf, view_pdf_page,
read_document, list_libraries / switch_library — main-only). Library,
agent loop, providers, prompt, S3Backend are all single-source.

## Storage Format
A library is just a folder:
```
<library-root>/
  papers/             # One .md file per paper, named by ID
  attachments/        # PDF files named <id>.pdf
  papers.csv          # Auto-rebuilt projection (do not edit manually)
  schema.md           # Column definitions (YAML frontmatter + notes body)
  collections.json    # Collection membership
```
Paper IDs are `{year}-{lastname}-{titleword}` (e.g. `2017-vaswani-attention`). Generation falls back to `randomBytes` to avoid timestamp collisions on rapid adds.

## IPC Pattern
`IpcChannels` in `shared/types.ts` is the single source of truth for IPC channel names, argument types, and return types. The preload script exposes `window.api`; renderer code imports the typed wrapper via `src/renderer/src/lib/ipc.ts`. In web preview mode (`npm run dev:web`) that wrapper falls back to a stub with sample data so the React tree boots without Electron.

Streaming events (main → renderer) go through `ipcRenderer.on` directly with the channel name `agent:event` or `library:switched`, not through the request/response `IpcChannels` map.

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
- `src/main/agent/prompt.ts` — `buildSystemPrompt(language, ctx)` returns the EN or ZH system-prompt template for the agent. Tool semantics are identical across languages; only the surface wording changes. The renderer's current language is forwarded via the third arg of `agent:send` so the prompt swaps when the user changes language.
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
- Main process specs live in `src/main/__tests__/`
- `vitest.config.ts` only picks up `src/main/**/*.test.ts` (no renderer tests yet)
- All **39 main-process tests** must pass before committing
- Tests mount a real `Library` against a fresh `mkdtemp` directory — never mock filesystem boundaries; the storage format IS part of the contract

## Code Conventions
- **No hardcoded colors** in TSX. Use `bg-[var(--token-name)]` etc.
- **No `window.confirm` / `window.prompt`** — see Async Dialog API above
- **No barrel files** for `paperdb/` and `agent/` — import directly from the submodule (`import { Library } from '../paperdb/store'`). Barrels were removed because they added an extra hop without value
- **CSV is derived**, not source of truth. `.md` files are authoritative; the CSV index is rebuilt on every write
- **Authors** in frontmatter are **semicolon-separated** (`"Vaswani, A.; Ho, J."`), because author names themselves contain commas
- **Keep IPC handlers thin** — business logic belongs in `Library` and `AgentSession`, not in IPC wrappers
- **Two-space indent, single quotes, no semicolons** — locked by `.editorconfig` and existing code; match what's there
- **Component files**: PascalCase (`SettingsModal.tsx`); UI primitives in `components/ui/`: kebab-case (`dialog.tsx`); hooks: camelCase with `use` prefix (`useAgent.ts`)
- **JSDoc** on the major public surfaces (`Library` class entry, `AgentSession.send`, IPC type contract). Don't JSDoc trivial getters or things the TS signature already explains
- **Comments explain WHY, not WHAT.** If a line of code needs a comment to be understood, rewrite the code first
- **Tests** describe behavior in `it` strings (`it('removes paper from all collections on delete')`), not implementation (`it('calls deleteFile')`)

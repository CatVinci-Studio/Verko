# PaperwithAgent — Claude Code Guide

## Project Overview
Agent-first academic paper management desktop app. Built with Electron + React 19. Storage is plain files: one Markdown per paper (YAML frontmatter + notes body), plus a derived `papers.csv` index and `schema.json` column definition.

## Tech Stack
- **Runtime**: Electron 41 + electron-vite 5
- **Frontend**: React 19, Tailwind CSS 3, shadcn/ui (Radix UI primitives)
- **State**: Zustand 5 (ui.ts, library.ts, agent.ts stores)
- **Data fetching**: TanStack Query v5 for IPC calls
- **Editor**: CodeMirror 6 (Markdown)
- **Search**: MiniSearch (in-memory full-text)
- **Agent**: OpenAI-compatible streaming API via `openai` SDK v4
- **Tests**: Vitest 3 (main process: node env, renderer: happy-dom)
- **Package manager**: pnpm

## Repository Layout
```
src/
  main/           # Electron main process (Node.js)
    paperdb/      # Library, schema, CSV, search, import, ID generation
    agent/        # AgentSession, tool loop, tools, auth, config
    ipc/          # IPC handler registration (thin wrappers over paperdb/agent)
    index.ts      # App entry, LibraryManager init, IPC registration
  preload/
    index.ts      # contextBridge → window.api (typed via IApi in ipc.ts)
  renderer/src/   # React frontend
    store/        # Zustand stores: library.ts, ui.ts, agent.ts
    features/     # Feature folders: library/, paper/, agent/, command/, settings/
    components/   # ui/ (shadcn), common/ (ChipStatus, ChipTag)
    lib/          # ipc.ts (window.api wrapper + web stub), utils.ts
    styles/       # globals.css (CSS variables for dark/light theme)
  shared/
    types.ts      # Master type contract (PaperRef, IpcChannels, AgentEvent, …)
    presets.ts    # Default agent provider presets
```

## Storage Format
Each library is a folder:
```
<library-root>/
  papers/           # One .md file per paper, named by ID
  attachments/      # PDF files named <id>.pdf
  papers.csv        # Auto-rebuilt projection (do not edit manually)
  schema.json       # Column definitions
```
Paper IDs are generated as `{year}-{lastname}-{titleword}` (e.g. `2017-vaswani-attention`).

## IPC Pattern
`IpcChannels` in `shared/types.ts` is the single source of truth for all IPC channel names, argument types, and return types. The preload exposes `window.api` which renderer code imports via `src/renderer/src/lib/ipc.ts`. In web preview mode (`pnpm dev:web`) that file falls back to a mock stub with sample data.

## Theme System
Colors live entirely in CSS variables defined in `globals.css`. Two themes:
- **Dark** (default): black background (`#0a0a0a`), accent `#FFE99D`
- **Light**: white background (`#ffffff`), accent `#58C8F2`

Theme is toggled by adding/removing the `light` class on `<html>`. Preference is stored in `localStorage`. Never use hardcoded hex values in component className strings — always use `var(--token-name)`.

## Commands
```bash
pnpm dev          # Start full Electron app (main + renderer)
pnpm dev:web      # Renderer-only web preview at localhost:5173
pnpm test         # Run main-process unit tests (Vitest, node env)
pnpm typecheck    # TypeScript check (both tsconfig.node.json + tsconfig.web.json)
pnpm build        # Production build
pnpm dist:mac     # Build + package macOS DMG
```

## Testing
- Main process tests live in `src/main/__tests__/`
- Renderer tests live in `src/renderer/src/__tests__/`
- Run main tests: `npx vitest run` (uses `vitest.config.ts`)
- Run renderer tests: `npx vitest run --config vitest.renderer.config.ts`
- All 39 main-process tests must pass before committing

## Key Conventions
- **No hardcoded colors** in TSX files. Use CSS variables via `bg-[var(--token)]`.
- **No MCP server** — the agent runs in-process, reads CSV/MD directly, writes through `Library` methods.
- **CSV is derived**, not source of truth. The `.md` files are authoritative; CSV is rebuilt on every write.
- **Authors** in frontmatter are semicolon-separated strings (`"Vaswani, A.; Ho, J."`), not comma-separated, because author names themselves contain commas.
- **IDs** must be unique. `generateId` uses `randomBytes` fallback to avoid timestamp collisions on rapid adds.
- Keep IPC handlers thin — business logic stays in `Library` and `AgentSession`.

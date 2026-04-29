# Verko

**An agent-first desktop app for managing academic papers.**  
Plain-file storage (Markdown + CSV), an embedded AI agent that can read and write your library, and a clean interface inspired by tools you already love.

[English](./README.md) · [中文](./README.zh.md)

[![CI](https://github.com/CatVinci-Studio/Verko/actions/workflows/ci.yml/badge.svg)](https://github.com/CatVinci-Studio/Verko/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![Platform](https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux-lightgrey)](https://github.com/CatVinci-Studio/Verko/releases)
[![Version](https://img.shields.io/github/v/release/CatVinci-Studio/Verko?include_prereleases)](https://github.com/CatVinci-Studio/Verko/releases)

---

## What is this?

Verko is a desktop research companion. Instead of locking your data in a proprietary database, everything lives as readable files on disk — one Markdown file per paper (YAML frontmatter + notes), a derived CSV index, and a `schema.json` for custom columns.

The agent sits at the center: it can search, annotate, compare, and organize your papers through natural language, with direct read/write access to your library files.

---

## Features

- **Agent-first** — ⌘K opens a direct chat. The agent reads your CSV index, individual paper notes, and writes changes back through the same file layer your UI uses.
- **Plain-file storage** — Markdown + CSV. Open in any text editor. Version-control with Git. No lock-in.
- **Collections** — Group papers into named collections. A paper can belong to multiple collections; notes are always shared.
- **Custom schema** — Add typed columns (text, number, date, select, tags…) to your papers. The CSV is rebuilt automatically on every write.
- **PDF viewer** — Attach and read PDFs inside the app.
- **Full-text search** — In-memory MiniSearch index, updated on every library change.
- **Multiple libraries** — Switch between library roots. Each library is a self-contained folder.
- **Dark & light themes** — Amber accent in dark mode, cyan in light.

---

## Installation

### Pre-built releases

Download the latest installer for your platform from [Releases](https://github.com/CatVinci-Studio/Verko/releases).

| Platform | File |
|----------|------|
| macOS (Apple Silicon / Intel) | `Verko-x.x.x.dmg` |
| Windows | `Verko-Setup-x.x.x.exe` |
| Linux | `Verko-x.x.x.AppImage` |

### Build from source

**Prerequisites:** Node.js 20+, npm 10+

```bash
git clone https://github.com/CatVinci-Studio/Verko.git
cd Verko
npm install
npm run dev       # Start in dev mode (Electron)
```

**Production build:**

```bash
npm run build       # Compile renderer + main process
npm run dist:mac    # Package macOS DMG
npm run dist:win    # Package Windows installer
npm run dist:linux  # Package Linux AppImage
```

---

## Quick Start

1. **Open the app** — it creates a default library in `~/Verko` on first launch.
2. **Add a paper** — click *New paper* at the bottom of the list, or use *Import DOI* to fetch metadata automatically.
3. **Open Settings → AI Agent** — paste your API key for your preferred OpenAI-compatible provider (OpenAI, DeepSeek, Ollama, OpenRouter, LM Studio, etc.).
4. **Press ⌘K** — ask the agent anything about your library.

---

## Library format

Your data is always yours. A library is just a folder:

```
my-library/
  papers/
    2017-vaswani-attention.md   ← YAML frontmatter + notes body
    2020-brown-gpt3.md
  attachments/
    2017-vaswani-attention.pdf
  papers.csv                    ← Auto-rebuilt index (do not edit manually)
  schema.json                   ← Column definitions
  collections.json              ← Collection membership
```

Each paper file looks like:

```markdown
---
id: 2017-vaswani-attention
title: "Attention Is All You Need"
authors: ["Vaswani, A.", "Shazeer, N."]
year: 2017
status: read
tags: [transformers, attention, nlp]
rating: 5
---

## Notes

The key insight is replacing recurrence with self-attention...
```

---

## Agent capabilities

The agent has access to tools scoped to your active library:

| Tool | Description |
|------|-------------|
| `search_papers` | Full-text search across titles, authors, and notes |
| `get_paper` | Read a paper's full metadata and notes |
| `update_paper` | Patch any paper field (title, status, tags, notes…) |
| `list_collections` | List all collections with paper counts |
| `add_to_collection` | Add a paper to a named collection |
| `read_file` | Read any file within the library root |
| `write_file` | Write any file within the library root |
| `list_files` | List files in a library subdirectory |

All file operations are sandboxed to the library root — the agent cannot access files outside your library.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Electron 41 |
| Build | electron-vite 5 |
| Frontend | React 19 + Tailwind CSS 3 |
| UI primitives | Radix UI (shadcn/ui) |
| State | Zustand 5 |
| Data fetching | TanStack Query v5 |
| Editor | CodeMirror 6 |
| Search | MiniSearch |
| Agent | OpenAI SDK v4 (streaming) |
| Testing | Vitest 3 |
| Packaging | electron-builder |

---

## Contributing

Contributions are welcome. Please read the [contributing guide](.github/CONTRIBUTING.md) before opening a PR.

- Bug reports → [Bug Report](.github/ISSUE_TEMPLATE/bug_report.yml)
- Feature requests → [Feature Request](.github/ISSUE_TEMPLATE/feature_request.yml)
- PRs → target the `dev` branch, not `main`

---

## License

[MIT](./LICENSE) © CatVinci Studio

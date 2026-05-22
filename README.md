<p align="center">
  <img src="docs/Logo.jpg" alt="Verko" width="120" height="120" />
</p>

<h1 align="center">Verko</h1>

<p align="center">
  <strong>Agent-first paper management.</strong><br>
  Your papers live as plain CSV + Markdown files. Your AI assistant of choice reads, writes, and answers questions about them.
</p>

<p align="center">
  <a href="https://github.com/CatVinci-Studio/Verko/releases/latest"><strong>Download</strong></a> ·
  <a href="https://catvinci-studio.github.io/Verko/"><strong>Try in browser</strong></a> ·
  <a href="./README.zh.md">中文</a>
</p>

<p align="center">
  <a href="https://github.com/CatVinci-Studio/Verko/releases/latest"><img alt="version" src="https://img.shields.io/github/v/release/CatVinci-Studio/Verko"></a>
  <img alt="platform" src="https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux%20%7C%20Web-lightgrey">
  <a href="./LICENSE"><img alt="license" src="https://img.shields.io/badge/license-MIT-yellow"></a>
</p>

---

## What it is

A desktop and web app for organizing academic papers. Your library is a folder of plain CSV + Markdown files — no proprietary database, no lock-in. An AI agent of your choice reads and writes that library through the same files you see.

## Why

- **Your data stays yours.** One row per paper in `papers.csv`, one Markdown file per paper for notes. Open in any editor. Version-control with Git.
- **AI does the busywork.** Ask in natural language: *"summarize my unread NLP papers"*, *"tag the diffusion ones"*, *"import this arXiv link"*. The agent has direct access to your files.
- **Bring your own model.** OpenAI, Claude, Gemini, or any OpenAI-compatible endpoint — paste an API key, switch any time.
- **Works online too.** The web build runs the full agent against any S3-compatible bucket — same UI, same tools, same model providers.

## Install

### Desktop

| Platform | Installer |
|---|---|
| macOS (Apple Silicon) | `Verko_X.Y.Z_aarch64.dmg` |
| macOS (Intel) | `Verko_X.Y.Z_x64.dmg` |
| Windows | `Verko_X.Y.Z_x64-setup.exe` (NSIS) or `_x64_en-US.msi` (WiX) |
| Linux | `Verko_X.Y.Z_amd64.AppImage` · `_amd64.deb` · `Verko-X.Y.Z-1.x86_64.rpm` |

→ Get the latest at [Releases](https://github.com/CatVinci-Studio/Verko/releases/latest). Builds are unsigned for now — first launch may need a right-click → Open on macOS, or "More info → Run anyway" on Windows SmartScreen.

### Web

[catvinci-studio.github.io/Verko](https://catvinci-studio.github.io/Verko/) — connect any S3-compatible bucket (AWS S3, Cloudflare R2, Backblaze B2, MinIO). Your bucket needs CORS allowed for the page origin. Conversation history and API keys are stored in your browser.

## Quick start

1. Launch Verko → pick **Open existing folder** or **Create new local library** (web build: **Connect S3** instead).
2. Open **Settings → General**, choose a provider, paste an API key, click **Test connection**.
3. Press **⌘K** for the command palette or open the Agent panel from the sidebar — ask anything about your library.

## Your library, on disk

```
my-library/
  papers.csv             ← canonical store of every field for every paper
  papers/
    2017-vaswani-attention.md   ← notes body for that paper, pure Markdown
  attachments/
    2017-vaswani-attention.pdf
  schema.md              ← column definitions (incl. user-added custom columns)
  collections.json       ← collection membership
  <CollectionName>.csv   ← per-collection projection (auto-rebuilt)
```

`papers.csv` is the source of truth for fields (title / authors / year / status / tags / custom columns). `.md` files are free-form notes — no frontmatter — and are independent of the row data. Adding or renaming a column only touches the CSV and `schema.md`. IDs follow `{year}-{lastname}-{titleword}` (e.g. `2017-vaswani-attention`).

## What the agent can do

Out of the box:

- **Search and summarize** your library
- **Add / update** papers, including arXiv import
- **Read PDFs** — page text or rendered pages (with vision-capable models, for figures / equations / tables)
- **Manage collections and tags**, including creating new collections on first add
- **Take notes** in section-aware ways that preserve existing content
- **Run user-authored skills** — Markdown workflow templates loaded on demand

Tools are sandboxed to your active library; the agent can't reach files outside.

## Build from source

```bash
git clone https://github.com/CatVinci-Studio/Verko.git
cd Verko
npm install

npm run dev          # tauri dev — full desktop app
npm run dev:web      # vite preview on http://localhost:5173 (web build)
npm run build        # tauri build — produces installers in src-tauri/target/release/bundle/
npm run build:web    # static web build → dist-web/
npm test             # vitest unit tests against the shared Library
npm run typecheck    # tsc --noEmit on web + node configs
npm run lint         # eslint over src/
```

Requires Node 20+ and a Rust toolchain (`rustup default stable`). On Linux also: `libwebkit2gtk-4.1-dev`, `libgtk-3-dev`, `libayatana-appindicator3-dev`, `librsvg2-dev`, `libsoup-3.0-dev`. Codebase layout: [CLAUDE.md](./CLAUDE.md).

## License

[MIT](./LICENSE) © CatVinci Studio

# Contributing to PaperwithAgent

Thanks for your interest in contributing! Here's everything you need to know.

## Branch strategy

| Branch | Purpose |
|--------|---------|
| `main` | Stable releases only. Never commit directly. |
| `dev` | Active development. All PRs should target this branch. |

## Development setup

```bash
git clone https://github.com/CatVinci-Studio/PaperwithAgent.git
cd PaperwithAgent
npm install
npm run dev
```

## Before submitting a PR

```bash
npm run typecheck   # Must pass with 0 errors
npm test            # All 39 main-process tests must pass
```

## Commit style

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add PDF annotation support
fix: prevent crash when library path contains spaces
docs: update agent tool reference table
refactor: extract paper ID generation into util
chore: bump electron to 41.3.1
```

## Code conventions

- **No hardcoded colors** in TSX files — always use `var(--token-name)` CSS variables.
- **No inline comments** explaining what the code does — only add a comment when the *why* is non-obvious.
- **IPC handlers stay thin** — business logic belongs in `Library` or `AgentSession`, not in IPC handlers.
- **CSV is derived** — `.md` files are the source of truth; CSV is rebuilt on every write.

## Reporting bugs

Use the [Bug Report](.github/ISSUE_TEMPLATE/bug_report.yml) template. Include version, platform, reproduction steps, and logs.

## Requesting features

Use the [Feature Request](.github/ISSUE_TEMPLATE/feature_request.yml) template. Describe the problem first, then your proposed solution.

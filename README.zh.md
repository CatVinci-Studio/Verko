# Verko

**以 Agent 为核心的学术论文管理桌面应用。**  
原始文件存储（Markdown + CSV），内嵌 AI Agent 可直接读写论文库，界面简洁高效。

[English](./README.md) · [中文](./README.zh.md)

[![CI](https://github.com/CatVinci-Studio/Verko/actions/workflows/ci.yml/badge.svg)](https://github.com/CatVinci-Studio/Verko/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![Platform](https://img.shields.io/badge/平台-macOS%20%7C%20Windows%20%7C%20Linux-lightgrey)](https://github.com/CatVinci-Studio/Verko/releases)

---

## 这是什么？

Verko 是一个面向研究者的桌面工具。数据不会被锁在私有数据库中——每篇论文对应磁盘上一个 Markdown 文件（YAML 元数据 + 笔记正文），并派生出 CSV 索引和 `schema.json` 自定义列定义。

Agent 处于核心位置：它可以通过自然语言搜索、标注、比较和整理你的论文，并通过与界面共享的同一文件层直接读写数据。

---

## 功能特性

- **Agent 优先** — ⌘K 直接打开对话框。Agent 可读取 CSV 索引、单篇论文笔记，并将修改写回文件。
- **原始文件存储** — Markdown + CSV，用任何文本编辑器打开，用 Git 做版本管理，无绑定风险。
- **Collection 分组** — 将论文组织到命名的集合中，一篇论文可属于多个集合，笔记始终共享。
- **自定义 Schema** — 为论文添加自定义列（文本、数字、日期、选择、标签等），CSV 在每次写入后自动重建。
- **PDF 阅读器** — 在应用内附加并阅读 PDF。
- **全文搜索** — 基于 MiniSearch 的内存索引，每次库变更后自动更新。
- **多库管理** — 在不同的库根目录之间切换，每个库是自包含的文件夹。
- **深色 / 浅色主题** — 深色模式使用琥珀色强调色，浅色模式使用青色强调色。

---

## 安装

### 预构建版本

从 [Releases](https://github.com/CatVinci-Studio/Verko/releases) 下载对应平台的安装包。

| 平台 | 文件 |
|------|------|
| macOS（Apple Silicon / Intel） | `Verko-x.x.x.dmg` |
| Windows | `Verko-Setup-x.x.x.exe` |
| Linux | `Verko-x.x.x.AppImage` |

### 从源码构建

**依赖：** Node.js 20+，npm 10+

```bash
git clone https://github.com/CatVinci-Studio/Verko.git
cd Verko
npm install
npm run dev       # 以开发模式启动（Electron）
```

**生产构建：**

```bash
npm run build       # 编译渲染进程 + 主进程
npm run dist:mac    # 打包 macOS DMG
npm run dist:win    # 打包 Windows 安装包
npm run dist:linux  # 打包 Linux AppImage
```

---

## 快速上手

1. **打开应用** — 首次启动时会在 `~/Verko` 创建默认库。
2. **添加论文** — 点击列表底部的「New paper」，或使用「Import DOI」自动抓取元数据。
3. **打开 设置 → AI Agent** — 粘贴你偏好的 OpenAI 兼容服务的 API Key（支持 OpenAI、DeepSeek、Ollama、OpenRouter、LM Studio 等）。
4. **按 ⌘K** — 用自然语言向 Agent 提问。

---

## 数据格式

数据永远属于你。一个库就是一个普通文件夹：

```
my-library/
  papers/
    2017-vaswani-attention.md   ← YAML 元数据 + 笔记正文
    2020-brown-gpt3.md
  attachments/
    2017-vaswani-attention.pdf
  papers.csv                    ← 自动重建的索引（请勿手动编辑）
  schema.json                   ← 列定义
  collections.json              ← Collection 成员关系
```

每篇论文文件的格式示例：

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

## 笔记

核心思想是用自注意力机制替代循环结构……
```

---

## Agent 能力

Agent 拥有访问当前激活库的一组工具：

| 工具 | 说明 |
|------|------|
| `search_papers` | 在标题、作者、笔记中全文搜索 |
| `get_paper` | 读取论文的完整元数据和笔记 |
| `update_paper` | 修改任意字段（标题、状态、标签、笔记等） |
| `list_collections` | 列出所有 Collection 及其论文数量 |
| `add_to_collection` | 将论文添加到指定 Collection |
| `read_file` | 读取库根目录内的任意文件 |
| `write_file` | 写入库根目录内的任意文件 |
| `list_files` | 列出库某子目录下的文件 |

所有文件操作均沙箱化在库根目录内——Agent 无法访问库外的文件。

---

## 技术栈

| 层次 | 技术 |
|------|------|
| 运行时 | Electron 41 |
| 构建工具 | electron-vite 5 |
| 前端框架 | React 19 + Tailwind CSS 3 |
| UI 基础组件 | Radix UI（shadcn/ui） |
| 状态管理 | Zustand 5 |
| 数据请求 | TanStack Query v5 |
| 编辑器 | CodeMirror 6 |
| 搜索 | MiniSearch |
| Agent | OpenAI SDK v4（流式） |
| 测试 | Vitest 3 |
| 打包 | electron-builder |

---

## 参与贡献

欢迎贡献代码，请在提交 PR 前阅读[贡献指南](.github/CONTRIBUTING.md)。

- 报告 Bug → [Bug 报告模板](.github/ISSUE_TEMPLATE/bug_report.yml)
- 功能请求 → [功能请求模板](.github/ISSUE_TEMPLATE/feature_request.yml)
- PR → 请以 `dev` 分支为目标，而非 `main`

---

## 许可证

[MIT](./LICENSE) © CatVinci Studio

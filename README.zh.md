<p align="center">
  <img src="docs/Logo.jpg" alt="Verko" width="120" height="120" />
</p>

<h1 align="center">Verko</h1>

<p align="center">
  <strong>以 Agent 为中心的论文管理工具。</strong><br>
  论文以纯 CSV + Markdown 文件存储。AI 助手直接读写你的库,并基于它回答问题。
</p>

<p align="center">
  <a href="https://github.com/CatVinci-Studio/Verko/releases/latest"><strong>下载</strong></a> ·
  <a href="https://catvinci-studio.github.io/Verko/"><strong>在线试用</strong></a> ·
  <a href="./README.md">English</a>
</p>

<p align="center">
  <a href="https://github.com/CatVinci-Studio/Verko/releases/latest"><img alt="version" src="https://img.shields.io/github/v/release/CatVinci-Studio/Verko"></a>
  <img alt="platform" src="https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux%20%7C%20Web-lightgrey">
  <a href="./LICENSE"><img alt="license" src="https://img.shields.io/badge/license-MIT-yellow"></a>
</p>

---

## 这是什么

一个学术论文管理桌面 + 网页应用。论文库就是一个普通文件夹,里面是 CSV + Markdown 文件 —— 没有专有数据库,没有锁定。任意 AI 模型都能通过你看到的同一份文件读写你的库。

## 为什么

- **数据是你的。** 一行一篇论文存在 `papers.csv`,每篇论文一个 Markdown 笔记文件。任意编辑器能开,Git 可版本化。
- **杂活交给 AI。** 自然语言提问:*"总结我没读的 NLP 论文"*、*"给扩散模型的论文打标签"*、*"导入这篇 arXiv"*。Agent 直接操作你的文件。
- **自带模型。** OpenAI、Claude、Gemini,或任何 OpenAI 兼容端点 —— 粘贴 API key,随时切换。
- **网页版同样能用。** 网页版连接 S3 兼容存储后,同样跑完整的 agent —— 同一套 UI、同一套工具、同一套模型提供商。

## 安装

### 桌面端

| 平台 | 安装包 |
|---|---|
| macOS (Apple Silicon) | `Verko_X.Y.Z_aarch64.dmg` |
| macOS (Intel) | `Verko_X.Y.Z_x64.dmg` |
| Windows | `Verko_X.Y.Z_x64-setup.exe`(NSIS)或 `_x64_en-US.msi`(WiX) |
| Linux | `Verko_X.Y.Z_amd64.AppImage` · `_amd64.deb` · `Verko-X.Y.Z-1.x86_64.rpm` |

→ 在 [Releases](https://github.com/CatVinci-Studio/Verko/releases/latest) 下载最新版。当前未签名,首次启动 macOS 需右键「打开」绕过 Gatekeeper,Windows SmartScreen 选「更多信息 → 仍要运行」。

### 网页版

[catvinci-studio.github.io/Verko](https://catvinci-studio.github.io/Verko/) —— 连接 S3 兼容存储(AWS S3、Cloudflare R2、Backblaze B2、MinIO)。你的 bucket 需要给页面源域名开 CORS。对话历史和 API key 存在浏览器本地。

## 快速开始

1. 打开 Verko → 选择**打开已有文件夹**或**新建本地库**(网页版改为**连接 S3**)。
2. 进入**设置 → 通用**,选模型提供商,粘贴 API key,点**测试连接**。
3. 按 **⌘K** 打开命令面板,或从侧边栏打开 Agent 面板,直接问关于你库的任何问题。

## 库的磁盘结构

```
my-library/
  papers.csv             ← 所有论文所有字段的权威来源
  papers/
    2017-vaswani-attention.md   ← 这篇论文的笔记正文,纯 Markdown
  attachments/
    2017-vaswani-attention.pdf
  schema.md              ← 列定义(含用户自定义列)
  collections.json       ← 合集成员关系
  <合集名>.csv           ← 每个合集的投影(自动重建)
```

`papers.csv` 是字段(title / authors / year / status / tags / 自定义列)的唯一权威来源。`.md` 文件是自由格式的笔记 —— 没有 frontmatter —— 与行数据彼此独立。增删改列只改 CSV 和 `schema.md`。ID 格式:`{year}-{lastname}-{titleword}`(例如 `2017-vaswani-attention`)。

## Agent 能做什么

开箱即用:

- **搜索 + 总结** 你的库
- **添加 / 更新** 论文,支持 arXiv 导入
- **读 PDF** —— 页内文本或渲染页面(配视觉模型读图表/公式/表格)
- **管理合集和标签**,首次 add 自动建合集
- **写笔记**,section 感知,保留旧内容
- **运行用户编写的 skill** —— Markdown 工作流模板,按需加载

工具沙箱在当前激活的库里,Agent 摸不到外面的文件。

## 从源码构建

```bash
git clone https://github.com/CatVinci-Studio/Verko.git
cd Verko
npm install

npm run dev          # tauri dev — 桌面端
npm run dev:web      # vite 预览 http://localhost:5173(网页版)
npm run build        # tauri build — 安装包输出到 src-tauri/target/release/bundle/
npm run build:web    # 静态网页构建 → dist-web/
npm test             # vitest 单测,跑共享 Library 模块
npm run typecheck    # tsc --noEmit
npm run lint         # eslint 全 src/
```

需要 Node 20+ 和 Rust 工具链(`rustup default stable`)。Linux 还需要 `libwebkit2gtk-4.1-dev`、`libgtk-3-dev`、`libayatana-appindicator3-dev`、`librsvg2-dev`、`libsoup-3.0-dev`。代码结构见 [CLAUDE.md](./CLAUDE.md)。

## License

[MIT](./LICENSE) © CatVinci Studio

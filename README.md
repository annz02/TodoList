# TodoList

<p align="center">
  <img src="public/logo.png" alt="TodoList Logo" width="160">
</p>

<p align="center">
  <a href="https://github.com/annz02/TodoList-Ann/releases"><img src="https://img.shields.io/github/v/release/annz02/TodoList-Ann?style=flat-square&color=3b82f6" alt="Release"></a>
  <a href="https://github.com/annz02/TodoList-Ann/releases"><img src="https://img.shields.io/github/downloads/annz02/TodoList-Ann/total?style=flat-square&color=10b981" alt="Downloads"></a>
  <a href="LICENSE"><img src="https://img.shields.io/github/license/annz02/TodoList-Ann?style=flat-square&color=8b5cf6" alt="License"></a>
  <a href="https://github.com/annz02/TodoList-Ann/releases"><img src="https://img.shields.io/badge/platform-Windows%20%7C%20macOS-06b6d4?style=flat-square" alt="Platform"></a>
  <a href="https://github.com/annz02/TodoList-Ann/stargazers"><img src="https://img.shields.io/github/stars/annz02/TodoList-Ann?style=flat-square&color=f59e0b" alt="Stars"></a>
</p>

TodoList 是一款基于 Vue 3、TypeScript 与 Tauri v2 (Rust) 构建的高性能桌面待办事项管理与 AI Agent 智能工作助理。

项目专注于个人效能管理与开发者日常工作流的深度整合，提供清晰流畅的清单与日历双主视图，内置支持自主工具调用的任务型智能体（Task-Oriented AI Agent），并深度打通本地 Git 代码仓库，实现开发进度自动追踪与结构化工作日报一键生成。

## 功能矩阵

| 模块 | 核心能力 | 架构实现与边界 |
|---|---|---|
| 待办与日程管理 | 任务创建、编辑、状态流转、优先级标记与分类管理；开始/截止时间规划；月度日历视图（CalendarView）与清单视图无缝协同 | 前端响应式状态管理，本地持久化存储，毫秒级响应 |
| AI Agent 工作台 | 自然语言操作待办（Tool Calling 增删改查）；多轮 ReAct 推理链；实时联网检索（Bocha / Tavily）与网页精读；可视化步骤追踪 | 基于 OpenAI 协议与 DeepSeek DSML 标签解析；内置 Rust 原生代理网络中继解决跨域与网络限制 |
| Git 协同与日报生成 | 本地 Git 仓库关联与远程链接解析；当日 Commit 提交日志自动抓取与清洗；规则算法/大模型双模工作日报生成 | Rust 后端执行本地 git 指令提取与分析，前端聚合排版与一键复制 |
| 桌面原生集成 | 系统原生桌面通知；全局快捷键加速；深浅色自适应主题；原生文件与目录选择器 | 基于 Tauri v2 原生插件生态与 Rust 系统级 API 调用 |
| 自动升级与安全 | 应用内检测版本更新；跨版本变更日志聚合呈现；安装包完整性校验 | 基于 tauri-plugin-updater 与 Minisign 公钥签名验证体系 |

## 核心特性解析

### 1. 待办日程与时间规划
- **双主视图协同**：
  - **清单列表视图**：清晰按状态和分类归集任务，支持行内快捷操作与快速勾选。
  - **月度日历视图**：以月度日历网格直观映射任务排期与截止时间节点。
- **精确时间规划**：内置原生级日期时间选择组件（DateTimePicker），支持快捷填充与时间区间约束。
- **自定义分类与检索**：支持自定义标签分类及色彩标识，提供今日待办、全部、已完成等多维视图快速切换。

### 2. 任务型 AI Agent 智能体
- **自然语言工具调用（Tool Calling / Function Calling）**：
  - 支持通过自然对话完成复杂的待办管理，内置 `create_task`、`update_task`、`complete_task`、`delete_task`、`get_today_tasks` 等核心工具。
- **自主多轮推理循环（ReAct Agent Loop）**：
  - 支持多轮链式工具调用与决策闭环（如先联网查询信息，再根据结果自主调度工具创建任务）。
- **联网检索与网页精读**：
  - 集成 Bocha 与 Tavily 搜索引擎接口，支持 `web_search` 实时检索与 `fetch_webpage` 网页正文深度提取。
- **多协议与流式输出**：
  - 原生支持 OpenAI 工具调用标准，同时兼容 DeepSeek DSML 工具标签协议。
- **Rust 原生网络中继**：
  - 针对客户端大模型接口的跨域（CORS）与网络访问限制，内置 Rust 原生 HTTP 代理转发降级机制，确保连接稳定。

### 3. Git 协同与智能工作日报
- **代码仓库深度关联**：
  - 支持绑定本地 Git 代码目录（通过系统原生目录选择器自动获取）或 GitHub / GitLab / Gitea 等远程仓库链接。
- **提交记录自动聚合**：
  - 一键检索分析指定仓库当天的 Git Commit 日志，自动清洗 Merge 杂质与 Hash 标识，按任务维度归集。
- **双模工作日报生成**：
  - **离线规则生成**：无需配置大模型 API Key，依托内置算法秒级输出标准三段式工作日报。
  - **大模型专业润色**：结合任务进度与 Git 提交，由 AI 自动扩写提炼为结构严谨、重点突出的专业周报/日报。

## 架构设计与技术栈

```
TodoList
├── Frontend (Vue 3 + TypeScript + Vite)
│   ├── Views & Components (List / Calendar / AIChatView / DateTimePicker)
│   ├── Agent & Stream Core (useChatStream / useConversations / useAIAssistant)
│   └── Utils & Tools (useWebSearch / markdown / gitParser)
└── Backend Desktop Shell (Tauri v2 + Rust)
    ├── Data Storage (Local JSON persistence)
    ├── Git Subsystem (Local repository log analysis)
    ├── Network Bridge (Reqwest native proxy & webpage extractor)
    └── System Integration (Notification / Minisign updater / Dialog)
```

| 层次 | 技术选型 | 说明 |
|---|---|---|
| **桌面运行时** | Tauri v2 | 基于 Rust 构建的高性能、轻量级、低内存占用跨平台桌面框架 |
| **前端框架** | Vue 3.5+ | Composition API 与 `<script setup>` 响应式开发模式 |
| **开发语言** | TypeScript + Rust | 全链路强类型约束，确保运行时安全与稳定性 |
| **构建工具** | Vite 8 | 毫秒级冷启动与 HMR 热更新 |
| **AI 调度引擎** | ReAct Loop + Tool Calls | 支持 OpenAI 协议、DeepSeek DSML 标签解析、Bocha / Tavily 搜索引擎 |
| **文档渲染** | Marked | 流式 Markdown 渲染与代码高亮 |
| **热更新机制** | tauri-plugin-updater | 结合 Minisign 公钥签名与 GitHub Releases 自动发布流水线 |

## 安装指南

### Windows

前往 [Releases](https://github.com/annz02/TodoList-Ann/releases) 页面下载适合的安装包：

- **安装引导包**：下载 `TodoList_*_x64-setup.exe`，按向导指引完成安装，自动创建桌面与开始菜单快捷方式。
- **MSI 安装包**：下载 `TodoList_*_x64_en-US.msi`，适用于静默部署与集中管理。

> **Windows SmartScreen 提示**：由于未购买商业代码签名证书，初次安装若提示“已保护你的电脑”，点击「更多信息」并选择「仍要运行」即可。

### macOS

前往 [Releases](https://github.com/annz02/TodoList-Ann/releases) 页面下载适合当前架构的 `.dmg` 镜像：

- **Apple Silicon (M系列芯片)**：下载 `TodoList_*_aarch64.dmg`。
- **Intel 芯片**：下载 `TodoList_*_x64.dmg`。

打开镜像并将 `TodoList.app` 拖入 `Applications` 应用程序文件夹。

> **macOS 安全提示**：如遇到“无法打开，因为无法验证开发者”，请前往「系统设置 -> 隐私与安全性」，在安全性板块点击「仍要打开」；或在终端执行解除隔离属性命令：
> ```bash
> sudo xattr -dr com.apple.quarantine /Applications/TodoList.app
> ```

## 本地开发

### 环境要求
- [Node.js](https://nodejs.org/) (>= 18.0.0)
- [pnpm](https://pnpm.io/) (推荐的包管理器)
- [Rust](https://www.rust-lang.org/) (最新稳定版工具链，用于 Tauri 桌面端编译)

### 安装与运行

```bash
# 克隆仓库
git clone https://github.com/annz02/TodoList-Ann.git
cd TodoList-Ann

# 安装前端依赖
pnpm install

# 启动 Web 前端开发模式
pnpm dev

# 启动完整 Tauri 桌面端开发环境（支持原生接口）
pnpm tauri dev
```

### 构建与打包

```bash
# 前端静态资源构建与类型检查
pnpm build

# 构建全平台桌面分发包
pnpm tauri build
```

## 贡献规范

本项目采用 **Conventional Commits** 提交规范：

```
<type>(<scope>): <subject>
```

- **type**：`feat`（新特性）、`fix`（缺陷修复）、`docs`（文档更新）、`style`（代码格式）、`refactor`（重构）、`perf`（性能优化）、`test`（测试）、`build` / `chore`（构建与工具链）。
- **scope**（可选）：变更涉及的模块，如 `ai-chat`、`calendar`、`todos`、`git` 等。
- **subject**：简明清晰的动词开头的语句，结尾不加句号。

## 开源协议

本项目基于 [MIT License](LICENSE) 协议开源。

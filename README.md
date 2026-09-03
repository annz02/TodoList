# 📝 TodoList 智能待办与 AI Agent 助理

<p align="left">
  <a href="https://github.com/annz02/TodoList-Ann/releases"><img src="https://img.shields.io/github/v/release/annz02/TodoList-Ann?style=flat-square&color=3b82f6" alt="Release"></a>
  <a href="https://github.com/annz02/TodoList-Ann/releases"><img src="https://img.shields.io/github/downloads/annz02/TodoList-Ann/total?style=flat-square&color=10b981" alt="Downloads"></a>
  <a href="LICENSE"><img src="https://img.shields.io/github/license/annz02/TodoList-Ann?style=flat-square&color=8b5cf6" alt="License"></a>
  <a href="https://github.com/annz02/TodoList-Ann/releases"><img src="https://img.shields.io/badge/platform-Windows%20%7C%20macOS-06b6d4?style=flat-square" alt="Platform"></a>
  <a href="https://github.com/annz02/TodoList-Ann/stargazers"><img src="https://img.shields.io/github/stars/annz02/TodoList-Ann?style=flat-square&color=f59e0b" alt="Stars"></a>
</p>

一款基于 **Vue 3 + TypeScript + Vite + Tauri v2 (Rust)** 打造的现代化、高颜值桌面端待办事项管理与 **AI Agent 智能工作助理**。

不仅拥有流畅美观的**清单列表**与**日历日程**双视图，更深度融合了**工具调用智能体（Tool-Augmented AI Agent）**，支持通过自然语言操控待办、联网事实检索、关联 Git 代码提交日志一键自动化生成结构化工作日报。

---

## ✨ 核心功能特性

### 📅 待办全流程管理与双视图
- **灵活任务规划**：支持新建、编辑、删除、归档及快捷完成任务；支持设置优先级与分类标签。
- **精确时间管理**：支持开始时间与截止时间精确规划，内置自研高颜值原生日期时间选择器（DateTimePicker）。
- **双主视图无缝切换**：
  - **清单列表视图**：按分类/状态清晰排列，支持快捷勾选与行内卡片展示。
  - **月度日历视图（CalendarView）**：以日历格子直观呈现每日排期与截止任务，让日程一目了然。
- **多维度检索与筛选**：提供今天、已完成、全部任务以及按工作、学习、生活等自定义分类标签的快速筛选。

---

### 🤖 AI Agent 智能助手工作台
应用内置了独立的 **AI 助手视图**，不仅支持通用流式对话，更是具备环境交互闭环的 **Task-Oriented Agent（任务型智能体）**：

- **自然语言待办操作（Tool Calling / Function Calling）**：
  - 对话中说一句“*帮我安排今天下午3点开前端周会*”，Agent 自动提取参数并调用工具创建任务。
  - 支持完整的工具生态：`create_task`（新建）、`update_task`（改名/改期/改分类）、`complete_task`（标记完成）、`delete_task`（删除）、`get_today_tasks`（查询今日进度）。
- **自主多轮推理循环（ReAct Agent Loop）**：
  - 支持最多 4 轮链式工具调用（例如：“*查一下今天北京的天气，并帮我新建一个带伞任务*”：Agent 先执行联网搜索观察结果，再在下一轮自主执行任务创建，形成闭环）。
- **可视化思维与步骤链（AgentStep）**：
  - 工具调用的执行过程完全透明，界面实时呈现各步骤的状态（运行中、已完成、错误提示）。
- **联网检索与网页精读**：
  - 集成 **Bocha (博查)** 与 **Tavily** 搜索引擎，支持 `web_search` 实时检索最新资讯。
  - 支持 `fetch_webpage` 对目标网页进行正文深度提取与精读理解。
- **多协议深度兼容**：
  - 原生支持 OpenAI 标准 Function Calling，同时深度兼容 DeepSeek 的 `DSML` 工具标签协议。
- **多会话与历史管理**：
  - 支持创建多个独立会话，按“今天”、“昨天”、“7天内”、“更早”智能归档分组，支持会话重命名与持久化存储。
- **Rust 原生网络代理中继**：
  - 针对客户端大模型接口请求可能出现的跨域（CORS）与网络限制，内置 Rust 原生代理转发降级机制，确保请求极速稳定。

---

### 📊 Git 提交关联与智能工作日报
针对开发者与职场人士的日常工作汇报痛点，深度打通代码仓库与待办任务：

- **Git 代码关联**：
  - 待办任务中可直接配置**本地 Git 仓库路径**（自动唤起原生系统目录选择）或 **GitHub / GitLab / Gitea** 远程网页链接。
- **自动抓取 Commit 提交记录**：
  - 一键读取当天代码提交日志，智能清洗无用前缀与 Hash 杂质，与对应任务绑定聚合。
- **双模日报生成**：
  - **本地离线秒级生成**：无大模型 API Key 状态下，依托内置规则算法秒级生成标准三段式日报。
  - **在线大模型专业提炼**：结合任务进度与 Git 提交，由大模型自动扩写润色为条理清晰的专业日报。
- **一键快捷复制**：
  - 支持一键提取今日已完成的成果与提交列表，方便秒级同步至钉钉、企业微信、飞书等工作群。

---

### 🎨 桌面级原生体验与系统整合
- **深浅主题自适应**：原生适配 Dark / Light 模式，并提供多套个性化主题色彩选择。
- **桌面级系统通知**：基于 Tauri v2 原生通知插件，待办任务到期自动推送桌面提醒。
- **全键盘快捷键提效**：
  - `Ctrl + N`：新建待办任务
  - `Ctrl + S`：保存任务
  - `Ctrl + E`：编辑当前任务
  - `Ctrl + D`：删除任务
  - `Ctrl + W`：关闭应用窗口
- **原生文件交互**：集成 rfd 原生文件/目录选择器与安全的外部默认浏览器链接唤醒。

---

### 🔄 自动化更新与安全防护
- **应用内一键检查更新**：基于 `tauri-plugin-updater` 实现无缝检测与热升级，无需反复访问网页重新下载。
- **Minisign 公钥验签**：更新包通过公钥签名严格校验完整性，杜绝劫持与篡改风险。
- **跨版本 ChangeLog 聚合**：升级时自动拉取并汇总所有跨版本更新日志，新特性一目了然。

---

## 🛠 技术栈与架构设计

```
TodoList-Desktop
├── 前端表现层 (Vue 3 + TypeScript + Vite)
│   ├── 核心视图 (List / Calendar / AIChatView)
│   ├── Agent 调度与流式处理 (useChatStream / useConversations / useAIAssistant)
│   └── 联网与格式化工具 (useWebSearch / markdown / categoryColor)
└── 桌面原生层 (Tauri v2 + Rust 2021)
    ├── 核心存储 (本地 JSON 数据持久化)
    ├── Git 集成 (本地 git log 检索与分支分析)
    ├── 网络中继 (Rust reqwest 原生安全代理与网页提取)
    └── 桌面服务 (系统通知 / Minisign 热更新 / 原生文件对话框)
```

| 架构层 | 技术选型 | 说明 |
| :--- | :--- | :--- |
| **桌面框架** | **Tauri v2** | 基于 Rust 的超轻量、安全、低内存占用的下一代跨平台桌面引擎 |
| **前端框架** | **Vue 3.5+** | Composition API + `<script setup>` 高响应性组件模型 |
| **编程语言** | **TypeScript 6 + Rust 2021** | 双端严格强类型系统，代码健壮性强 |
| **构建工具** | **Vite 8** | 极速冷启动与 HMR 模块热重载 |
| **AI & Agent** | **ReAct Loop + Tool Calls** | 支持 OpenAI 协议、DeepSeek DSML 标签解析、Bocha / Tavily 搜索引擎 |
| **富文本与排版** | **Marked 18** | 高性能 Markdown 流式渲染，支持代码高亮与敏感标签过滤 |
| **自动更新** | **tauri-plugin-updater** | 结合 minisign 签名与 GitHub Releases 自动发布流水线 |
| **系统通知** | **tauri-plugin-notification** | 跨平台桌面原生推送通知 |

---

## 🚀 快速开始

### 1. 环境准备
本地开发需安装以下基础环境：
- [Node.js](https://nodejs.org/) (建议 v18 及以上版本)
- [pnpm](https://pnpm.io/) (推荐的包管理工具)
- [Rust](https://www.rust-lang.org/) 环境 (安装 `rustup` 与最新稳定版工具链，用于 Tauri 桌面编译)

### 2. 克隆项目与安装依赖
```bash
git clone https://github.com/annz02/TodoList-Ann.git
cd TodoList-Ann
pnpm install
```

### 3. 开发环境运行
```bash
# 仅启动 Web 前端界面调试
pnpm dev

# 启动完整的 Tauri 桌面端应用（支持所有原生 API）
pnpm tauri dev
```

### 4. 构建与发布打包
```bash
# 前端静态资源编译与类型检查
pnpm build

# 打包全平台桌面安装包（输出到 src-tauri/target/release/bundle/）
pnpm tauri build
```

---

## 📦 下载安装

你可以前往 [GitHub Releases](https://github.com/annz02/TodoList-Ann/releases) 页面下载适合你系统的最新安装包：

- **Windows**: 下载 `_x64-setup.exe` 安装引导包或 `_x64_en-US.msi`。
- **macOS (Intel 芯片)**: 下载文件名含 `x64` 的 `.dmg` 镜像。
- **macOS (Apple Silicon M系列)**: 下载文件名含 `aarch64` 的 `.dmg` 镜像。

> [!TIP]
> - **macOS 提示“无法验证开发者”**：由于未加入 Apple 付费公证体系，初次安装请前往「系统设置 > 隐私与安全性」中点击「仍要打开」即可。
> - **Windows 出现 SmartScreen 提示**：点击「更多信息」并选择「仍要运行」即可正常安装使用。

---

## 🤝 贡献与提交规范

欢迎提交 Issue 或 Pull Request 协助改进项目！

本项目严格遵循 **Angular / Conventional Commits** 提交规范：
```
<type>(<scope>): <subject>
```
- **type**: `feat`（新功能）、`fix`（修补bug）、`docs`（文档）、`style`（格式）、`refactor`（重构）、`perf`（性能优化）、`test`（测试）、`chore`（构建/工具日常维护）。
- **subject**: 简明扼要的英文或中文说明，祈使句式，不加末尾句号。

---

## 📄 开源协议

本项目基于 [MIT License](LICENSE) 协议开源。

# 📝 TodoList 智能待办与 AI 日报助手

<p align="left">
  <a href="https://github.com/annz02/TodoList/releases"><img src="https://img.shields.io/github/v/release/annz02/TodoList?style=flat-square&color=3b82f6" alt="Release"></a>
  <a href="https://github.com/annz02/TodoList/releases"><img src="https://img.shields.io/github/downloads/annz02/TodoList/total?style=flat-square&color=10b981" alt="Downloads"></a>
  <a href="LICENSE"><img src="https://img.shields.io/github/license/annz02/TodoList?style=flat-square&color=8b5cf6" alt="License"></a>
  <a href="https://github.com/annz02/TodoList/releases"><img src="https://img.shields.io/badge/platform-Windows%20%7C%20macOS-06b6d4?style=flat-square" alt="Platform"></a>
  <a href="https://github.com/annz02/TodoList/stargazers"><img src="https://img.shields.io/github/stars/annz02/TodoList?style=flat-square&color=f59e0b" alt="Stars"></a>
</p>

一个基于 **Vue 3 + TypeScript + Vite + Tauri** 构建的高颜值、现代化桌面端待办事项管理与 AI 工作日报应用。

TodoList 致力于提供简洁、高效、极致美观的任务管理体验，支持日历视图、任务分类、系统级定时提醒，并内置了 **AI 每日工作总结** 功能，协助你一键生成专业的工作日报。

---

## ✨ 核心功能特性

### 📅 任务管理与多视图
- **灵活任务管理**：支持新建、编辑、删除及快捷完成任务。
- **精确时间规划**：支持起止时间与日期设置，内置自研高颜值日历与时间选择器（DateTimePicker）。
- **双视图切换**：提供直观的**列表视图**与可视化的**日历视图**（CalendarView）。

### 🤖 AI 每日工作总结 (AI 工作日报)
- **结构化日报生成**：自动汇总今日任务完成情况，分为「一、✅ 今日完成工作汇总」、「二、📊 分类进度追踪」、「三、📌 待跟进重点事项」。
- **内置智能算法 + 在线大模型**：
  - **零配置即用**：内置本地智能总结生成算法，无门槛秒级生成。
  - **大模型拓展**：支持配置兼容 OpenAI / DeepSeek 等 OpenAPI 格式的 Endpoint、API Key 及模型名称。
- **一键精准复制**：支持一键「复制总结」，自动提取并仅复制今日已完成的工作汇总，方便快速同步至钉钉、微信、飞书或工作报告中。

### 📌 任务分类与统计
- **多维度筛选**：支持侧边栏分类选择（今日任务、已完成、全部任务及自定义分类）。
- **今日效率仪表盘**：直观展示今日计划项、已完成项与实时完成率占比。

### 🎨 高颜值设计与主题
- **深色 / 浅色模式**：完美支持暗黑模式与亮色模式无缝切换。
- **自定义配色**：提供丰富的主题颜色可供个性化定制。

### 🔔 桌面级提醒与快捷操作
- **系统通知提醒**：基于 Tauri 原生通知系统，任务到达时间自动触发桌面通知。
- **快捷键提效**：
  - `Ctrl + N` 新建任务
  - `Ctrl + S` 保存任务
  - `Ctrl + E` 编辑任务
  - `Ctrl + D` 删除任务
  - `Ctrl + W` 关闭窗口

---

## 🛠 技术栈

| 架构层 | 技术选型 |
| --- | --- |
| **前端框架** | Vue 3 (Composition API + `<script setup>`) |
| **编程语言** | TypeScript |
| **构建工具** | Vite |
| **桌面端框架** | Tauri v2 (Rust) |
| **通知插件** | `@tauri-apps/plugin-notification` |
| **样式与设计** | 原生 CSS (CSS Variables + 响应式布局 + 现代 UI) |

---

## 🚀 快速开始

### 1. 环境准备
确保本地安装了以下环境：
- [Node.js](https://nodejs.org/) (建议 v18+)
- [pnpm](https://pnpm.io/) / npm / yarn
- [Rust](https://www.rust-lang.org/) 环境 (Tauri 编译需要)

### 2. 安装依赖
```bash
npm install
```

### 3. 开发环境运行
```bash
# 启动网页端开发调试
npm run dev

# 启动 Tauri 桌面应用开发调试
npm run tauri dev
```

### 4. 构建打包
```bash
# 前端静态资源打包
npm run build

# Tauri 桌面客户端打包
npm run tauri build
```

---

## 📦 下载安装

到 [Releases](https://github.com/annz02/TodoList/releases) 页面下载最新版安装包：

- **Windows**: 下载 `.msi` 或 `.exe` 安装包（NSIS 安装器）
- **macOS Intel**: 下载 `x64` 的 `.dmg` 文件
- **macOS Apple Silicon**: 下载 `arm64` (aarch64) 的 `.dmg` 文件

首次打开 macOS 版本时，由于未进行 Apple 开发者签名和公证，系统会提示无法验证开发者。请在「系统设置 > 隐私与安全性」中点击「仍要打开」。

Windows 版可能会显示 SmartScreen 警告，点击「更多信息 > 仍要运行」即可。

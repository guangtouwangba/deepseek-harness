---
description: "在 Web 侧栏显示 Codex 订阅每周剩余额度和重置时间，不向浏览器暴露凭据的本地插件包。"
kind: "package-bundle"
---

# OpenAI 订阅额度

[English](README.md) | 中文

## 概述

这个可选本地插件包在 Web 侧栏的设置按钮上方添加订阅额度卡片，显示 Codex 每周剩余百分比、重置时间，以及可用的短时窗口剩余百分比。Host 复用 Harness 的 Codex OAuth 授权或本机 Codex CLI 的 access token，凭据不会进入浏览器。直接 ChatGPT 登录和 OpenAI API key 不能查询这个 Codex 接口。

## 目录

- [使用方法](#use-this-package)
- [配置](#configuration)
- [实现说明](#understand-the-implementation)
- [模型体验](#model-experience)
- [已知限制与后续工作](#known-limitations-and-deferred-work)
- [开发说明](#dev-note)

## 使用方法

通过 `plugin_manager` 安装，设置 `action: install_bundle`，`target` 为此目录的绝对路径。安装会为当前 Web profile 的所有会话启用插件包，请保留源目录和已安装依赖。在插件页面禁用插件包会移除卡片和接口。安装后若卡片尚未出现，请刷新已打开的 GUI。

插件会**自动识别本机已有的 Codex CLI 登录**，读取 `$CODEX_HOME/auth.json`；未设置 `CODEX_HOME` 时使用 `~/.codex/auth.json`，无需再次登录。该文件仅读取：插件不会复制授权、使用其中的 refresh token 或覆盖 CLI 凭据；过期时请通过 Codex 更新登录。Harness 中保存的 Codex 授权优先使用，并保留通过 pi-ai 串行刷新 token 的能力。直接 **OpenAI → 使用 ChatGPT 登录** 的授权与此独立，绝不会发送到 Codex 额度接口。

展开侧栏可查看每周剩余百分比、重置时间和可用的短时窗口剩余百分比。折叠后保留一个可聚焦图标，悬停、聚焦或点击可查看详情。未知窗口显示不可用，而不是 0%；重置时间明确标注为 UTC。网络或解析失败时保留上次成功值并标记数据过期，不能视为当前读数；授权失败会隐藏旧值。退出账号会使 Host 缓存失效，浏览器在下一次轮询时反映变化。

## 配置

插件包插入 `local-openai-usage` 行。通过 profile 的正常补丁机制覆盖完整配置，非法字段或未知字段会阻止启用。

| 字段 | 默认值 | 含义 |
|---|---|---|
| `provider` | `auto` | `auto` 或 `openai-codex`；仅查询 Codex 授权，绝不使用直接 ChatGPT 授权 |
| `codexAuthPath` | Codex home 的 `auth.json` | CLI 登录文件绝对路径；设为 `null` 可禁用本机 token 复用 |
| `timeoutMs` | `15000` | 额度读取截止时间，1–120000 毫秒；已启动的提供商 token 轮换会先完成持久化再响应取消 |
| `refreshIntervalMs` | `60000` | 轮询与 Host 缓存间隔，30000–3600000 毫秒 |
| `maxResponseBytes` | `65536` | 上游 JSON 响应体上限，1024–1048576 字节 |

## 实现说明

[入口](index.js) 通过 Connection 注册仅认证 owner 可访问的 `GET /api/local-openai-usage`。[凭据适配器](auth.js) 将 pi-ai 的公开授权集合限定为已保存的 `llm-pi-ai/openai-codex` 授权，并通过现有串行凭据存储刷新。没有该授权时，[CLI 读取器](cli-auth.js) 读取当前 access token 和账号标识，不修改 CLI 文件。[读取器](usage.js) 仅请求 `https://chatgpt.com/backend-api/wham/usage`，禁止重定向、限制响应大小，且仅返回白名单内的额度字段。原始错误、账号标识、token 和上游响应体不会返回。[监控器](monitor.js) 合并多个查看者的请求、缓存读数，并在凭据变化时失效；卸载时注销接口、取消读取并等待清理。网络、授权、HTTP 和解析失败分别使用脱敏错误码；读取不会消耗重置积分或更改选中的模型。

[浏览器入口](src/client/index.ts) 复用现有侧栏底部插槽并注册一个共享资源，产品文案支持中英文。插件包使用本仓库的共享浏览器编译器，构建产物保存在本地并被 Git 忽略。开发链接指向已构建的仓库 API，运行本地浏览器类型检查前需先构建仓库。

## 模型体验

无。插件包不添加面向模型的工具、提示词、会话事件、token 统计或 KV 缓存输入。

## 已知限制与后续工作

- WHAM 额度接口被官方 Codex 客户端使用，但不是公开文档中的通用 OpenAI API，上游变化可能导致读数不可用。
- 直接 ChatGPT 订阅授权面向 OpenAI 推理资源，而非 ChatGPT backend；本插件不使用未经支持的直接登录周额度接口。API 账单与此独立。
- 卡片显示 Codex 的主要每周与短时额度，不代表所有 ChatGPT 模型、附加功能额度、购买的积分余额或整个套餐的访问判断。剩余百分比不等于精确消息次数。
- 插件包仅支持 Web，不实现桌面 IPC 或账号选择，优先使用 Harness 保存的 Codex 账号，否则使用本机 CLI 账号，卡片会标注凭据来源。浏览器读取失败时可能保留已标记过期的旧读数，包括退出后到下一次轮询之间。
- 在已有浏览器中完整验证需要正常登录的 GUI 会话，匿名请求会被拒绝。包内测试使用合成额度响应和临时登录文件，绝不使用开发者凭据。

## 开发说明

协议参考：[官方 Codex 额度客户端](https://github.com/openai/codex/blob/main/codex-rs/backend-client/src/client/rate_limit_resets.rs)及[直接 ChatGPT 授权范围](https://developers.openai.com/siwc/token-sharing-open-source/models-and-inference.md)。

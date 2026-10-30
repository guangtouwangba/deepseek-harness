---
description: "在对话中只读搜索公共 npm 上的 DSH 插件包。"
kind: "package-bundle"
---

# 公开插件搜索

[English](README.md) | 中文

## 概要

无需配置插件市场索引，即可在对话中搜索公共 npm 上的 DSH 插件包。结果包括名称、版本、描述、来源链接和声明的 DSH 版本要求。搜索仅读取元数据，不安装插件，也不执行候选包的代码。

## 目录

- [使用方式](#use-this-package)
- [配置](#configuration)
- [实现说明](#understand-the-implementation)
- [模型体验](#model-experience)
- [已知限制与后续工作](#known-limitations-and-deferred-work)

<a id="use-this-package"></a>
## 使用方式

通过 DSH 的 `plugin_manager` 安装本地 bundle：设置 `action: install_bundle`，并将包含本说明的目录的绝对路径作为 `target`。安装影响当前 profile 中的所有会话。安装后请保留链接的源代码目录。

直接要求助手搜索公开 DSH 插件即可。工具名为 `search_public_dsh_plugins`；传入 `{"query":""}` 可浏览候选包，也可传入关键词，例如 `{"query":"browser"}`。继续翻页时，保持查询不变，把返回的 `nextOffset` 作为 `offset`。npm 搜索不会自动翻译关键词。

结果仅确认最新版本元数据声明了非空 `dsh.bundle.patch` 字符串，或由非空字符串组成的非空数组。未验证包内文件、安全性或运行时兼容性。不要仅因插件出现在结果中就安装它。

<a id="configuration"></a>
## 配置

插入的插件行 ID 为 `local-public-plugin-search`。通过 profile 的常规 patch 机制修改完整配置；插件在发出请求前拒绝未知字段或无效配置。验证由插件自身完成，未导出 Config schema，因此不提供自动生成的设置表单。

| 字段 | 随包配置 | 含义 |
|---|---|---|
| `registry` | `https://registry.npmjs.org/` | 兼容 npm 搜索与元数据接口的 HTTPS registry，不允许内嵌凭据 |
| `timeoutMs` | `20000` | 整次搜索的截止时间，包含所有元数据读取 |
| `pageSize` | `10` | 每页候选包数量，范围为 1 至 20 |
| `maxResponseBytes` | `2097152` | 单个 registry JSON 响应的最大字节数 |
| `maxOutputBytes` | `32768` | 返回的 JSON 对象的最大 UTF-8 字节数 |

网络、HTTP、响应验证、取消和超时失败会明确报告。单个候选包读取失败会列入 `failures`，不影响其他成功结果。读取没有安装副作用；检查网络或 registry 配置后可重试。`outputTruncated` 表示部分条目因输出预算而省略；减少每页候选数或增大输出预算可保留更多条目。

<a id="understand-the-implementation"></a>
## 实现说明

<details>
<summary>实现细节</summary>

[补丁](cordis.patch.yml)插入一个 Host 插件，注册一个只读工具。[搜索模块](search.js)查询 npm 搜索接口并检查各候选包最新版本的 manifest，不下载 tarball。[入口](index.js)负责工具注册和进行中的搜索；卸载时注销工具、取消请求并等待清理完成。标准 `fetch` 继承 DSH 进程的代理配置。

</details>

<a id="model-experience"></a>
## 模型体验

插件向模型的可用工具增加一个 schema，不添加系统提示词段落。搜索结果进入正常的工具调用日志；插件不写入自定义会话记录。结果受 `maxOutputBytes` 限制；候选包描述始终是不可信文本。模型 token 开销取决于分词器和匹配数量；未声明 token 数量基准结果。

<a id="known-limitations-and-deferred-work"></a>
## 已知限制与后续工作

- 搜索只覆盖 npm 索引中匹配 `dsh` 加查询词的候选包，不覆盖所有公开仓库，也不保证发现名称无关的 bundle。
- 只检查最新发布版本。排除已弃用、标为私有以及缺少可用 bundle 声明的版本；不发现更早的兼容版本。
- 分页按候选包计数，不按核验后的 bundle 计数；插件结果为空不代表后续页没有结果。
- `dshRequirement` 缺失表示没有声明支持的版本要求字段，不代表兼容所有运行时。
- 插件管理中的标题和图标仍需视觉验证；此 bundle 不新增搜索页面。

### 开发备注

无。

---
description: "记录持久化类型更改及其兼容性确认。"
kind: persistence-change
---

# 2026-10-30-model-service-tier

[English](2026-10-30-model-service-tier.md) | 中文

## 概述

为记录在案的模型选择、请求头配置以及子代理描述中的子路由快照增加可选的服务档位。

## 目录

- [声明](#declaration)
- [兼容性](#compatibility)
- [验证](#verification)
- [开发备注](#dev-note)

<a id="declaration"></a>
## 声明

```yaml persistence-change
schemaVersion: 1
id: 2026-10-30-model-service-tier
baseline: false
changes:
  - root: "event:model/selection"
    previous: "2026-09-11-initial"
    after: "7f460f65c6e3f83e46b1ac38db7eb243d64200ca5fc1406c9469b443926c8ae2"
    decision: same-version
  - root: "event:request/header"
    previous: "2026-09-16-session-format-v4"
    after: "c300278184b4aa6628fd523f8bec1df3c30a7359520a0c1f1f38c42bbf14a595"
    decision: same-version
  - root: "event:subagent/descriptor"
    previous: "2026-09-11-initial"
    after: "d971c206f2ec3c8238cfdb519f356544472a235358c7c0bf6a921b813ad4f3f0"
    decision: same-version
```

<a id="compatibility"></a>
## 兼容性

三个属性都是可选的，取值是适配器所有的不透明 id。不含这些属性的既有日志含义不变，仍可读取。旧读取方忽略模型选择与请求配置中的新增属性，保持提供方默认服务；其严格的子代理描述符解析器会在冷恢复前拒绝新增的描述符属性，而非静默改变已保存的子代理组合。Session 与描述符版本均保持不变。新读取方在同一路由恢复时保留已保存档位；切换路由的消费方会丢弃继承档位，除非调用方为新路由显式选择。省略档位保持提供方默认行为。

<a id="verification"></a>
## 验证

已运行的重点套件：dsh-session 的 request-header 与 session、dsh-agent 的 model-selection、dsh-agent-loop 的请求准入、dsh-api-session-controller 的模型目录、dsh-llm 与 dsh-llm-pi-ai、dsh-subagent 的续跑、dsh-acp 的 model-control。pnpm run build 通过类型与产物校验。

<a id="dev-note"></a>
## 开发备注

无。

---
description: "Local Web bundle showing Codex subscription weekly remaining quota and reset times without exposing credentials."
kind: "package-bundle"
---

# OpenAI subscription quota

English | [中文](README.zh.md)

## Summary

This optional local bundle adds a subscription quota card above Settings in the Web sidebar. It shows the Codex weekly remaining percentage and reset time, plus an available short-window percentage. The Host reuses Harness's Codex OAuth grant or the local Codex CLI access token; credentials never enter the browser. Direct ChatGPT login and OpenAI API keys cannot query this Codex endpoint.

## Table of Contents

- [Use this package](#use-this-package)
- [Configuration](#configuration)
- [Understand the implementation](#understand-the-implementation)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

## Use this package

Install through `plugin_manager` with `action: install_bundle` and this directory's absolute path as `target`. Installation enables the bundle for every session in the current Web profile; keep this source directory and its installed dependencies available. Disable the bundle in Plugins to remove both the card and its endpoint. Refresh an already-open GUI after installation if the card has not appeared.

An existing **Codex CLI login is detected automatically** at `$CODEX_HOME/auth.json`, or `~/.codex/auth.json` when `CODEX_HOME` is unset. No second login is required. The file is read only: the plugin never copies its grant, uses its refresh token or overwrites CLI credentials; renew an expired CLI login through Codex. A Codex grant saved in Harness takes priority and retains serialized token refresh through pi-ai. Direct **OpenAI → Sign in with ChatGPT** authorization remains separate and is never sent to the Codex quota endpoint.

The expanded sidebar shows the weekly percentage, reset timestamp and available short-window percentage. The collapsed sidebar keeps one focusable icon; hover, focus or click it for details. Unknown windows remain unavailable rather than showing 0%. Reset timestamps explicitly show UTC. A network or parsing failure retains the last successful values with an out-of-date notice; these are not current readings. Authentication failures hide previous values. Account sign-out invalidates the Host cache, with the browser reflecting it on its next poll.

## Configuration

The bundle inserts row `local-openai-usage`. Override its complete config through the profile's normal patch mechanism. Invalid or unknown fields reject activation.

| Field | Default | Meaning |
|---|---|---|
| `provider` | `auto` | `auto` or `openai-codex`; only a Codex grant is queried, never a direct ChatGPT grant |
| `codexAuthPath` | Codex home `auth.json` | Absolute CLI login path; `null` disables local token reuse |
| `timeoutMs` | `15000` | Quota read deadline, 1–120000 ms; an already-started provider token rotation completes its persistence before cancellation |
| `refreshIntervalMs` | `60000` | Poll and Host cache interval, 30000–3600000 ms |
| `maxResponseBytes` | `65536` | Upstream JSON body cap, 1024–1048576 bytes |

## Understand the implementation

The [entry](index.js) registers an owner-authenticated `GET /api/local-openai-usage` route through Connection. The [credential adapter](auth.js) scopes pi-ai's public auth collection to the stored `llm-pi-ai/openai-codex` grant and uses the existing serialized credential store for refresh. When that grant is absent, the [CLI reader](cli-auth.js) reads the current access token and account id without mutating the CLI file. The [reader](usage.js) calls only `https://chatgpt.com/backend-api/wham/usage`, refuses redirects, bounds the response and returns an allowlisted quota projection. Raw errors, account ids, tokens and upstream response bodies are not returned. The [monitor](monitor.js) coalesces viewers, caches reads and invalidates on credential changes; unload unregisters the route, cancels reads and waits for cleanup. Network, auth, HTTP and parsing failures have distinct sanitized codes; reads never consume reset credits or change the selected model.

The [browser entry](src/client/index.ts) contributes to the existing footer slot and registers one shared resource. Product text is localized in English and Chinese. The package uses the checkout's shared browser compiler; build artifacts are local and ignored by Git. Development links target built checkout APIs; build the checkout before the local browser typecheck.

## Model Experience

None. This bundle adds no model-facing tools, prompts, session events, token accounting or KV-cache inputs.

## Known Limitations and Deferred Work

- The WHAM quota endpoint is used by the official Codex client but is not a documented general-purpose OpenAI API. Upstream changes can make readings unavailable.
- Direct ChatGPT subscription authorization targets the OpenAI inference resource, not the ChatGPT backend; there is no supported direct weekly-quota API used here. API billing is separate.
- The card shows Codex's main weekly and short-window buckets, not every ChatGPT model, additional feature bucket, purchased credit balance or whole-plan access decision. Remaining percentage is not an exact message count.
- The package is Web-only. It does not implement desktop IPC or account selection; it follows the saved Harness Codex account, or otherwise the local CLI account. The card labels its credential source. Browser failures can retain the previous reading marked out of date, including across sign-out until the next poll.
- Full authenticated validation in an existing browser requires its normal signed-in GUI session; anonymous requests are intentionally refused. Owner-local tests use synthetic quota responses and temporary login files, never developer credentials.

## Dev Note

Protocol references: [official Codex quota client](https://github.com/openai/codex/blob/main/codex-rs/backend-client/src/client/rate_limit_resets.rs) and [direct ChatGPT authorization scope](https://developers.openai.com/siwc/token-sharing-open-source/models-and-inference.md).

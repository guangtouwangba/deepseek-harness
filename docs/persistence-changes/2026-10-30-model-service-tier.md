---
description: "Records a persistence type transition and its compatibility acknowledgement."
kind: persistence-change
---

# 2026-10-30-model-service-tier

English | [中文](2026-10-30-model-service-tier.zh.md)

## Summary

Adds an optional service tier to the logged model selection and the request header config, and to the subagent descriptor's child route snapshot.

## Table of Contents

- [Declaration](#declaration)
- [Compatibility](#compatibility)
- [Verification](#verification)
- [Dev Note](#dev-note)

<a id="declaration"></a>
## Declaration

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
## Compatibility

All three properties are optional and carry an opaque adapter-owned id. Existing logs without these properties retain their meaning and remain readable. Older readers ignore the selection and request-config additions, retaining provider-default service; their strict subagent descriptor parser refuses the new descriptor property before cold resume rather than silently changing the child's saved composition. The Session and descriptor versions remain unchanged. New readers retain saved tiers on same-route resume, and route-switching consumers discard inherited tiers unless explicitly selected for the new route. Omitting a tier preserves provider-default behavior.

<a id="verification"></a>
## Verification

Focused suites: dsh-session request-header and session specs, dsh-agent model-selection, dsh-agent-loop request admission, dsh-api-session-controller model catalog, dsh-llm and dsh-llm-pi-ai, dsh-subagent continuation, dsh-acp model-control. pnpm run build passes type and artifact gates.

<a id="dev-note"></a>
## Dev Note

None.

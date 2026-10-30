---
description: "Read-only discovery of public npm DSH bundles from chat."
kind: "package-bundle"
---

# Public plugin search

English | [中文](README.zh.md)

## Summary

Search public npm releases for DSH plugin bundles from chat without configuring a plugin-market index. Results include names, versions, descriptions, source links, and declared DSH requirements. Search reads metadata only; it never installs packages or executes their code.

## Table of Contents

- [Use this package](#use-this-package)
- [Configuration](#configuration)
- [Understand the implementation](#understand-the-implementation)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)

<a id="use-this-package"></a>
## Use this package

This local bundle is installed through DSH's `plugin_manager` with `action: install_bundle` and the absolute directory containing this README as `target`. Installation affects every session in the current profile. Keep the linked source directory available after installation.

Ask the assistant to search for public DSH plugins. The tool is `search_public_dsh_plugins`; its input is `{"query":""}` to browse, or a keyword such as `{"query":"browser"}`. To continue, supply the returned `nextOffset` as `offset` with the same query. npm matching is not translation-aware.

A result confirms only that the latest package metadata declares a nonempty `dsh.bundle.patch` string or nonempty array of nonempty strings. Package contents, safety, and runtime compatibility are not verified. Never install a result solely because it appears here.

<a id="configuration"></a>
## Configuration

The inserted row is `local-public-plugin-search`. Change its complete configuration through the profile's normal patch mechanism; activation rejects unknown or invalid options before making requests. Validation runs in the plugin rather than an exported Config schema, so there is no generated Settings form.

| Field | Bundled value | Meaning |
|---|---|---|
| `registry` | `https://registry.npmjs.org/` | HTTPS npm-compatible search/metadata registry; no embedded credentials |
| `timeoutMs` | `20000` | Whole search deadline, including all metadata reads |
| `pageSize` | `10` | Number of candidate packages per page, from 1 to 20 |
| `maxResponseBytes` | `2097152` | Maximum bytes of each registry JSON response |
| `maxOutputBytes` | `32768` | Maximum UTF-8 bytes of the returned JSON object |

Network, HTTP, response-validation, cancellation, and deadline failures are explicit errors. Individual package-read failures appear in `failures` beside successful matches. These reads have no installation side effects; retry after checking connectivity or registry settings. `outputTruncated` means entries were omitted to fit the output budget; a smaller candidate page or larger output budget can retain more entries.

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals</summary>

The [patch](cordis.patch.yml) inserts a Host plugin that registers one read-only tool. The [search module](search.js) queries npm's search endpoint and checks each candidate's latest manifest without downloading tarballs. The [entry](index.js) owns tool registration and in-flight searches; unload unregisters the tool, aborts requests, and awaits their cleanup. Standard `fetch` inherits the DSH process's proxy configuration.

</details>

<a id="model-experience"></a>
## Model Experience

The tool adds one schema to the model's available tools and adds no system-prompt section. Search results enter normal logged tool history; the plugin writes no custom session records. Results are bounded by `maxOutputBytes`; candidate descriptions remain untrusted text. Model-token overhead depends on the tokenizer and number of matches; no token-count benchmark is claimed.

<a id="known-limitations-and-deferred-work"></a>
## Known Limitations and Deferred Work

- Search covers only npm-indexed candidates matching `dsh` plus the query, not every public repository or every bundle with an unrelated name.
- Only the latest release is checked. Deprecated/private releases and packages without usable bundle declarations are excluded; older compatible releases are not discovered.
- Pagination counts candidates, not verified bundles; an empty plugin list does not mean later pages have no matches.
- Missing `dshRequirement` means no supported requirement field was declared, not that every runtime is supported.
- GUI-rendered inventory titles/icons require visual verification; this bundle adds no search page.

### Dev Note

None.

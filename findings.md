# Findings

- User confirmed ChatGPT/Codex subscription quota, not API billing.
- Checkout has many pre-existing dirty changes; preserve all of them.
- Existing local-plugins/public-plugin-search demonstrates installable out-of-tree bundle.
- openai and openai-codex store separate grants; installation UUID is not an auth token.
- Existing GUI is http://127.0.0.1:3080; do not start a replacement server.
- Official Codex source confirms GET https://chatgpt.com/backend-api/wham/usage with Codex Bearer + matching ChatGPT-Account-Id. Classify weekly by 604800 seconds, not primary/secondary position.
- Official SIWC documentation explicitly forbids pointing direct openai ChatGPT authorization at backend-api. Never probe using that direct token. Before reporting unsupported, reuse an existing local Codex CLI login read-only when Harness has no compatible Codex grant; the CLI retains refresh ownership.
- Refresh uses public pi-ai createModels/getAuth with a Codex-only adapter over serialized ctx.credentials.modifyRecord, not ad-hoc token rotation. Cache/dedup belongs to Host plugin instance; logout invalidates it.
- UI uses sidebar.footer.action + a single client resource provider. Token values never enter browser or returned data.

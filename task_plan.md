# ChatGPT/Codex usage plugin

## Goal
Add a local installable DSH plugin showing real subscription weekly remaining percentage, reset time and available short-window quota in the existing GUI; keep credentials on Host.

## Phases
1. Inspect credential and client extension APIs — complete.
2. Implement bounded usage reader and tests first — complete (19 Node tests passing).
3. Add localized GUI contribution using existing slots/resources — complete.
4. Install in current profile and verify existing GUI — complete: installed/applied, Host active, existing URL rejects anonymous quota access (401); authenticated visual/account reading not performed because no GUI browser credentials were available to automation.
5. Run relevant tests/build checks, document limitations — complete: 21 Node tests, 28 Vitest tests including actual Loader, built-API local typecheck, local bundle, root build:artifacts then build:check; bilingual docs and source whitespace checked.

## Constraints
Preserve existing dirty work. Scope changes to local-plugins/openai-usage and these planning files. No credential values in logs/browser/results. No replacement server. Deployment requested by user means installing the local plugin, not publishing npm.

## Errors
None.

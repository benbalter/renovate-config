# CLAUDE.md

Shared Renovate presets that every @benbalter repo extends: [default.json](default.json), plus the [instant.json](instant.json) and [quiet.json](quiet.json) variants. [README.md](README.md) explains each policy choice.

## Commands

- Before committing: `npx --yes --package renovate renovate-config-validator --strict default.json instant.json quiet.json renovate.json` and `node --test .github/scripts/*.test.js`. Both run in [validate.yml](.github/workflows/validate.yml).

## Releasing

- Merging to `main` is the release. Renovate reads the presets from the default branch, so a change reaches every repo on its next Renovate run, with no tag or version. Keep changes small and don't merge without the owner's go-ahead.

## Gotchas

- Don't pin GitHub Actions to SHA digests, here or in the preset. `helpers:pinGitHubActionDigests` was removed in 2482ee7 on purpose; actions stay on version tags.
- Keep [README.md](README.md)'s policy summary in step with any change to the presets.
- `instant` relies on required status checks and `quiet` breaks under branch protection that requires PRs; their `description` fields say why. Don't move either setting into `default.json`.
- [clear-renovate-notifications.yml](.github/workflows/clear-renovate-notifications.yml) marks the owner's real notifications as done every 15 minutes. Run [run-local.js](.github/scripts/run-local.js) with `DRY_RUN=true` unless the owner asks otherwise.

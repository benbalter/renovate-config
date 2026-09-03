# renovate-config

Central [Renovate](https://docs.renovatebot.com/) configuration preset shared across
[@benbalter](https://github.com/benbalter)'s repositories. Change dependency-update policy for
every repo in one place, here.

## Usage

Each repo extends this preset via its `renovate.json`:

```json
{
  "$schema": "https://docs.renovatebot.com/renovate-schema.json",
  "extends": ["github>benbalter/renovate-config"]
}
```

Renovate resolves [`default.json`](default.json) for a `github>benbalter/renovate-config`
reference.

## Policy summary

- **Base**: `config:recommended` (sane defaults + monorepo/related grouping) plus semantic
  commits and GitHub Action digest pinning.
- **Auto-merge**: patch + minor updates auto-merge once CI is green (`:automergeMinor`).
  `devDependencies` auto-merge freely; **major** production-dependency bumps require review.
- **`platformAutomerge: false`**: Renovate merges only after it observes CI is green, so the
  "tests must pass" gate holds regardless of a repo's branch-protection config. Trade-off: merge
  happens on Renovate's next run (minutes), not the instant CI turns green.
- **`minimumReleaseAge: "7 days"`**: quarantine window so freshly-published (potentially
  malicious) releases have time to be yanked before they auto-merge. Bump to `"14 days"` for a
  stricter posture.
- **Rate limits & schedule**: batched weekly, `prConcurrentLimit` / `prHourlyLimit` capped.
- **Dependency Dashboard** enabled for at-a-glance visibility per repo.

## Security notes

See the [Renovate security docs](https://docs.renovatebot.com/security-and-permissions/). Key
points for this setup: dependency-update CI runs on branches in the target repo, so keep those
workflows' `GITHUB_TOKEN` permissions minimal and avoid exposing long-lived secrets to them.
`postUpgradeTasks` (arbitrary command execution) is intentionally not used and is disabled on
the Mend-hosted app.

## Validate changes

```sh
npx --package renovate renovate-config-validator --strict default.json
```

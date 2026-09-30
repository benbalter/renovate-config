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
  commits. GitHub Actions stay on version tags (e.g. `@v4`), not pinned to SHA digests.
- **Auto-merge**: patch + minor updates auto-merge once CI is green (`:automergeMinor`).
  Dev dependencies auto-merge freely (npm `devDependencies`, Composer `require-dev`, Bundler
  `development`/`test` groups, Poetry/Cargo `dev-dependencies`, uv/PDM dev groups); **major**
  production-dependency bumps (npm/Poetry/Cargo `dependencies`, Composer `require`, PEP 621
  `project.dependencies`) require review.
- **Lock file maintenance**: weekly refresh of lock files (transitive deps), auto-merged. Runs
  any time on Monday (`America/New_York`) so a daily Mend run is guaranteed to land in the window.
- **Vulnerability alerts**: `osvVulnerabilityAlerts` opens fixes for deps with an OSV advisory,
  bypassing the schedule and release-age window.
- **`platformAutomerge: false`**: Renovate merges only after it observes CI is green, so the
  "tests must pass" gate holds regardless of a repo's branch-protection config. Trade-off: merge
  happens on Renovate's next run (minutes), not the instant CI turns green.
- **`minimumReleaseAge: "7 days"`**: quarantine window so freshly-published (potentially
  malicious) releases have time to be yanked before they auto-merge. Bump to `"14 days"` for a
  stricter posture.
- **No schedule for regular updates**: PRs open on any Renovate run. The Mend-hosted app runs
  a repo only every ~4 hours (daily for repos it marks inactive), so a narrow weekly window
  was almost never hit and backlogs sat in "Awaiting Schedule". `minimumReleaseAge` is the
  throttle instead. `prHourlyLimit` is off (runs are hours apart, so it only capped each run);
  `prConcurrentLimit: 15` caps open PRs per repo. PRs are labeled `dependencies`.
- **Grouping**: GitHub Actions non-major updates in one PR, Actions majors in another; `astro` +
  `@astrojs/*` together.
- **`gitIgnoredAuthors`**: commits by `github-actions[bot]` (e.g. a workflow rebuilding `dist/`)
  don't make Renovate treat its branch as edited, so it keeps rebasing it.
- **TypeScript held below 7** (`allowedVersions: "<7"`): typescript-eslint 8 and `astro check`
  don't support TS 7 yet. Drop the rule once they do.
- **Dependency Dashboard** (from `config:recommended`) for at-a-glance visibility per repo.

## Variants

- **`github>benbalter/renovate-config:instant`**: GitHub native auto-merge
  (`platformAutomerge`). Only for repos with required status checks.
- **`github>benbalter/renovate-config:quiet`**: `automergeType: "branch"`. Auto-mergeable
  updates merge straight from their branch once CI is green, with no PR and no notification.
  Updates needing review still get a PR. Not for repos whose branch protection requires PRs.

## Security notes

See the [Renovate security docs](https://docs.renovatebot.com/security-and-permissions/). Key
points for this setup: dependency-update CI runs on branches in the target repo, so keep those
workflows' `GITHUB_TOKEN` permissions minimal and avoid exposing long-lived secrets to them.
`postUpgradeTasks` (arbitrary command execution) is intentionally not used and is disabled on
the Mend-hosted app.

## Clearing auto-merged Renovate notifications

[`clear-renovate-notifications.yml`](.github/workflows/clear-renovate-notifications.yml) runs
hourly and marks as **done** every notification for a PR that `renovate[bot]` opened and merged
after a bot (e.g. `renovate-approve[bot]`) approved it and no human reviewed it. PRs that are
still open, that a person reviewed, or that a person merged are left in the inbox.

Setup: create a [classic PAT](https://github.com/settings/tokens) with the `notifications` scope
(add `repo` so it can read PRs in private repos; fine-grained PATs don't support the notifications API)
and save it as the `NOTIFICATION_TOKEN` repo secret. Run the workflow manually with `dry_run`
checked to preview what it would clear, or locally:

```sh
GH_TOKEN=$(gh auth token) DRY_RUN=true node .github/scripts/run-local.js
```

The logic lives in [`clear-renovate-notifications.js`](.github/scripts/clear-renovate-notifications.js)
(run by `actions/github-script`); tests run in CI with `node --test .github/scripts/*.test.js`.

GitHub disables scheduled workflows after 60 days without repo activity; Renovate's own PRs here
should keep it alive, but re-enable it from the Actions tab if it stops.

## Validate changes

```sh
npx --package renovate renovate-config-validator --strict default.json instant.json quiet.json renovate.json
```

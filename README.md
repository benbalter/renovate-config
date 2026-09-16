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
  commits.
- **Auto-merge**: patch + minor updates auto-merge once CI is green (`:automergeMinor`).
  `devDependencies` auto-merge freely; **major** production-dependency bumps require review.
- **`platformAutomerge: false`**: Renovate merges only after it observes CI is green, so the
  "tests must pass" gate holds regardless of a repo's branch-protection config. Trade-off: merge
  happens on Renovate's next run (minutes), not the instant CI turns green.
- **`minimumReleaseAge: "7 days"`**: quarantine window so freshly-published (potentially
  malicious) releases have time to be yanked before they auto-merge. Bump to `"14 days"` for a
  stricter posture.
- **Rate limits & schedule**: batched weekly, `prConcurrentLimit` / `prHourlyLimit` capped.
- **No digest/SHA pinning** (`pinDigests: false`): Actions and container images track tags, not
  SHAs. Digest pinning generates a PR per upgrade per repo, which drowns out the updates that
  actually matter. Set `pinDigests: true` in an individual repo if it genuinely needs it.
- **Grouping**: GitHub Actions minor/patch bumps land in one `github-actions` PR instead of one
  PR per action.
- **`internalChecksAsSuccess: true`**: counts Renovate's own `minimumReleaseAge` status as a
  passing check. Without it, a repo whose only green check is Renovate's internal one reports a
  *pending* branch status and **never auto-merges**. Real CI failures still block the merge.
- **Dependency Dashboard** enabled for at-a-glance visibility per repo.

## Security notes

See the [Renovate security docs](https://docs.renovatebot.com/security-and-permissions/). Key
points for this setup: dependency-update CI runs on branches in the target repo, so keep those
workflows' `GITHUB_TOKEN` permissions minimal and avoid exposing long-lived secrets to them.
`postUpgradeTasks` (arbitrary command execution) is intentionally not used and is disabled on
the Mend-hosted app.

## Troubleshooting: PRs aren't auto-merging

Renovate merges only when the branch status is **green**. Check, in order:

1. **Branch protection requiring an approving review.** Renovate cannot approve its own PR, so
   the merge API call fails every time. Either drop the review requirement on that repo or
   exempt the Renovate app.
2. **No CI at all on the repo.** Renovate resolves a branch to green only when the combined
   commit status is `success` or there is at least one successful check run. With neither, it
   resolves to yellow and refuses to merge.
3. **Only-internal checks.** Fixed here by `internalChecksAsSuccess: true` — see the policy
   summary above.
4. **Read the reason.** Renovate records a `prAutomergeBlockReason` (`BranchNotGreen`,
   `PlatformRejection`, `BranchModified`, `Conflicted`, `off schedule`) in the PR body and job
   log. That names the actual cause instead of guessing.

Note that the weekly `schedule` gates *branch creation*, not merging: `automergeSchedule`
defaults to `at any time`, and Renovate keeps processing branches that already have an open PR.
So the Monday window is not what's holding a merge back.

## Validate changes

```sh
npx --package renovate renovate-config-validator --strict default.json instant.json
```

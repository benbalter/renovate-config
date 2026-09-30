// Marks as done every inbox notification for a PR or issue that a dependency or automation
// bot opened, as long as no human has reviewed or commented on it and the notification isn't
// a mention or assignment. Open, merged, and closed threads all qualify: bot PRs that need
// attention surface through CI and the Renovate Dependency Dashboard, not the inbox.
//
// Runs under actions/github-script, or locally via run-local.js. The token needs the
// `notifications` scope (plus `repo` for private repos).

const BOTS = new Set([
  "renovate[bot]",
  "dependabot[bot]",
  "github-actions[bot]",
  "Copilot",
  "copilot-swe-agent[bot]",
]);

// Reasons that mean someone wants Ben specifically; never cleared.
const KEEP_REASONS = new Set(["mention", "team_mention", "assign"]);

function isBot(user) {
  return Boolean(user) && (BOTS.has(user.login) || user.type === "Bot");
}

// No person may have reviewed it; bot reviews (Copilot, approvers) are fine.
function hasOnlyBotReviews(reviews) {
  return reviews.every((r) => isBot(r.user));
}

async function latestCommentIsFromBot(github, thread) {
  const url = thread.subject.latest_comment_url;
  // No comment, or the "latest comment" is the PR/issue itself.
  if (!url || url === thread.subject.url) return true;
  const { data: comment } = await github.request(`GET ${url}`);
  return isBot(comment.user);
}

async function clearRenovateNotifications({ github, core, dryRun = false }) {
  // Includes read threads: they stay in the inbox until marked done.
  const notifications = await github.paginate("GET /notifications", { all: true, per_page: 50 });
  const threads = notifications.filter(
    (n) =>
      (n.subject?.type === "PullRequest" || n.subject?.type === "Issue") &&
      n.subject.url &&
      !KEEP_REASONS.has(n.reason),
  );

  const cleared = [];
  for (const thread of threads) {
    let subject;
    try {
      ({ data: subject } = await github.request(`GET ${thread.subject.url}`));
      if (!isBot(subject.user)) continue;

      if (thread.subject.type === "PullRequest") {
        const reviews = await github.paginate(`GET ${thread.subject.url}/reviews`, { per_page: 100 });
        if (!hasOnlyBotReviews(reviews)) continue;
      }
      if (!(await latestCommentIsFromBot(github, thread))) continue;
    } catch (error) {
      core.warning(`skip: can't read ${thread.subject.url} (${error.status ?? error.message})`);
      continue;
    }

    if (dryRun) {
      core.info(`would clear: ${subject.html_url}`);
    } else {
      await github.request("DELETE /notifications/threads/{thread_id}", { thread_id: thread.id });
      core.info(`cleared: ${subject.html_url}`);
    }
    cleared.push(subject.html_url);
  }

  core.info(`Done. ${cleared.length} notification(s) ${dryRun ? "matched" : "cleared"}.`);
  return cleared;
}

module.exports = clearRenovateNotifications;
module.exports.isBot = isBot;
module.exports.hasOnlyBotReviews = hasOnlyBotReviews;

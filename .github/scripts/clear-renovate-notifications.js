// Marks as done every inbox notification for a PR that Renovate opened, a bot approved,
// and Renovate merged, with no human review along the way.
//
// Runs under actions/github-script, or locally via run-local.js. The token needs the
// `notifications` scope (plus `repo` for private repos).

const RENOVATE = "renovate[bot]";

function isAutoMerged(pr) {
  return pr.user?.login === RENOVATE && pr.merged === true && pr.merged_by?.login === RENOVATE;
}

// A bot must have approved it, and no person may have reviewed it at all.
function isBotOnlyApproved(reviews) {
  return (
    reviews.some((r) => r.user?.type === "Bot" && r.state === "APPROVED") &&
    reviews.every((r) => r.user?.type === "Bot")
  );
}

async function clearRenovateNotifications({ github, core, dryRun = false }) {
  // Includes read threads: they stay in the inbox until marked done.
  const notifications = await github.paginate("GET /notifications", { all: true, per_page: 50 });
  const threads = notifications.filter((n) => n.subject?.type === "PullRequest" && n.subject.url);

  const cleared = [];
  for (const thread of threads) {
    let pr;
    try {
      ({ data: pr } = await github.request(`GET ${thread.subject.url}`));
    } catch (error) {
      core.warning(`skip: can't read ${thread.subject.url} (${error.status ?? error.message})`);
      continue;
    }
    if (!isAutoMerged(pr)) continue;

    const reviews = await github.paginate(`GET ${thread.subject.url}/reviews`, { per_page: 100 });
    if (!isBotOnlyApproved(reviews)) continue;

    if (dryRun) {
      core.info(`would clear: ${pr.html_url}`);
    } else {
      await github.request("DELETE /notifications/threads/{thread_id}", { thread_id: thread.id });
      core.info(`cleared: ${pr.html_url}`);
    }
    cleared.push(pr.html_url);
  }

  core.info(`Done. ${cleared.length} notification(s) ${dryRun ? "matched" : "cleared"}.`);
  return cleared;
}

module.exports = clearRenovateNotifications;
module.exports.isAutoMerged = isAutoMerged;
module.exports.isBotOnlyApproved = isBotOnlyApproved;

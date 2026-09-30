const { test } = require("node:test");
const assert = require("node:assert/strict");
const clearRenovateNotifications = require("./clear-renovate-notifications");
const { isBot, hasOnlyBotReviews } = clearRenovateNotifications;

const renovate = { login: "renovate[bot]", type: "Bot" };
const dependabot = { login: "dependabot[bot]", type: "Bot" };
const copilot = { login: "Copilot", type: "Bot" };
const human = { login: "benbalter", type: "User" };

test("isBot recognizes dependency and automation bots", () => {
  assert.equal(isBot(renovate), true);
  assert.equal(isBot(dependabot), true);
  assert.equal(isBot({ login: "some-app[bot]", type: "Bot" }), true);
  assert.equal(isBot(human), false);
  assert.equal(isBot(null), false);
});

test("hasOnlyBotReviews rejects any human review", () => {
  assert.equal(hasOnlyBotReviews([]), true);
  assert.equal(hasOnlyBotReviews([{ user: copilot, state: "COMMENTED" }]), true);
  assert.equal(hasOnlyBotReviews([{ user: copilot, state: "COMMENTED" }, { user: human, state: "APPROVED" }]), false);
});

// Fake github-script client: routes map to canned responses; DELETEs are recorded.
function fakeGithub(routes) {
  const deleted = [];
  const lookup = (route) => {
    if (!(route in routes)) throw Object.assign(new Error(`unexpected ${route}`), { status: 404 });
    return routes[route];
  };
  return {
    deleted,
    paginate: async (route) => lookup(route),
    request: async (route, params) => {
      if (route.startsWith("DELETE ")) {
        deleted.push(params.thread_id);
        return { data: undefined };
      }
      return { data: lookup(route) };
    },
  };
}

const quietCore = { info() {}, warning() {} };
const pr = (n) => `https://api.github.com/repos/o/r/pulls/${n}`;
const issue = (n) => `https://api.github.com/repos/o/r/issues/${n}`;
const comment = (n) => `https://api.github.com/repos/o/r/issues/comments/${n}`;
const thread = (id, type, url, extra = {}) => ({
  id,
  reason: "subscribed",
  subject: { type, url, latest_comment_url: extra.latestComment ?? url },
  ...(extra.reason ? { reason: extra.reason } : {}),
});
const subject = (n, user, kind = "pull") => ({ user, html_url: `https://github.com/o/r/${kind}/${n}` });

function scenario() {
  return fakeGithub({
    "GET /notifications": [
      thread("1", "PullRequest", pr(1)), // open Renovate PR, no comments → clear
      thread("2", "PullRequest", pr(2)), // merged Dependabot PR → clear
      thread("3", "PullRequest", pr(3)), // human reviewed → keep
      thread("4", "PullRequest", pr(4), { latestComment: comment(40) }), // human commented last → keep
      thread("5", "PullRequest", pr(5), { latestComment: comment(50) }), // bot commented last → clear
      thread("6", "PullRequest", pr(6)), // human-authored PR → keep
      thread("7", "PullRequest", pr(7), { reason: "mention" }), // mention on bot PR → keep
      thread("8", "Issue", issue(8)), // Renovate dashboard issue → clear
      thread("9", "PullRequest", pr(9)), // unreadable → warn and keep
      { id: "10", reason: "ci_activity", subject: { type: "CheckSuite", url: null } }, // not a PR → keep
    ],
    [`GET ${pr(1)}`]: subject(1, renovate),
    [`GET ${pr(1)}/reviews`]: [],
    [`GET ${pr(2)}`]: { ...subject(2, dependabot), merged: true, merged_by: human },
    [`GET ${pr(2)}/reviews`]: [],
    [`GET ${pr(3)}`]: subject(3, renovate),
    [`GET ${pr(3)}/reviews`]: [{ user: human, state: "APPROVED" }],
    [`GET ${pr(4)}`]: subject(4, renovate),
    [`GET ${pr(4)}/reviews`]: [],
    [`GET ${comment(40)}`]: { user: human },
    [`GET ${pr(5)}`]: subject(5, renovate),
    [`GET ${pr(5)}/reviews`]: [{ user: copilot, state: "COMMENTED" }],
    [`GET ${comment(50)}`]: { user: renovate },
    [`GET ${pr(6)}`]: subject(6, human),
    [`GET ${pr(7)}`]: subject(7, renovate),
    [`GET ${issue(8)}`]: subject(8, renovate, "issues"),
  });
}

test("clears bot threads with no human involvement, keeps everything else", async () => {
  const github = scenario();
  const warnings = [];
  const cleared = await clearRenovateNotifications({
    github,
    core: { info() {}, warning: (msg) => warnings.push(msg) },
  });

  assert.deepEqual(github.deleted, ["1", "2", "5", "8"]);
  assert.deepEqual(cleared, [
    "https://github.com/o/r/pull/1",
    "https://github.com/o/r/pull/2",
    "https://github.com/o/r/pull/5",
    "https://github.com/o/r/issues/8",
  ]);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /pulls\/9/);
});

test("dry run reports matches without marking anything done", async () => {
  const github = scenario();
  const cleared = await clearRenovateNotifications({ github, core: quietCore, dryRun: true });

  assert.deepEqual(github.deleted, []);
  assert.equal(cleared.length, 4);
});

test("fails loudly when notifications can't be listed", async () => {
  const github = fakeGithub({});
  await assert.rejects(clearRenovateNotifications({ github, core: quietCore }), /unexpected GET \/notifications/);
});

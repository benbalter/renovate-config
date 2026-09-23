const { test } = require("node:test");
const assert = require("node:assert/strict");
const clearRenovateNotifications = require("./clear-renovate-notifications");
const { isAutoMerged, isBotOnlyApproved } = clearRenovateNotifications;

const renovate = { login: "renovate[bot]", type: "Bot" };
const human = { login: "benbalter", type: "User" };
const approver = { login: "renovate-approve[bot]", type: "Bot" };
const botApproval = { user: approver, state: "APPROVED" };

const autoMergedPr = (n) => ({
  user: renovate,
  merged: true,
  merged_by: renovate,
  html_url: `https://github.com/o/r/pull/${n}`,
});

test("isAutoMerged requires Renovate to open and merge the PR", () => {
  assert.equal(isAutoMerged(autoMergedPr(1)), true);
  assert.equal(isAutoMerged({ ...autoMergedPr(1), merged: false, merged_by: null }), false);
  assert.equal(isAutoMerged({ ...autoMergedPr(1), merged_by: human }), false);
  assert.equal(isAutoMerged({ ...autoMergedPr(1), user: human }), false);
});

test("isBotOnlyApproved requires a bot approval and no human reviews", () => {
  assert.equal(isBotOnlyApproved([botApproval]), true);
  assert.equal(isBotOnlyApproved([]), false);
  assert.equal(isBotOnlyApproved([{ user: approver, state: "COMMENTED" }]), false);
  assert.equal(isBotOnlyApproved([botApproval, { user: human, state: "APPROVED" }]), false);
  assert.equal(isBotOnlyApproved([botApproval, { user: human, state: "COMMENTED" }]), false);
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
const api = (n) => `https://api.github.com/repos/o/r/pulls/${n}`;
const prThread = (id, n) => ({ id, subject: { type: "PullRequest", url: api(n) } });

function scenario() {
  return fakeGithub({
    "GET /notifications": [
      prThread("1", 1), // auto-merged, bot-approved → clear
      prThread("2", 2), // human merged → keep
      prThread("3", 3), // human also reviewed → keep
      prThread("4", 4), // still open → keep
      prThread("5", 5), // PR unreadable → warn and keep
      { id: "6", subject: { type: "Issue", url: "https://api.github.com/repos/o/r/issues/6" } },
      { id: "7", subject: { type: "CheckSuite", url: null } },
    ],
    [`GET ${api(1)}`]: autoMergedPr(1),
    [`GET ${api(1)}/reviews`]: [botApproval],
    [`GET ${api(2)}`]: { ...autoMergedPr(2), merged_by: human },
    [`GET ${api(3)}`]: autoMergedPr(3),
    [`GET ${api(3)}/reviews`]: [botApproval, { user: human, state: "APPROVED" }],
    [`GET ${api(4)}`]: { ...autoMergedPr(4), merged: false, merged_by: null },
  });
}

test("clears only auto-merged, bot-approved Renovate PR threads", async () => {
  const github = scenario();
  const warnings = [];
  const cleared = await clearRenovateNotifications({
    github,
    core: { info() {}, warning: (msg) => warnings.push(msg) },
  });

  assert.deepEqual(github.deleted, ["1"]);
  assert.deepEqual(cleared, ["https://github.com/o/r/pull/1"]);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /pulls\/5/);
});

test("dry run reports matches without marking anything done", async () => {
  const github = scenario();
  const cleared = await clearRenovateNotifications({ github, core: quietCore, dryRun: true });

  assert.deepEqual(github.deleted, []);
  assert.deepEqual(cleared, ["https://github.com/o/r/pull/1"]);
});

test("fails loudly when notifications can't be listed", async () => {
  const github = fakeGithub({});
  await assert.rejects(clearRenovateNotifications({ github, core: quietCore }), /unexpected GET \/notifications/);
});

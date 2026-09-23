// Runs clear-renovate-notifications.js outside Actions with a minimal fetch-based stand-in
// for github-script's Octokit client:
//
//   GH_TOKEN=$(gh auth token) DRY_RUN=true node .github/scripts/run-local.js

const clearRenovateNotifications = require("./clear-renovate-notifications");

const token = process.env.GH_TOKEN;
if (!token) throw new Error("GH_TOKEN is required");

async function call(route, params = {}) {
  const [method, path] = route.split(" ");
  const query = { ...params };
  const url = new URL(
    path.replace(/\{(\w+)\}/g, (_, key) => {
      const value = query[key];
      delete query[key];
      return encodeURIComponent(value);
    }),
    "https://api.github.com",
  );
  for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);

  const response = await fetch(url, {
    method,
    headers: { authorization: `Bearer ${token}`, accept: "application/vnd.github+json" },
  });
  if (!response.ok) {
    const error = new Error(`${method} ${url} → HTTP ${response.status}`);
    error.status = response.status;
    throw error;
  }
  const data = response.status === 204 ? undefined : await response.json();
  return { data, next: response.headers.get("link")?.match(/<([^>]+)>;\s*rel="next"/)?.[1] };
}

const github = {
  request: call,
  async paginate(route, params) {
    const results = [];
    let page = await call(route, params);
    for (;;) {
      results.push(...page.data);
      if (!page.next) return results;
      page = await call(`GET ${page.next}`);
    }
  },
};

const core = { info: console.log, warning: (msg) => console.warn(`warning: ${msg}`) };

clearRenovateNotifications({ github, core, dryRun: process.env.DRY_RUN === "true" }).catch((error) => {
  console.error(error.message);
  process.exit(1);
});

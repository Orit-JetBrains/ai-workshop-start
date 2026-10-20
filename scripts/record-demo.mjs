#!/usr/bin/env node
// Records the GitHub answers the demo runs on, so the Playwright tests replay the demo's data
// instead of scanning live GitHub. Needs a token: GITHUB_TOKEN, or an existing `gh` login.
//
//   node scripts/record-demo.mjs            # rewrite tests/demo/github.json
//
// Only the fields the scan reads are kept, so the recording stays small and readable. Rerun it when
// the demo should show newer data; the numbers in tests/demo/demo.spec.ts then change with it.
import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { openGitHub, openOrganization } from '../src/core/github.ts';
import { scan, scanOrganization } from '../src/core/scan.ts';

/** What the demo scans, in its order: the organization, then the repository chosen from its list. */
export const ORGANIZATION = 'github.com/modelcontextprotocol';
export const REPOSITORY = 'https://github.com/modelcontextprotocol/inspector';

const file = fileURLToPath(new URL('../tests/demo/github.json', import.meta.url));

const token = process.env.GITHUB_TOKEN || spawnSync('gh', ['auth', 'token'], { encoding: 'utf8' }).stdout?.trim();
if (!token) {
  console.error('A GitHub token is required: set GITHUB_TOKEN or log in with gh auth login.');
  process.exit(1);
}

/** Every answer, by request URL, as src/core/replay.ts replays it. */
const recording = {};

const record = async (url, init) => {
  const response = await fetch(url, init);
  const body = await response.clone().text();
  recording[url] = { status: response.status, body: keep(url, response.status, body) };
  return response;
};

/** Only what the scan reads: a recorded tree of intellij-community is otherwise megabytes. */
function keep(url, status, body) {
  if (!url.startsWith('https://api.github.com/') || status !== 200) return body;
  const value = JSON.parse(body);
  if (/\/users\/[^/]+$/.test(url)) return { login: value.login, type: value.type };
  if (/\/(orgs|users)\/[^/]+\/repos\?/.test(url)) return value.map(({ full_name, default_branch }) => ({ full_name, default_branch }));
  if (/\/repos\/[^/]+\/[^/]+$/.test(url)) return { full_name: value.full_name, default_branch: value.default_branch };
  if (/\/commits\//.test(url)) return { sha: value.sha };
  // A skill's last commit: its date is all the scan reads of it.
  if (/\/commits\?/.test(url)) return value.map(({ commit }) => ({ commit: { committer: { date: commit?.committer?.date } } }));
  if (/\/git\/trees\//.test(url)) {
    return { truncated: value.truncated, tree: value.tree.map(({ path, mode, type, sha }) => ({ path, mode, type, sha })) };
  }
  if (/\/search\/code\?/.test(url)) return { total_count: value.total_count, items: value.items.map(({ path }) => ({ path })) };
  return value;
}

const options = { fetch: record, token };
const organization = await scanOrganization(await openOrganization(ORGANIZATION, options));
console.log(`${organization.organization} · ${organization.repositories} repositories, ${organization.withSkills.length} with skills`);
for (const repository of organization.withSkills) console.log(`  ${repository.name} · ${repository.skills} skills`);

const repository = await scan(await openGitHub(REPOSITORY, options));
console.log(`${repository.repository.id} · ${repository.skills.length} skills`);

// Sorted by URL: a rerun that changes one answer shows that answer in the diff, not a new order.
const sorted = Object.fromEntries(Object.keys(recording).sort().map((url) => [url, recording[url]]));
writeFileSync(file, `${JSON.stringify(sorted, null, 2)}\n`);
console.log(`${Object.keys(sorted).length} answers recorded in tests/demo/github.json`);

#!/usr/bin/env node
// Live CLI snapshots. Keep them separate from npm test: upstream repositories change over time.
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const snapshots = join(root, 'tests/snapshots/real-repos');
const repos = ['MPS', 'android', 'Koog'];
const args = process.argv.slice(2);
const update = args.length === 1 && args[0] === '--update';
if (args.length > 0 && !update) {
  console.error('Usage: node scripts/real-repos.mjs [--update]');
  process.exit(2);
}

const token = process.env.GITHUB_TOKEN || spawnSync('gh', ['auth', 'token'], { encoding: 'utf8' }).stdout?.trim();
if (!token) {
  console.error('A GitHub token is required: set GITHUB_TOKEN or log in with gh auth login.');
  process.exit(1);
}

const results = new Map();
for (const repo of repos) {
  const result = spawnSync(process.execPath, [join(root, 'src/cli.ts'), 'scan', `https://github.com/JetBrains/${repo}`], {
    encoding: 'utf8',
    env: { ...process.env, GITHUB_TOKEN: token },
    maxBuffer: 16 * 1024 * 1024,
    timeout: 120_000,
  });
  if (result.status !== 0) {
    console.error(`${repo}: scan failed (${result.error?.message ?? `exit ${result.status}`})`);
    if (result.stderr) console.error(result.stderr.trimEnd());
    process.exit(1);
  }
  results.set(repo, { stdout: result.stdout, stderr: result.stderr });
  console.log(`${repo}: ${result.stdout.split('\n')[0]}`);
}

if (update) {
  mkdirSync(snapshots, { recursive: true });
  for (const [repo, streams] of results) {
    for (const [stream, output] of Object.entries(streams)) {
      writeFileSync(join(snapshots, `${repo}.${stream}.txt`), output);
    }
  }
  console.log('Updated real repository snapshots. Review their diff before committing.');
  process.exit(0);
}

// The snapshot retains the original commit for provenance; comparison ignores only link hashes.
function comparable(output) {
  return output.replace(/(https:\/\/github\.com\/JetBrains\/[^/\s]+\/blob\/)[0-9a-f]{40}(\/)/g, '$1<commit>$2');
}

const temp = mkdtempSync(join(tmpdir(), 'skill-atlas-snapshot-'));
let changed = false;
try {
  for (const [repo, streams] of results) {
    for (const [stream, output] of Object.entries(streams)) {
      const file = `${repo}.${stream}.txt`;
      const snapshot = join(snapshots, file);
      let expected;
      try {
        expected = readFileSync(snapshot, 'utf8');
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
        console.error(`Missing snapshot: ${snapshot}`);
        changed = true;
        continue;
      }
      const expectedFile = join(temp, `expected-${file}`);
      const actualFile = join(temp, `actual-${file}`);
      writeFileSync(expectedFile, comparable(expected));
      writeFileSync(actualFile, comparable(output));
      const diff = spawnSync('diff', ['-u', expectedFile, actualFile], { encoding: 'utf8' });
      if (diff.status === 1) {
        changed = true;
        console.error(`${repo} ${stream} changed:\n${diff.stdout}`);
      } else if (diff.status !== 0) {
        throw new Error(`diff failed: ${diff.error?.message ?? diff.stderr}`);
      }
    }
  }
} finally {
  rmSync(temp, { recursive: true, force: true });
}

if (changed) {
  console.error('Review the differences, then run npm run test:real:update to accept them.');
  process.exit(1);
}
console.log('All real repository snapshots match.');

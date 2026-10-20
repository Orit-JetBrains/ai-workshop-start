// `npm run e2e`: the screenshot check, in the container that pins the rendering.
//
// Outside the container it builds tests/e2e/Dockerfile — cached after the first time — and runs
// itself inside it; inside, it runs Playwright. CI runs the same command, so the baselines in
// tests/e2e/screenshots are made by the very machine that compares against them. Arguments go
// through to `playwright test`, so `npm run e2e -- --update-snapshots` remakes the baselines and
// `npm run e2e -- -g organization` runs one of them.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
/** Bumped with @playwright/test in package.json, and with the versions in tests/e2e/Dockerfile. */
const IMAGE = 'skill-atlas-e2e:1.64.1';

const args = process.argv.slice(2);

function run(command, commandArgs, options = {}) {
  const { status, error } = spawnSync(command, commandArgs, { stdio: 'inherit', cwd: ROOT, ...options });
  if (error?.code === 'ENOENT') fail(`${command} is not installed; it is what runs the screenshots' browser`);
  return status ?? 1;
}

function fail(message) {
  console.error(`npm run e2e: ${message}`);
  process.exit(1);
}

if (process.env.E2E_IN_CONTAINER) {
  process.exit(run(process.execPath, [fileURLToPath(new URL('../node_modules/@playwright/test/cli.js', import.meta.url)), 'test', ...args]));
}

// The proxy of this machine, if it has one, so the build can reach the Node and Chrome downloads.
const proxy = ['http_proxy', 'https_proxy', 'no_proxy'].flatMap((name) => {
  const value = process.env[name] ?? process.env[name.toUpperCase()];
  return value ? ['--build-arg', `${name}=${value}`] : [];
});
const built = run('docker', ['build', '--quiet', ...proxy, '-t', IMAGE, '-f', 'tests/e2e/Dockerfile', 'tests/e2e'], { stdio: ['ignore', 'ignore', 'inherit'] });
if (built !== 0) fail(`could not build ${IMAGE} from tests/e2e/Dockerfile`);

process.exit(
  run('docker', [
    'run',
    '--rm',
    // The repository itself, written back: the baselines and the videos land in the working tree.
    '--volume',
    `${ROOT}:/work`,
    '--workdir',
    '/work',
    // As the user who ran npm, so nothing in the working tree ends up owned by root; a platform
    // without user ids maps the files itself.
    ...(process.getuid ? ['--user', `${process.getuid()}:${process.getgid?.() ?? 0}`] : []),
    '--env',
    'HOME=/tmp',
    '--env',
    'E2E_IN_CONTAINER=1',
    ...(process.env.CI ? ['--env', 'CI=1'] : []),
    // Chrome's shared memory is small in a container; its own is not.
    '--ipc=host',
    // The server and the browser only ever talk over loopback: the check has no network at all.
    '--network=none',
    IMAGE,
    'node',
    'scripts/e2e.mjs',
    ...args,
  ]),
);

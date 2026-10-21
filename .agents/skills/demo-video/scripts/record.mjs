// Records a demo of the web view: starts a real `./skill-atlas serve`, drives a real browser
// through one of the prepared cases in scenarios.mjs, and encodes the capture to MP4.
//
//   node .agents/skills/demo-video/scripts/record.mjs <case> [options]
//   node .agents/skills/demo-video/scripts/record.mjs --list
//
//   --out <path>          where the MP4 goes (default docs/demo/<case>.mp4)
//   --set <key>=<value>   override one of the case's inputs, repeatable
//   --url <address>       record against a server already running, and do not start one
//   --keep-webm           keep Playwright's raw .webm beside the MP4
//
// Needs scripts/setup.sh once; see SKILL.md.
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, readdir, rm, copyFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { scenarios } from './scenarios.mjs';

const TOOLS = process.env.DEMO_TOOLS ?? '/tmp/skill-atlas-demo-tools';
const CHROME = process.env.DEMO_CHROME ?? join(TOOLS, 'chrome-linux64/chrome');
const SIZE = { width: 1280, height: 760 };

function parseArguments(argv) {
  const options = { set: {} };
  let name;
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--list') options.list = true;
    else if (argument === '--keep-webm') options.keepWebm = true;
    else if (argument === '--out') options.out = argv[++index];
    else if (argument === '--url') options.url = argv[++index];
    else if (argument === '--set') {
      const [key, ...rest] = argv[++index].split('=');
      options.set[key] = rest.join('=');
    } else if (argument.startsWith('-')) fail(`Unknown option: ${argument}`);
    else name = argument;
  }
  return { name, options };
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

/** `./skill-atlas serve 0`, on a free port, with the environment the scan needs. */
async function startServer() {
  const token = process.env.GITHUB_TOKEN ?? (await githubToken());
  if (!token) {
    console.error('warning: no GITHUB_TOKEN and no gh login; an organization scan will fail');
  }
  const server = spawn('./skill-atlas', ['serve', '0'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      // Node's fetch ignores http_proxy unless this is set, and a sandboxed workspace usually
      // reaches GitHub only through that proxy: without it every scan fails with EAI_AGAIN.
      NODE_USE_ENV_PROXY: '1',
      ...(token ? { GITHUB_TOKEN: token } : {}),
    },
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  const url = await new Promise((resolve, reject) => {
    let output = '';
    const timer = setTimeout(() => reject(new Error('serve printed no address')), 30_000);
    server.stdout.on('data', (chunk) => {
      output += chunk;
      const match = output.match(/http:\/\/127\.0\.0\.1:\d+\//);
      if (match) {
        clearTimeout(timer);
        resolve(match[0]);
      }
    });
    server.on('exit', (code) => reject(new Error(`serve exited with ${code}`)));
  });
  return { url, stop: () => server.kill() };
}

/** The `gh` login, so a demo needs no token of its own. */
function githubToken() {
  return new Promise((resolve) => {
    const gh = spawn('gh', ['auth', 'token'], { stdio: ['ignore', 'pipe', 'ignore'] });
    let output = '';
    gh.stdout.on('data', (chunk) => (output += chunk));
    gh.on('exit', (code) => resolve(code === 0 ? output.trim() : undefined));
    gh.on('error', () => resolve(undefined));
  });
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'inherit', 'inherit'] });
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`${command} → ${code}`))));
    child.on('error', reject);
  });
}

const { name, options } = parseArguments(process.argv.slice(2));

if (options.list || !name) {
  console.log('Prepared cases:');
  for (const [key, scenario] of Object.entries(scenarios)) {
    console.log(`  ${key.padEnd(24)} ${scenario.description}`);
    console.log(`  ${' '.repeat(24)} inputs: ${JSON.stringify(scenario.defaults)}`);
  }
  process.exit(options.list ? 0 : 1);
}

const scenario = scenarios[name];
if (!scenario) fail(`Unknown case: ${name}. Run with --list to see them.`);

const inputs = { ...scenario.defaults, ...options.set };
const out = options.out ?? `docs/demo/${name}.mp4`;

// Playwright lives in the tools directory, not in this project's node_modules, so it is imported
// by path. It is CommonJS: imported that way its exports arrive under `default`.
const playwright = await import(pathToFileURL(join(TOOLS, 'node_modules/playwright/index.js')));
const chromium = playwright.chromium ?? playwright.default?.chromium;
if (!chromium) fail(`No Playwright in ${TOOLS}. Run .agents/skills/demo-video/scripts/setup.sh`);

const server = options.url ? undefined : await startServer();
const url = options.url ?? server.url;
const videoDirectory = await mkdtemp(join(tmpdir(), 'skill-atlas-demo-'));

const browser = await chromium.launch({
  executablePath: CHROME,
  args: ['--force-color-profile=srgb', '--hide-scrollbars'],
});
const context = await browser.newContext({
  viewport: SIZE,
  deviceScaleFactor: 1,
  colorScheme: 'light',
  recordVideo: { dir: videoDirectory, size: SIZE },
});
const page = await context.newPage();

// Playwright starts capturing when the page is created, so this is frame zero: every cut below is
// measured against it.
const started = Date.now();
const at = () => (Date.now() - started) / 1000;
/** The stretches of the capture to drop, in seconds: `[[from, to], …]`. */
const cuts = [];

const wait = (ms) => page.waitForTimeout(ms);

/**
 * Marks whatever `work` waits for as dead air and drops it from the encode. A scan is however long
 * GitHub takes — seconds of an empty list, and a different number of them every run, so trimming
 * the finished file by hand is wrong twice over. `keep` is how much to leave at each end, so the
 * cut lands inside a held screen rather than on the frame that changes it.
 */
async function cut(work, { keep = 800 } = {}) {
  const from = at() + keep / 1000;
  const value = await work();
  const to = at() - keep / 1000;
  if (to - from > 0.2) cuts.push([from, to]);
  return value;
}

/** A caption strip at the bottom of the frame. The page itself is never modified. */
const caption = (text) =>
  page.evaluate((text) => {
    let node = document.getElementById('demo-caption');
    if (!node) {
      node = document.createElement('div');
      node.id = 'demo-caption';
      node.style.cssText =
        'position:fixed;left:0;right:0;bottom:0;z-index:9999;padding:.6rem 1rem;' +
        'background:#111c;color:#fff;font:600 15px system-ui,sans-serif;text-align:center;' +
        'backdrop-filter:blur(2px)';
      document.body.append(node);
    }
    node.textContent = text;
  }, text);

/** Typing a character at a time: a value that appears at once reads as a cut, not as a demo. */
async function type(selector, text) {
  await page.click(selector);
  await page.fill(selector, '');
  await page.type(selector, text, { delay: 55 });
}

/** The filter hides the entries it rejects, so only a visible one can be hovered or clicked. */
async function choose(role, text) {
  const item = page
    .locator(`#results li.${role}:not([hidden])`, text ? { hasText: text } : {})
    .first();
  await item.scrollIntoViewIfNeeded();
  await item.hover();
  await wait(700);
  await item.click();
}

const countText = async () => (await page.textContent('#count'))?.trim();
const headingText = async () => (await page.textContent('#list h1'))?.trim();

try {
  await page.goto(url);
  await scenario.run({ page, caption, type, wait, cut, choose, countText, headingText }, inputs);
} finally {
  await context.close();
  await browser.close();
  server?.stop();
}

const [webm] = (await readdir(videoDirectory)).filter((file) => file.endsWith('.webm'));
if (!webm) fail('Playwright captured no video');
const raw = join(videoDirectory, webm);

/**
 * The filter that drops the marked stretches: the capture is cut into the parts between them and
 * concatenated back. Without any cut it is the plain scale, so a case that marks nothing encodes
 * exactly as it did before.
 */
function filter(ranges, duration) {
  const scale = `fps=15,scale=${SIZE.width}:-2:flags=lanczos`;
  if (ranges.length === 0) return ['-vf', scale];

  const keeps = [];
  let from = 0;
  for (const [cutFrom, cutTo] of ranges) {
    if (cutFrom > from) keeps.push([from, cutFrom]);
    from = cutTo;
  }
  if (from < duration) keeps.push([from, duration]);

  const parts = keeps.map(
    ([keepFrom, keepTo], index) =>
      `[0:v]trim=start=${keepFrom.toFixed(3)}:end=${keepTo.toFixed(3)},setpts=PTS-STARTPTS[k${index}]`,
  );
  const inputs = keeps.map((_, index) => `[k${index}]`).join('');
  return [
    '-filter_complex',
    `${parts.join(';')};${inputs}concat=n=${keeps.length}:v=1[cut];[cut]${scale}[out]`,
    '-map', '[out]',
  ];
}

/** How long Playwright's capture actually ran, which no scenario knows in advance. */
async function duration(file) {
  const probe = spawn('ffprobe', [
    '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file,
  ], { stdio: ['ignore', 'pipe', 'inherit'] });
  let output = '';
  probe.stdout.on('data', (chunk) => (output += chunk));
  await new Promise((resolve, reject) => {
    probe.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`ffprobe → ${code}`))));
    probe.on('error', reject);
  });
  return Number.parseFloat(output.trim());
}

await mkdir(dirname(out), { recursive: true });
// 15 fps and CRF 26 keep a 40 s take well under a megabyte; faststart lets it play while loading.
await run('ffmpeg', [
  '-hide_banner', '-v', 'error', '-y',
  '-i', raw,
  ...filter(cuts, await duration(raw)),
  '-c:v', 'libx264', '-preset', 'slow', '-crf', '26',
  '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
  out,
]);

if (options.keepWebm) await copyFile(raw, out.replace(/\.mp4$/, '.webm'));
await rm(videoDirectory, { recursive: true, force: true });

const dropped = cuts.reduce((total, [from, to]) => total + (to - from), 0);
console.log(
  `recorded ${name} → ${out}` + (dropped ? ` (${dropped.toFixed(1)}s of waiting cut)` : ''),
);

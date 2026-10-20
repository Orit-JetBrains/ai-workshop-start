// The local web view: a page with a field for a repository, its skills and their SKILL.md. The
// scan is the core's, on the server, so local directories and GITHUB_TOKEN work as for the CLI.
import { createServer, type Server } from 'node:http';
import { AtlasError } from './core/errors.ts';
import { skillLink } from './core/model.ts';
import { scan, type Source } from './core/scan.ts';

/** Starts the web view on 127.0.0.1; resolves to its address once it listens. */
export async function serve(port: number, open: (input: string) => Promise<Source>): Promise<{ url: string; server: Server }> {
  const server = createServer(async (request, response) => {
    const send = (status: number, type: string, body: string) => {
      response.writeHead(status, { 'Content-Type': `${type}; charset=utf-8`, 'Cache-Control': 'no-store' });
      response.end(body);
    };
    let url: URL;
    try {
      url = new URL(request.url ?? '/', 'http://127.0.0.1');
    } catch {
      return send(400, 'application/json', JSON.stringify({ error: 'Invalid request URL' }));
    }
    if (request.method !== 'GET') return send(405, 'text/plain', 'Method not allowed');
    if (url.pathname === '/') return send(200, 'text/html', PAGE);
    if (url.pathname !== '/api/scan') return send(404, 'text/plain', 'Not found');
    try {
      send(200, 'application/json', JSON.stringify(await scanWithText(url.searchParams.get('repo') ?? '', open)));
    } catch (error) {
      const message = error instanceof AtlasError ? error.message : `Unexpected error: ${error instanceof Error ? error.message : String(error)}`;
      send(400, 'application/json', JSON.stringify({ error: message }));
    }
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', (error: NodeJS.ErrnoException) =>
      reject(error.code === 'EADDRINUSE' ? new AtlasError(`Port ${port} is in use; try serve <port>`) : error),
    );
    server.listen(port, '127.0.0.1', resolve);
  });
  const address = server.address();
  return { url: `http://127.0.0.1:${typeof address === 'object' && address ? address.port : port}/`, server };
}

/** The scan, each skill with its link and the SKILL.md it was read from. */
async function scanWithText(input: string, open: (input: string) => Promise<Source>) {
  if (!input.trim()) throw new AtlasError('Enter a GitHub URL or a directory');
  const source = await open(input.trim());
  // The files the scan reads, kept for this answer only.
  const texts = new Map<string, string>();
  const result = await scan({
    ...source,
    read: async (path) => {
      const bytes = await source.read(path);
      if (bytes) texts.set(path, new TextDecoder().decode(bytes));
      return bytes;
    },
  });
  return {
    repository: result.repository,
    skills: result.skills.map((skill) => ({ ...skill, link: skillLink(result.repository, skill), text: texts.get(skill.path) ?? '' })),
    warnings: result.warnings,
  };
}

const PAGE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Skill Atlas</title>
<style>
  :root { color-scheme: light dark; font-family: system-ui, sans-serif; }
  body { margin: 0; display: grid; grid-template-rows: auto 1fr; height: 100vh; }
  form { display: flex; gap: .5rem; padding: .75rem 1rem; border-bottom: 1px solid #8884; }
  form input { flex: 1; font: inherit; padding: .4rem .6rem; }
  form button { font: inherit; padding: .4rem 1rem; }
  main { display: grid; grid-template-columns: minmax(16rem, 1fr) 2fr; min-height: 0; }
  #list, #file { overflow: auto; padding: 1rem; min-height: 0; }
  #list { border-right: 1px solid #8884; }
  h1 { font-size: 1.1rem; margin: 0 0 .75rem; }
  ul { list-style: none; margin: 0; padding: 0; }
  li.skill { padding: .5rem; border-radius: 6px; cursor: pointer; }
  li.skill:hover { background: #8882; }
  li.skill[aria-selected="true"] { background: #4a90e233; }
  .name { font-weight: 600; }
  .description, .copies { font-size: .9rem; opacity: .8; }
  .link { font-size: .8rem; word-break: break-all; }
  .warnings { margin-top: 1rem; font-size: .85rem; color: #b8860b; }
  .error { color: #d33; }
  pre { margin: 0; white-space: pre-wrap; word-break: break-word; font-size: .9rem; }
</style>
</head>
<body>
<form id="scan">
  <input id="repo" name="repo" placeholder="https://github.com/owner/repo or a local directory" aria-label="Repository" required>
  <button>Scan</button>
</form>
<main>
  <section id="list"></section>
  <section id="file"></section>
</main>
<script>
const list = document.getElementById('list');
const file = document.getElementById('file');
const repo = document.getElementById('repo');

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function choose(item, skill) {
  for (const other of list.querySelectorAll('li.skill')) other.setAttribute('aria-selected', 'false');
  item.setAttribute('aria-selected', 'true');
  file.replaceChildren(element('h1', '', skill.path), element('pre', '', skill.text));
}

let latestScan = 0;

async function scan(input) {
  const scanId = ++latestScan;
  history.replaceState(null, '', '?repo=' + encodeURIComponent(input));
  list.replaceChildren(element('p', '', 'Scanning…'));
  file.replaceChildren();
  let answer;
  try {
    const response = await fetch('/api/scan?repo=' + encodeURIComponent(input));
    answer = await response.json();
  } catch (error) {
    answer = { error: String(error) };
  }
  if (scanId !== latestScan) return;
  if (answer.error) return list.replaceChildren(element('p', 'error', answer.error));
  const count = answer.skills.length;
  const items = element('ul');
  for (const skill of answer.skills) {
    const item = element('li', 'skill');
    item.tabIndex = 0;
    item.setAttribute('role', 'option');
    item.append(element('div', 'name', skill.name));
    if (skill.description) item.append(element('div', 'description', skill.description));
    const link = element('a', 'link', skill.link);
    link.href = skill.link;
    link.target = '_blank';
    item.append(link);
    if (skill.copies.length) item.append(element('div', 'copies', 'also in ' + skill.copies.join(', ')));
    item.addEventListener('click', (event) => { if (event.target !== link) choose(item, skill); });
    item.addEventListener('keydown', (event) => { if (event.key === 'Enter') choose(item, skill); });
    items.append(item);
  }
  list.replaceChildren(element('h1', '', answer.repository.id + ' · ' + count + (count === 1 ? ' skill' : ' skills')), items);
  if (answer.warnings.length) {
    const warnings = element('ul', 'warnings');
    for (const warning of answer.warnings) warnings.append(element('li', '', 'warning: ' + warning));
    list.append(warnings);
  }
  const first = items.querySelector('li.skill');
  if (first) choose(first, answer.skills[0]);
}

document.getElementById('scan').addEventListener('submit', (event) => {
  event.preventDefault();
  scan(repo.value.trim());
});
const initial = new URLSearchParams(location.search).get('repo');
if (initial) { repo.value = initial; scan(initial); }
</script>
</body>
</html>
`;

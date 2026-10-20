// The demo's server: a real `skill-atlas serve`, with GitHub answered from tests/demo/github.json
// instead of the network. Playwright starts it (see playwright.config.ts) and stops it after the
// run; it prints its address the way the CLI does.
//
// Nothing here reaches GitHub: replay() without a fallback fails on any URL that was not recorded,
// so a test that drifts off the demo's data fails instead of quietly scanning live.
import { readFileSync } from 'node:fs';
import { openGitHub, openOrganization } from '../../src/core/github.ts';
import { replay, type Recording } from '../../src/core/replay.ts';
import { serve } from '../../src/web.ts';

const recording = JSON.parse(readFileSync(new URL('github.json', import.meta.url), 'utf8')) as Recording;
// A token, as the demo was recorded with one: the scan then finds SKILL.md files through code search.
const options = { fetch: replay(recording), token: 'recorded' };

const port = Number(process.env.DEMO_PORT ?? 4322);
const { url } = await serve(
  port,
  (input) => openGitHub(input, options),
  (input) => openOrganization(input, options),
);
console.log(`Skill Atlas: ${url}`);

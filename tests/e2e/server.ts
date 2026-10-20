// `skill-atlas serve` for the screenshots: the real server and the real page, with GitHub answered
// from tests/e2e/recording.ts. Prints its address, as the CLI does, and serves until it is killed.
//
//     node tests/e2e/server.ts [port]
import { openGitHub, openOrganization } from '../../src/core/github.ts';
import { replay } from '../../src/core/replay.ts';
import { serve } from '../../src/web.ts';
import { recording } from './recording.ts';

const port = Number(process.argv[2] ?? 0);
const fetch = replay(recording());
const { url } = await serve(
  port,
  (input) => openGitHub(input, { fetch, token: 'test' }),
  (input) => openOrganization(input, { fetch, token: 'test' }),
);
console.log(`Skill Atlas: ${url}`);

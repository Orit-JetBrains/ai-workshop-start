#!/usr/bin/env node
// The Node client: a GitHub repository through the GitHub API, or a local directory; stdout and
// stderr, or the local web view. Nothing is stored.
import { run } from './commands.ts';
import { AtlasError } from './core/errors.ts';
import { openGitHub, openOrganization, parseGitHubOrganization, parseGitHubUrl } from './core/github.ts';
import { openDirectory } from './local.ts';
import { serve } from './web.ts';

const token = process.env.GITHUB_TOKEN || undefined;

/** One repository, as `scan` and the web view take it; an organization is opened on its own, below. */
const open = async (input: string) => {
  if (parseGitHubUrl(input)) return openGitHub(input, { fetch, token });
  if (parseGitHubOrganization(input)) {
    throw new AtlasError(`${input} is an organization, not a repository: scan it with skill-atlas scan ${input}`);
  }
  return openDirectory(input);
};

const organization = (input: string) => openOrganization(input, { fetch, token });

process.exitCode = await run(process.argv.slice(2), {
  open,
  openOrganization: organization,
  print: (text) => console.log(text),
  error: (text) => console.error(text),
  serve: async (port) => (await serve(port, open, organization)).url,
});

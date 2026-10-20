// The screenshot check: a real browser on a really running `skill-atlas serve`, compared with the
// baselines in tests/e2e/screenshots. Run it with `npm run e2e`, which puts this in the Playwright
// container — the browser, the fonts and the rendering of the CI job, so a baseline made on a
// laptop is the one CI compares against.
import { defineConfig } from '@playwright/test';

/** The port the screenshots' server listens on; private to this check. */
const PORT = 4399;

export default defineConfig({
  testDir: 'tests/e2e',
  // The baselines of one platform only: the container is Linux, as CI is.
  snapshotPathTemplate: 'tests/e2e/screenshots/{arg}-{platform}{ext}',
  // The server is one process with one recording: the tests take turns on it.
  fullyParallel: false,
  workers: 1,
  // A screenshot that only passes on a second try is a flake, not a pass.
  retries: 0,
  forbidOnly: Boolean(process.env.CI),
  timeout: 30_000,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list'], ['html', { open: 'never' }]],
  expect: {
    // One changed pixel is a failure: no tolerance at all, neither per pixel nor in how many differ.
    toHaveScreenshot: { maxDiffPixels: 0, maxDiffPixelRatio: 0, threshold: 0, animations: 'disabled', scale: 'css' },
  },
  use: {
    baseURL: `http://127.0.0.1:${PORT}/`,
    browserName: 'chromium',
    // Everything the page's looks depend on, pinned: the page follows the system theme and lays
    // itself out in a grid, so the theme and the viewport belong to the baseline.
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 1,
    colorScheme: 'light',
    locale: 'en-US',
    timezoneId: 'UTC',
    // The video of every run, passing or not: what the browser did, to watch after the fact.
    video: 'on',
    trace: 'retain-on-failure',
    launchOptions: {
      // The Chrome of the image (see tests/e2e/Dockerfile); nothing is downloaded when tests run.
      executablePath: process.env.CHROME_PATH,
      // Chrome's own sandbox needs privileges the container does not have; the container is the
      // sandbox here, and it draws the page the same either way.
      chromiumSandbox: false,
    },
  },
  // The real `serve`, with GitHub answered from a recording; see tests/e2e/server.ts.
  webServer: {
    command: `node tests/e2e/server.ts ${PORT}`,
    url: `http://127.0.0.1:${PORT}/`,
    reuseExistingServer: false,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});

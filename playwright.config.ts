// The demo, as tests: spec/demo.md. Everything that would make a run differ from the last one is
// pinned here — the data (a recording, served by tests/demo/server.ts), the viewport, the fonts and
// the browser's own rendering — and every run is recorded: a video, a trace and the final screenshot
// of each test, kept under its own run directory so a run never overwrites the one before it.
import { defineConfig, devices } from '@playwright/test';

/**
 * One directory per run: `DEMO_RUN_ID=…` names it, otherwise the time the run started. The workers
 * read this file again in their own processes, so the id is put back into the environment they
 * inherit: one run, one directory, however many processes take part in it.
 */
const run = (process.env.DEMO_RUN_ID ||= new Date().toISOString().replace(/[:.]/g, '-'));

/** The server Playwright starts; `DEMO_PORT` moves it if 4322 is taken. */
const port = Number(process.env.DEMO_PORT ?? 4322);

/** The demo's window: 1280×760, as docs/demo/skill-atlas-demo.mp4 was recorded. */
export const VIEWPORT = { width: 1280, height: 760 };

export default defineConfig({
  testDir: './tests/demo',
  outputDir: `test-results/${run}`,
  // Each step's screen, compared with tests/demo/screenshots/<step>.png. Those are CI's: Linux, and
  // the Chromium the workflow installs. Another machine renders the same page a few pixels apart, so
  // it skips the comparison rather than fail on it; CI compares, and a missing image fails there.
  // A new image is accepted by the "Accept screenshots" workflow, which renders it on CI too.
  snapshotPathTemplate: '{testDir}/screenshots/{arg}{ext}',
  ignoreSnapshots: !process.env.CI,
  updateSnapshots: 'none',
  fullyParallel: false,
  // One worker, no retries: a flaky pass would hide exactly what these tests are for.
  workers: 1,
  retries: 0,
  forbidOnly: !!process.env.CI,
  reporter: [['list'], ['html', { outputFolder: `playwright-report/${run}`, open: 'never' }]],
  expect: {
    // One changed pixel is a failure. Playwright allows a fifth of a pixel's colour to differ by
    // default, which is a sensible tolerance for a page whose rendering is not pinned; everything
    // about this one is pinned, so a difference means the page changed, and the run should say so
    // rather than decide how much of a change matters.
    toHaveScreenshot: { maxDiffPixels: 0, maxDiffPixelRatio: 0, threshold: 0 },
  },
  use: {
    baseURL: `http://127.0.0.1:${port}/`,
    viewport: VIEWPORT,
    deviceScaleFactor: 1,
    // The page is `color-scheme: light dark`; the demo is the light one.
    colorScheme: 'light',
    locale: 'en-US',
    timezoneId: 'UTC',
    reducedMotion: 'reduce',
    // Every run, not only the failures.
    video: { mode: 'on', size: VIEWPORT },
    trace: 'on',
    screenshot: 'on',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        viewport: VIEWPORT,
        deviceScaleFactor: 1,
        launchOptions: {
          // A browser elsewhere — a sandbox without the Playwright download, say: CHROME_PATH=…
          executablePath: process.env.CHROME_PATH || undefined,
          args: [
            // Text that is the same on every machine: no hinting, no subpixel positioning, no
            // scrollbar taking a few pixels off the list's width.
            '--font-render-hinting=none',
            '--disable-font-subpixel-positioning',
            '--disable-lcd-text',
            '--hide-scrollbars',
            '--force-device-scale-factor=1',
            '--force-color-profile=srgb',
            '--disable-skia-runtime-opts',
          ],
        },
      },
    },
  ],
  webServer: {
    command: 'node tests/demo/server.ts',
    url: `http://127.0.0.1:${port}/`,
    env: { DEMO_PORT: String(port) },
    reuseExistingServer: false,
    stdout: 'pipe',
    timeout: 30_000,
  },
});

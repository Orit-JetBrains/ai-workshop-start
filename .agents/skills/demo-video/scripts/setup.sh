#!/usr/bin/env bash
# The recording toolchain, outside the checkout: Playwright, a Chrome binary and ffmpeg.
# Nothing here is a dependency of skill-atlas itself, so none of it goes into package.json.
#
#   .agents/skills/demo-video/scripts/setup.sh
#
# Idempotent: re-running it only fills in what is missing. Prints `ready` on success.
set -euo pipefail

TOOLS="${DEMO_TOOLS:-/tmp/skill-atlas-demo-tools}"
# Chrome for Testing, from Google's own bucket. cdn.playwright.dev is blocked by the network
# policy of some sandboxes, which is why `npx playwright install chromium` is not used here.
CHROME_VERSION="${DEMO_CHROME_VERSION:-141.0.7390.54}"
CHROME_URL="https://storage.googleapis.com/chrome-for-testing-public/${CHROME_VERSION}/linux64/chrome-linux64.zip"

mkdir -p "$TOOLS"
cd "$TOOLS"

# 1. Playwright, for the browser automation and the video capture.
if [ ! -d node_modules/playwright ]; then
  echo "installing playwright into $TOOLS"
  [ -f package.json ] || npm init -y >/dev/null
  npm install --silent playwright
fi

# 2. A browser. Playwright drives it through `executablePath`, so any Chrome build will do.
if [ ! -x "$TOOLS/chrome-linux64/chrome" ]; then
  echo "downloading Chrome for Testing $CHROME_VERSION"
  curl -sSfL -o chrome.zip "$CHROME_URL"
  python3 -c "import zipfile; zipfile.ZipFile('chrome.zip').extractall('.')"
  chmod -R +x chrome-linux64
  rm -f chrome.zip
fi
"$TOOLS/chrome-linux64/chrome" --version

# 3. ffmpeg: Playwright muxes the capture with its own copy, downloaded from the same blocked CDN.
#    The system one answers to the same arguments, so link it where Playwright looks.
if ! command -v ffmpeg >/dev/null; then
  echo "installing ffmpeg"
  sudo apt-get update -qq
  sudo apt-get install -y -qq ffmpeg
fi
for dir in "$HOME"/.cache/ms-playwright/ffmpeg-*; do
  [ -d "$dir" ] || continue
  [ -e "$dir/ffmpeg-linux" ] || ln -sf "$(command -v ffmpeg)" "$dir/ffmpeg-linux"
done
# The version-stamped directory does not exist before Playwright first asks for it. The revision
# it will ask for is in playwright-core's own browsers.json, so seed exactly that path.
REVISION="$(node -p "require('$TOOLS/node_modules/playwright-core/browsers.json').browsers.find(b => b.name === 'ffmpeg').revision")"
TARGET="${PLAYWRIGHT_BROWSERS_PATH:-$HOME/.cache/ms-playwright}/ffmpeg-$REVISION/ffmpeg-linux"
mkdir -p "$(dirname "$TARGET")"
[ -e "$TARGET" ] || ln -sf "$(command -v ffmpeg)" "$TARGET"
echo "ffmpeg for playwright: $TARGET"
echo ready

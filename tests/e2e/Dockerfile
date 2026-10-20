# The machine the screenshots are taken on, so a baseline made on a laptop is the one CI compares
# against: one Node, one Chrome, one set of fonts. The page is almost all text, and another font
# set renders it differently to the pixel — pinning the image pins the rendering.
#
# `npm run e2e` builds this and runs the check inside it, and the CI job runs the same command, so
# CI and a laptop take the same screenshots. The Chrome build is the one @playwright/test 1.64.1
# drives: bump the three versions below together, and remake the baselines when you do.
FROM ubuntu:24.04

ARG NODE_VERSION=24.22.0
ARG CHROME_VERSION=156.0.8078.4

# What Chrome needs to start and to draw text. fonts-liberation alone, on purpose: the fewer fonts
# the image has, the less there is to differ between it and the next build of it.
RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates curl unzip xz-utils \
      ffmpeg \
      fonts-liberation \
      libasound2t64 libatk-bridge2.0-0t64 libatk1.0-0t64 libatspi2.0-0t64 libcairo2 libcups2t64 \
      libdbus-1-3 libdrm2 libexpat1 libgbm1 libglib2.0-0t64 libnspr4 libnss3 libpango-1.0-0 \
      libx11-6 libxcb1 libxcomposite1 libxdamage1 libxext6 libxfixes3 libxkbcommon0 libxrandr2 \
    && rm -rf /var/lib/apt/lists/*

# Which font each family the page asks for resolves to, spelled out rather than left to
# fontconfig's defaults: `system-ui` has no meaning in a container, and a guess would be a
# different guess in the next build of the image.
RUN printf '%s\n' \
      '<?xml version="1.0"?><!DOCTYPE fontconfig SYSTEM "fonts.dtd"><fontconfig>' \
      '  <alias><family>system-ui</family><prefer><family>Liberation Sans</family></prefer></alias>' \
      '  <alias><family>sans-serif</family><prefer><family>Liberation Sans</family></prefer></alias>' \
      '  <alias><family>serif</family><prefer><family>Liberation Serif</family></prefer></alias>' \
      '  <alias><family>monospace</family><prefer><family>Liberation Mono</family></prefer></alias>' \
      '</fontconfig>' > /etc/fonts/local.conf

RUN curl -fsSL "https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-x64.tar.xz" \
      | tar -xJ -C /usr/local --strip-components=1 --exclude CHANGELOG.md --exclude LICENSE --exclude README.md

# Chrome for Testing, the exact build @playwright/test drives; CHROME_PATH is where the config
# looks for it, so nothing is downloaded when the tests run.
RUN curl -fsSL -o /tmp/chrome.zip \
      "https://storage.googleapis.com/chrome-for-testing-public/${CHROME_VERSION}/linux64/chrome-linux64.zip" \
    && unzip -q /tmp/chrome.zip -d /opt && rm /tmp/chrome.zip
ENV CHROME_PATH=/opt/chrome-linux64/chrome

# The video of each run is encoded by ffmpeg, which Playwright looks for among the browsers it
# downloads. It gets the one from apt instead — nothing is downloaded when the tests run. The
# directory is named after Playwright's ffmpeg revision, so it moves with the version above.
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
RUN mkdir -p /ms-playwright/ffmpeg-1013 && ln -s /usr/bin/ffmpeg /ms-playwright/ffmpeg-1013/ffmpeg-linux

WORKDIR /work

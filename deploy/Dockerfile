# The hosted career-ops server image for the home cluster, as opposed to the
# root Dockerfile's dev image. The runtime contract lives in deploy/README.md.

FROM mcr.microsoft.com/playwright:v1.64.1-jammy@sha256:a3966b653e8d48a30901889081b616307fca73e0d843a117fadf6609397dac38

ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright \
    NEXT_TELEMETRY_DISABLED=1

RUN set -eux; \
    apt-get update; \
    DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends tini; \
    rm -rf /var/lib/apt/lists/*

RUN npm install -g --no-audit --no-fund @anthropic-ai/claude-code@2.1.319 && rm -rf /root/.npm

WORKDIR /app

# shortcut: no root package-lock.json (gitignored), so this resolves fresh; switch to npm ci when one lands
COPY package.json ./
RUN npm install --no-audit --no-fund && rm -rf /root/.npm

COPY web/package.json web/package-lock.json web/
RUN npm ci --no-audit --no-fund --prefix web && rm -rf /root/.npm

COPY . .
RUN npm --prefix web run build

# next start may write its image-optimizer cache under .next/cache; /data is the volume mount point.
RUN mkdir -p /home/app /data /app/web/.next/cache && chown 1000:1000 /home/app /data /app/web/.next/cache

ENV NODE_ENV=production \
    DISABLE_AUTOUPDATER=1 \
    HOME=/home/app \
    CAREER_OPS_CLI=claude

USER 1000
EXPOSE 3000
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "web/server.mjs", "start"]

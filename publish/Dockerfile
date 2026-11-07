# The publish service image (share pages, account page, Better Auth). Build
# context is publish/. The runtime contract lives in publish/README.md.

FROM node:24-alpine@sha256:a34ab6d7f6f4813f4d0c5469d74685604b962fbdbf5793a7bc7b4998ecb867c8

RUN apk add --no-cache tini=~0.19

WORKDIR /app

# auth is a runtime dependency: the CMD runs its migrate command before the server.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund && rm -rf /root/.npm

# Named files, not COPY . .: the context may hold a local .env, publish.db or node_modules.
COPY start.mjs server.mjs auth.mjs db.mjs pages.mjs ./
COPY pages/ pages/

RUN mkdir -p /data && chown 1000:1000 /data

ENV NODE_ENV=production \
    PUBLISH_BIND=0.0.0.0 \
    PUBLISH_PORT=8080 \
    PUBLISH_DB=/data/publish.db

USER 1000
VOLUME /data
EXPOSE 8080
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["sh", "-c", "node_modules/.bin/auth migrate --config auth.mjs --yes && exec node start.mjs"]

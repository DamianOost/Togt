# syntax=docker/dockerfile:1

# Node 24 is the current LTS line. Pin both the patch release and manifest
# digest so a reviewed build does not silently move to another base image.
FROM node:24.19.0-bookworm-slim@sha256:3638d9a6fe4030bd716be989438248074489337ba3275657f93595428be4fc03 AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

FROM node:24.19.0-bookworm-slim@sha256:3638d9a6fe4030bd716be989438248074489337ba3275657f93595428be4fc03 AS runtime
WORKDIR /app

ARG TOGT_GIT_COMMIT=unknown
ENV NODE_ENV=production
LABEL org.opencontainers.image.source="https://github.com/DamianOost/Togt" \
      org.opencontainers.image.revision="${TOGT_GIT_COMMIT}"

COPY --from=dependencies --chown=node:node /app/node_modules ./node_modules
COPY --chown=node:node package.json package-lock.json ./
COPY --chown=node:node src ./src
COPY --chown=node:node mcp-server ./mcp-server
RUN printf '%s\n' "${TOGT_GIT_COMMIT}" > /app/REVISION && chown node:node /app/REVISION

USER node
EXPOSE 8080

CMD ["node", "src/app.js"]

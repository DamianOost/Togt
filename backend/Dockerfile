# Node 20 (LTS) — the existing engines field in package.json is satisfied.
# Multi-stage so the runtime image doesn't carry dev deps + build tools.

FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
# --omit=dev: production deps only. Saves ~80MB vs the full install.
RUN npm ci --omit=dev

FROM node:20-alpine AS runtime
WORKDIR /app
# Bring in just the pruned node_modules from the deps stage
COPY --from=deps /app/node_modules ./node_modules
# Copy source — .dockerignore excludes tests, .env files, coverage, .git.
COPY . .
# Fly injects PORT=8080. The app reads process.env.PORT — verified in app.js.
EXPOSE 8080
# No shell wrapper — direct exec so SIGTERM reaches the Node process
# (the existing installShutdownHandlers in app.js needs the signal).
CMD ["node", "src/app.js"]

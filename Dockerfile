# Production image for the wegetfound.ai API (apps/api). Builds the pnpm monorepo
# and runs the bundled Fastify server. The tsup bundle inlines our workspace
# packages but leaves node_modules external, so the installed deps must be present
# at runtime — hence we keep node_modules in the final image.
FROM node:22-slim
RUN corepack enable
WORKDIR /app

# Copy the whole workspace (node_modules excluded via .dockerignore) and install.
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @wegetfound/api build

ENV NODE_ENV=production
# Render/Railway/Fly set PORT; the server reads it (falls back to 3001).
EXPOSE 3001
CMD ["node", "apps/api/dist/index.js"]

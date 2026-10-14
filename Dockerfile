# Use the bundled Dockerfile frontend: no extra remote syntax image.
ARG NODE_IMAGE=node:24-bookworm-slim
ARG NGINX_IMAGE=nginx:1.28-alpine
# Only Dockerfile + compose.yaml + your existing .env are needed locally.
# Publish the reviewed patch first, then pin its full 40-character commit SHA.
FROM ${NODE_IMAGE} AS source
ARG SLG_SOURCE_REF=REPLACE_WITH_PUBLISHED_SELFHOST_COMMIT_SHA
WORKDIR /source
ADD https://github.com/coracoo/slg/archive/${SLG_SOURCE_REF}.tar.gz /tmp/slg.tar.gz
RUN node -e "if (!/^[0-9a-f]{40}$/.test(process.argv[1])) process.exit(1)" "$SLG_SOURCE_REF" \
    && tar -xzf /tmp/slg.tar.gz --strip-components=1 -C /source \
    && rm /tmp/slg.tar.gz

FROM ${NODE_IMAGE} AS backend-build
ARG NPM_REGISTRY=https://registry.npmmirror.com
ENV NPM_CONFIG_UPDATE_NOTIFIER=false
WORKDIR /app/backend
COPY --from=source /source/backend/package.json /source/backend/package-lock.json ./
RUN npm ci --registry="$NPM_REGISTRY" --ignore-scripts --no-audit --no-fund
COPY --from=source /source/backend/ ./
COPY --from=source /source/docker/tsconfig.backend.json /app/docker/tsconfig.backend.json
RUN ./node_modules/.bin/tsc -p /app/docker/tsconfig.backend.json
FROM ${NODE_IMAGE} AS backend
ARG NPM_REGISTRY=https://registry.npmmirror.com
ENV NODE_ENV=production HOST=0.0.0.0 PORT=8080 NPM_CONFIG_UPDATE_NOTIFIER=false
WORKDIR /app/backend
COPY --from=source /source/backend/package.json /source/backend/package-lock.json ./
RUN npm ci --registry="$NPM_REGISTRY" --omit=dev --ignore-scripts --no-audit --no-fund && npm cache clean --force
COPY --from=backend-build --chown=node:node /app/backend/dist ./dist
COPY --from=backend-build --chown=node:node /app/backend/config ./dist/config
USER node
EXPOSE 8080
CMD ["node", "dist/api/src/index.js"]
FROM ${NODE_IMAGE} AS frontend-build
ARG NPM_REGISTRY=https://registry.npmmirror.com
ENV NPM_CONFIG_UPDATE_NOTIFIER=false
WORKDIR /app/frontend
COPY --from=source /source/frontend/package.json /source/frontend/package-lock.json ./
RUN npm ci --registry="$NPM_REGISTRY" --ignore-scripts --no-audit --no-fund
COPY --from=source /source/frontend/ ./
ENV PUBLIC_SAME_ORIGIN=true
RUN npm run typecheck && npm run build
FROM ${NGINX_IMAGE} AS frontend
COPY --from=source /source/docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=frontend-build /app/frontend/dist /usr/share/nginx/html
EXPOSE 80

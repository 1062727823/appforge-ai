FROM node:22-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends git ca-certificates gosu ripgrep \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY agent-runner/package.json ./

RUN npm config set registry https://registry.npmjs.org/ && npm install --omit=dev

COPY agent-runner .

COPY docker/appforge-entrypoint.sh /usr/local/bin/appforge-entrypoint.sh
RUN sed -i 's/\r$//' /usr/local/bin/appforge-entrypoint.sh && chmod +x /usr/local/bin/appforge-entrypoint.sh

ENV NODE_ENV=production
ENV WORKSPACE_DIR=/workspace
ENV APPFORGE_WORKSPACE_UID=1000
ENV APPFORGE_WORKSPACE_GID=1000

USER root
ENTRYPOINT ["/usr/local/bin/appforge-entrypoint.sh"]
CMD ["node", "src/worker.js"]

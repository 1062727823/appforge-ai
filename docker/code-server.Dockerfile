FROM node:22-alpine AS webview-build

WORKDIR /build/webview

COPY docker/code-server-extension/webview/package*.json ./
RUN npm ci

COPY docker/code-server-extension/webview/ ./
RUN npm run build

FROM node:22-bookworm-slim AS node-runtime

FROM codercom/code-server:latest

USER root

RUN mkdir -p \
  /home/coder/.local/share/code-server/User \
  /home/coder/.local/share/code-server/Machine \
  /home/coder/.local/share/code-server/extensions \
  /home/coder/.local/share/code-server/logs \
  /home/coder/.config

COPY --from=node-runtime /usr/local/ /usr/local/

COPY docker/code-server-extension /home/coder/.local/share/code-server/extensions/appforge.agent-0.1.0
COPY --from=webview-build /build/webview/dist /home/coder/.local/share/code-server/extensions/appforge.agent-0.1.0/webview/dist
COPY docker/code-server-settings/settings.json /home/coder/.local/share/code-server/User/settings.json
COPY docker/code-server-settings/keybindings.json /home/coder/.local/share/code-server/User/keybindings.json
COPY docker/code-server-entrypoint.sh /usr/local/bin/code-server-entrypoint.sh

RUN apt-get update \
  && apt-get install -y --no-install-recommends gosu ca-certificates curl docker-cli \
  && mkdir -p /usr/local/lib/docker/cli-plugins \
  && curl -fsSL https://github.com/docker/compose/releases/download/v2.29.2/docker-compose-linux-x86_64 \
    -o /usr/local/lib/docker/cli-plugins/docker-compose \
  && chmod +x /usr/local/lib/docker/cli-plugins/docker-compose \
  && rm -rf /var/lib/apt/lists/* \
  && chown -R coder:coder /home/coder/.local /home/coder/.config \
  && sed -i 's/\r$//' /usr/local/bin/code-server-entrypoint.sh \
  && chmod +x /usr/local/bin/code-server-entrypoint.sh

ENV APPFORGE_API_URL=http://api:4173
ENV APPFORGE_WORKSPACE_ROOT=/data/appforge/workspaces
ENV APPFORGE_WORKSPACE_UID=1000
ENV APPFORGE_WORKSPACE_GID=1000

USER root
ENTRYPOINT ["/usr/local/bin/code-server-entrypoint.sh"]

EXPOSE 8080

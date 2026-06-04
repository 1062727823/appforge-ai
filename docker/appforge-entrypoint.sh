#!/bin/sh
set -e

APPFORGE_WORKSPACE_UID="${APPFORGE_WORKSPACE_UID:-1000}"
APPFORGE_WORKSPACE_GID="${APPFORGE_WORKSPACE_GID:-1000}"

if [ "$(id -u)" = "0" ]; then
  mkdir -p /data/appforge/workspaces
  chown -R "${APPFORGE_WORKSPACE_UID}:${APPFORGE_WORKSPACE_GID}" /data/appforge

  if [ -S /var/run/docker.sock ]; then
    DOCKER_GID=$(stat -c '%g' /var/run/docker.sock)
    DOCKER_GROUP=$(getent group "$DOCKER_GID" | cut -d: -f1)
    if [ -z "$DOCKER_GROUP" ]; then
      groupadd -g "$DOCKER_GID" docker 2>/dev/null || groupadd docker
      DOCKER_GROUP=docker
    fi
    RUN_USER="$(getent passwd "${APPFORGE_WORKSPACE_UID}" | cut -d: -f1)"
    if [ -n "$RUN_USER" ]; then
      usermod -aG "$DOCKER_GROUP" "$RUN_USER" 2>/dev/null || true
    fi
  fi

  RUN_USER="$(getent passwd "${APPFORGE_WORKSPACE_UID}" | cut -d: -f1)"
  if [ -n "$RUN_USER" ] && command -v gosu >/dev/null 2>&1; then
    exec gosu "$RUN_USER" "$@"
  fi

  if [ -n "$RUN_USER" ]; then
    exec runuser -u "$RUN_USER" -- "$@"
  fi
fi

exec "$@"

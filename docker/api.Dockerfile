FROM maven:3.9-eclipse-temurin-17 AS build-backend

WORKDIR /build
COPY backend/pom.xml backend/
RUN mvn -f backend/pom.xml dependency:go-offline -B
COPY backend backend
RUN mvn -f backend/pom.xml package -DskipTests -B

FROM node:22-bookworm-slim AS build-frontend

WORKDIR /build
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --include=dev
COPY frontend .
RUN npm run build

FROM eclipse-temurin:17-jre-jammy

RUN apt-get update \
  && apt-get install -y --no-install-recommends git ca-certificates curl \
  && curl -fsSL https://download.docker.com/linux/static/stable/x86_64/docker-26.1.4.tgz \
    | tar xz -C /usr/local/bin --strip-components=1 docker/docker \
  && mkdir -p /usr/local/lib/docker/cli-plugins \
  && curl -fsSL https://github.com/docker/compose/releases/download/v2.29.2/docker-compose-linux-x86_64 \
    -o /usr/local/lib/docker/cli-plugins/docker-compose \
  && chmod +x /usr/local/lib/docker/cli-plugins/docker-compose \
  && rm -rf /var/lib/apt/lists/*

COPY --from=build-backend /build/backend/target/*.jar /app/appforge-api.jar
COPY --from=build-frontend /build/dist /app/web

COPY docker/appforge-entrypoint.sh /usr/local/bin/appforge-entrypoint.sh
RUN chmod +x /usr/local/bin/appforge-entrypoint.sh

ENV APPFORGE_DATA_DIR=/data/appforge
ENV APPFORGE_WEB_ROOT=/app/web
ENV AGENT_RUNNER_IMAGE=appforge/agent-runner:latest
ENV LOG_LEVEL=info
ENV PORT=4173

EXPOSE 4173

ENTRYPOINT ["/usr/local/bin/appforge-entrypoint.sh"]
CMD ["java", "-jar", "/app/appforge-api.jar"]

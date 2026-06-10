FROM eclipse-temurin:17-jre-jammy

RUN apt-get update \
  && apt-get install -y --no-install-recommends curl \
  && rm -rf /var/lib/apt/lists/*

# H2 database version
ENV H2_VERSION=2.2.224
ENV H2_HOME=/opt/h2

RUN mkdir -p ${H2_HOME}/data \
  && curl -fsSL https://repo1.maven.org/maven2/com/h2database/h2/${H2_VERSION}/h2-${H2_VERSION}.jar \
    -o ${H2_HOME}/h2.jar

# TCP port for JDBC connections
EXPOSE 9092
# Web console port
EXPOSE 8082

WORKDIR ${H2_HOME}

CMD ["java", "-cp", "/opt/h2/h2.jar", "org.h2.tools.Server", \
     "-tcp", "-tcpAllowOthers", "-tcpPort", "9092", \
     "-web", "-webAllowOthers", "-webPort", "8082", \
     "-ifNotExists", \
     "-baseDir", "/opt/h2/data"]

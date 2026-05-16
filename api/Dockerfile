FROM maven:3.9-eclipse-temurin-21 AS build
WORKDIR /src
COPY pom.xml ./
RUN mvn -B dependency:go-offline
COPY src ./src
RUN mvn -B -DskipTests package

# Ubuntu 24.04 (noble) base — newer packages than the default jammy
# variant, which clears most of the OS-level CVEs Trivy was surfacing.
# `apt-get upgrade` afterwards pulls any security updates that landed
# between the image's last rebuild and this build.
FROM eclipse-temurin:21-jre-noble
WORKDIR /app
RUN apt-get update \
 && apt-get upgrade -y \
 && apt-get install -y --no-install-recommends curl \
 && apt-get autoremove -y \
 && rm -rf /var/lib/apt/lists/*
COPY --from=build /src/target/*.jar app.jar
# Run as a non-root, unprivileged UID. The Spring Boot JAR doesn't
# need root for anything (the JVM binds the unprivileged port 8080
# above). Without this, a successful in-JVM RCE inherits root —
# making container-escape primitives trivially abusable.
# UID 10001 is chosen to be well above any host-system service UIDs.
# Group 0 (root) is the OpenShift / Kubernetes RunAsAny default;
# files owned by it are readable by the random UID Kubernetes
# assigns when SecurityContext.runAsUser is left empty.
RUN useradd --uid 10001 --gid 0 --no-create-home --shell /usr/sbin/nologin netscope && \
    chown -R 10001:0 /app && \
    chmod -R g=u /app
USER 10001
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
    CMD curl -fsS http://localhost:8080/actuator/health || exit 1
ENTRYPOINT ["java","-XX:+UseZGC","-XX:MaxRAMPercentage=75","-jar","/app/app.jar"]

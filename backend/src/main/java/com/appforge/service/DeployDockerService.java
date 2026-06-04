package com.appforge.service;

import com.appforge.store.JsonStoreService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.io.File;
import java.io.IOException;
import java.util.Map;
import java.util.concurrent.TimeUnit;

@Slf4j
@Service
@RequiredArgsConstructor
public class DeployDockerService {

    private final JsonStoreService store;
    private final DeployLogStreamService logStream;
    private final DeployHistoryService history;
    private final TraefikService traefik;
    private final RunDockerService runDocker;

    public String deployProjectName(String appId) {
        return runDocker.composeProjectName(appId) + "_deploy";
    }

    public void triggerDeploy(String appId) {
        String cwd = store.appWorkspace(appId);
        String projectName = deployProjectName(appId);
        String deployUrl = traefik.deployUrlFor(appId);

        history.appendHistory(appId, "deploy", "building", "Deployment started", deployUrl);
        logStream.clearLiveEvents(appId);

        logStream.pushDeployLogEvent(appId, "status", Map.of("message", "Starting deployment for " + appId));
        logStream.pushDeployLogEvent(appId, "phase", Map.of("phase", "build", "message", "Building Docker images"));

        // Build
        try {
            ProcessBuilder buildPb = new ProcessBuilder(
                    "docker", "compose", "-p", projectName, "build");
            buildPb.directory(new File(cwd));
            Process buildProcess = buildPb.start();

            String buildOutput = new String(buildProcess.getInputStream().readAllBytes());
            buildProcess.waitFor(300, TimeUnit.SECONDS);

            logStream.pushDeployLogEvent(appId, "chunk", Map.of("text", buildOutput));

            if (buildProcess.exitValue() != 0) {
                logStream.pushDeployLogEvent(appId, "status", Map.of("message", "Build failed"));
                history.appendHistory(appId, "deploy", "failed", "Build failed", deployUrl);
                logStream.pushDeployLogEvent(appId, "done", Map.of());
                return;
            }

            logStream.pushDeployLogEvent(appId, "phase", Map.of("phase", "up", "message", "Starting containers"));

            // Deploy (up)
            ProcessBuilder upPb = new ProcessBuilder(
                    "docker", "compose", "-p", projectName, "up", "-d", "--remove-orphans");
            upPb.directory(new File(cwd));
            Process upProcess = upPb.start();

            String upOutput = new String(upProcess.getInputStream().readAllBytes());
            upProcess.waitFor(120, TimeUnit.SECONDS);

            logStream.pushDeployLogEvent(appId, "chunk", Map.of("text", upOutput));

            if (upProcess.exitValue() == 0) {
                history.appendHistory(appId, "deploy", "success", "Deployment successful", deployUrl);
                logStream.pushDeployLogEvent(appId, "status", Map.of("message", "Deployment successful", "url", deployUrl));
            } else {
                history.appendHistory(appId, "deploy", "failed", "Deploy up failed", deployUrl);
                logStream.pushDeployLogEvent(appId, "status", Map.of("message", "Deploy up failed"));
            }

        } catch (IOException | InterruptedException e) {
            log.error("Deploy failed for {}", appId, e);
            logStream.pushDeployLogEvent(appId, "status", Map.of("message", "Deploy error: " + e.getMessage()));
            history.appendHistory(appId, "deploy", "failed", e.getMessage(), deployUrl);
        }

        logStream.pushDeployLogEvent(appId, "done", Map.of());
    }

    public void stopDeploy(String appId) {
        String cwd = store.appWorkspace(appId);
        String projectName = deployProjectName(appId);

        try {
            ProcessBuilder pb = new ProcessBuilder(
                    "docker", "compose", "-p", projectName, "down", "--remove-orphans");
            pb.directory(new File(cwd));
            Process p = pb.start();
            p.waitFor(60, TimeUnit.SECONDS);

            history.appendHistory(appId, "stop", "success", "Deployment stopped", "");
        } catch (Exception e) {
            log.warn("Failed to stop deploy for {}", appId, e);
        }
    }

    public void restartDeploy(String appId) {
        stopDeploy(appId);
        triggerDeploy(appId);
    }
}

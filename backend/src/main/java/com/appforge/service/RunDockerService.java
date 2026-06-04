package com.appforge.service;

import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.io.BufferedReader;
import java.io.File;
import java.io.IOException;
import java.io.InputStreamReader;
import java.util.*;
import java.util.concurrent.TimeUnit;
import java.util.function.Consumer;

@Slf4j
@Service
public class RunDockerService {

    private final TraefikService traefik;

    private volatile boolean dockerChecked;
    private volatile boolean dockerAvailable;
    private volatile long lastDockerCheckTime;

    public RunDockerService(TraefikService traefik) {
        this.traefik = traefik;
    }

    /**
     * Check whether Docker CLI is reachable. Cached for 5 minutes to avoid
     * probing on every scheduled tick when Docker is not installed.
     */
    public boolean isDockerAvailable() {
        long now = System.currentTimeMillis();
        if (dockerChecked && (now - lastDockerCheckTime) < 300_000L) {
            return dockerAvailable;
        }
        try {
            new ProcessBuilder("docker", "version").start().waitFor(10, TimeUnit.SECONDS);
            dockerAvailable = true;
        } catch (Exception e) {
            dockerAvailable = false;
        }
        dockerChecked = true;
        lastDockerCheckTime = now;
        return dockerAvailable;
    }

    public record RunStatus(boolean running, int port, String url) {
    }

    public RunStatus getRunStatus(String appId, String cwd) {
        String projectName = composeProjectName(appId);
        try {
            ProcessBuilder pb = new ProcessBuilder(
                    "docker", "compose", "-p", projectName, "ps", "--status", "running", "-q");
            pb.directory(new File(cwd));
            Process p = pb.start();
            String stdout = new String(p.getInputStream().readAllBytes());
            p.waitFor(30, TimeUnit.SECONDS);

            boolean running = !stdout.trim().isEmpty();
            int port = detectPort(appId, cwd);
            int hostPort = detectHostPort(stdout.trim());
            String url = hostPort > 0
                    ? "http://127.0.0.1:" + hostPort + "/"
                    : traefik.gatewayUrlFor(appId);

            return new RunStatus(running, hostPort > 0 ? hostPort : port, url);
        } catch (Exception e) {
            log.warn("Failed to get run status for {}", appId, e);
            return new RunStatus(false, 0, "");
        }
    }

    public void stopRun(String appId, String cwd) {
        String projectName = composeProjectName(appId);
        try {
            // try compose down first
            ProcessBuilder pb = new ProcessBuilder(
                    "docker", "compose", "-p", projectName, "down", "--remove-orphans");
            pb.directory(new File(cwd));
            Process p = pb.start();
            p.waitFor(60, TimeUnit.SECONDS);

        } catch (Exception e) {
            log.warn("Compose down failed for {}, trying force remove by project", appId);
            try {
                ProcessBuilder pb = new ProcessBuilder(
                        "docker", "ps", "-a", "--filter", "name=appforge_" + appId, "-q");
                Process p = pb.start();
                String ids = new String(p.getInputStream().readAllBytes()).trim();
                p.waitFor(10, TimeUnit.SECONDS);

                if (!ids.isEmpty()) {
                    List<String> rmArgs = new ArrayList<>();
                    rmArgs.add("docker");
                    rmArgs.add("rm");
                    rmArgs.add("-f");
                    rmArgs.addAll(Arrays.asList(ids.split("\n")));
                    new ProcessBuilder(rmArgs).start().waitFor(30, TimeUnit.SECONDS);
                }
            } catch (Exception e2) {
                log.warn("Force remove failed for {}", appId, e2);
            }
        }
    }

    public Set<String> listRunningAppIds() {
        Set<String> result = new HashSet<>();
        try {
            ProcessBuilder pb = new ProcessBuilder(
                    "docker", "ps", "--filter", "name=appforge_", "--format", "{{.Names}}");
            Process p = pb.start();
            String names = new String(p.getInputStream().readAllBytes());
            p.waitFor(10, TimeUnit.SECONDS);

            for (String name : names.split("\n")) {
                name = name.trim();
                if (name.startsWith("appforge_")) {
                    String[] parts = name.split("-");
                    if (parts.length >= 1) {
                        result.add(parts[0].replace("appforge_", ""));
                    }
                }
            }
        } catch (Exception e) {
            log.warn("Failed to list running apps", e);
        }
        return result;
    }

    public record LogEvent(String type, String text) {
        public static LogEvent log(String text) { return new LogEvent("log", text); }
        public static LogEvent status(String text) { return new LogEvent("status", text); }
        public static LogEvent error(String text) { return new LogEvent("error", text); }
    }

    private int executeAndStream(List<String> cmd, File cwd, Consumer<LogEvent> onLine) throws IOException, InterruptedException {
        ProcessBuilder pb = new ProcessBuilder(cmd);
        pb.directory(cwd);
        pb.redirectErrorStream(true);
        Process p = pb.start();

        try (BufferedReader reader = new BufferedReader(new InputStreamReader(p.getInputStream()))) {
            String line;
            while ((line = reader.readLine()) != null) {
                onLine.accept(LogEvent.log(line));
            }
        }
        return p.waitFor();
    }

    private boolean hasImages(String projectName, File cwd) {
        try {
            // Try compose images first
            ProcessBuilder pb = new ProcessBuilder(
                    "docker", "compose", "-p", projectName, "images", "-q");
            pb.directory(cwd);
            Process p = pb.start();
            String out = new String(p.getInputStream().readAllBytes()).trim();
            p.waitFor(15, TimeUnit.SECONDS);
            if (!out.isEmpty()) return true;

            // Fallback: check docker images by project name
            pb = new ProcessBuilder("docker", "images", "--filter", "reference=" + projectName + "*", "-q");
            p = pb.start();
            out = new String(p.getInputStream().readAllBytes()).trim();
            p.waitFor(10, TimeUnit.SECONDS);
            return !out.isEmpty();
        } catch (Exception e) {
            log.warn("Failed to check images for {}", projectName, e);
            return false;
        }
    }

    public void runWithLogging(String appId, String cwd, Map<String, Object> spec, boolean rebuild, Consumer<LogEvent> onEvent) {
        String projectName = composeProjectName(appId);
        String upCmd = spec.getOrDefault("command", "docker compose up -d --remove-orphans").toString();

        try {
            if (!rebuild) {
                if (!hasImages(projectName, new File(cwd))) {
                    onEvent.accept(LogEvent.status("no_image"));
                    onEvent.accept(LogEvent.error("未找到 Docker 镜像，请先点击‘重新构建并运行’来构建镜像。"));
                    onEvent.accept(LogEvent.status("done"));
                    return;
                }
            }

            if (rebuild) {
                onEvent.accept(LogEvent.status("build_started"));
                List<String> buildArgs = new ArrayList<>();
                buildArgs.add("docker");
                buildArgs.add("compose");
                buildArgs.add("-p");
                buildArgs.add(projectName);
                buildArgs.add("build");
                int buildRc = executeAndStream(buildArgs, new File(cwd), onEvent);
                if (buildRc != 0) {
                    onEvent.accept(LogEvent.status("build_failed"));
                    onEvent.accept(LogEvent.error("docker compose build exited with code " + buildRc));
                    onEvent.accept(LogEvent.status("done"));
                    return;
                }
                onEvent.accept(LogEvent.status("build_done"));
            }

            // Up
            onEvent.accept(LogEvent.status("up_started"));
            List<String> upArgs = new ArrayList<>();
            upArgs.add("docker");
            upArgs.add("compose");
            upArgs.add("-p");
            upArgs.add(projectName);
            boolean hasDetach = false;
            for (String part : upCmd.split("\\s+")) {
                if (!part.isEmpty() && !"docker".equals(part) && !"compose".equals(part)) {
                    upArgs.add(part);
                    if ("-d".equals(part) || "--detach".equals(part)) hasDetach = true;
                }
            }
            if (!hasDetach) upArgs.add("-d");
            int upRc = executeAndStream(upArgs, new File(cwd), onEvent);
            if (upRc != 0) {
                onEvent.accept(LogEvent.status("up_failed"));
                onEvent.accept(LogEvent.error("docker compose up exited with code " + upRc));
                onEvent.accept(LogEvent.status("done"));
                return;
            }
            onEvent.accept(LogEvent.status("up_done"));
            onEvent.accept(LogEvent.status("done"));
        } catch (Exception e) {
            log.error("Run with logging failed for {}", appId, e);
            onEvent.accept(LogEvent.error(e.getMessage()));
            onEvent.accept(LogEvent.status("done"));
        }
    }

    public void stopWithLogging(String appId, String cwd, Map<String, Object> spec, Consumer<LogEvent> onEvent) {
        String projectName = composeProjectName(appId);
        String stopCmd = spec.getOrDefault("stop", "docker compose down --remove-orphans").toString();

        try {
            onEvent.accept(LogEvent.status("stop_started"));
            List<String> args = new ArrayList<>();
            args.add("docker");
            args.add("compose");
            args.add("-p");
            args.add(projectName);
            for (String part : stopCmd.split("\\s+")) {
                if (!part.isEmpty() && !"docker".equals(part) && !"compose".equals(part)) {
                    args.add(part);
                }
            }
            executeAndStream(args, new File(cwd), onEvent);
            onEvent.accept(LogEvent.status("stop_done"));
            onEvent.accept(LogEvent.status("done"));
        } catch (Exception e) {
            log.error("Stop with logging failed for {}", appId, e);
            onEvent.accept(LogEvent.error(e.getMessage()));
            onEvent.accept(LogEvent.status("done"));
        }
    }

    private int detectPort(String appId, String cwd) {
        // Try reading from .appforge/run.json first
        File runJson = new File(cwd, ".appforge/run.json");
        if (runJson.exists()) {
            try {
                String content = java.nio.file.Files.readString(runJson.toPath());
                // Simple JSON parsing - extract port
                int portIdx = content.indexOf("\"port\"");
                if (portIdx >= 0) {
                    int colonIdx = content.indexOf(":", portIdx);
                    if (colonIdx >= 0) {
                        String val = content.substring(colonIdx + 1).replaceAll("[^0-9]", "").trim();
                        if (!val.isEmpty()) return Integer.parseInt(val);
                    }
                }
            } catch (Exception ignored) {
            }
        }

        // Try from docker-compose.yml
        File compose = new File(cwd, "docker-compose.yml");
        if (compose.exists()) {
            try {
                String content = java.nio.file.Files.readString(compose.toPath());
                // Check for port mapping
                for (String line : content.split("\n")) {
                    line = line.trim();
                    if (line.matches(".*\"?\\d+:\\d+\"?.*") || line.matches(".*- \\d+:\\d+.*")) {
                        String portStr = line.replaceAll(".*?[\"\\s]*(\\d+):(\\d+).*", "$1");
                        if (!portStr.equals(line)) {
                            return Integer.parseInt(portStr);
                        }
                    }
                }
            } catch (Exception ignored) {
            }
        }

        return 3000; // default
    }

    private int detectHostPort(String containerId) {
        if (containerId.isEmpty()) return 0;
        try {
            ProcessBuilder pb = new ProcessBuilder(
                    "docker", "port", containerId);
            Process p = pb.start();
            String out = new String(p.getInputStream().readAllBytes());
            p.waitFor(10, TimeUnit.SECONDS);
            // Output: "8080/tcp -> 0.0.0.0:51232" or "8080/tcp -> [::]:51232"
            for (String line : out.split("\n")) {
                String trimmed = line.trim();
                int colonIdx = trimmed.lastIndexOf(':');
                if (colonIdx > 0) {
                    String portStr = trimmed.substring(colonIdx + 1).trim();
                    return Integer.parseInt(portStr);
                }
            }
        } catch (Exception e) {
            log.warn("Failed to detect host port for {}", containerId, e);
        }
        return 0;
    }

    public String composeProjectName(String appId) {
        return "appforge_" + appId.replaceAll("[^a-zA-Z0-9_-]", "_");
    }
}

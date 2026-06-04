package com.appforge.service;

import com.appforge.config.AppForgeProperties;
import com.appforge.model.App;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.io.File;
import java.io.IOException;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.TimeUnit;

@Slf4j
@Service
@RequiredArgsConstructor
public class DockerExecutorService {

    private final AppForgeProperties props;
    private final JobSpecStore jobSpecStore;

    public record DockerResult(int exitCode, String stdout, String stderr) {
    }

    public void dispatchRunnerJob(String jobType, String taskId, App app, String cwd, String prompt) {
        // Register job spec for the runner to fetch
        jobSpecStore.register(taskId, Map.of(
                "taskId", taskId,
                "jobType", jobType,
                "appId", app.getId(),
                "appName", app.getName(),
                "prompt", prompt != null ? prompt : "",
                "repoUrl", app.getRepoUrl() != null ? app.getRepoUrl() : "",
                "deepseekApiKey", props.getDeepseekApiKey(),
                "deepseekModel", props.getDeepseekModel()
        ));

        String runnerUrl = props.getAgentRunnerUrl();
        if (runnerUrl != null && !runnerUrl.isBlank()) {
            try {
                dispatchToPersistentRunner(jobType, taskId, cwd);
            } catch (Exception e) {
                jobSpecStore.remove(taskId);
                throw new RuntimeException("Failed to dispatch agent job to runner: " + e.getMessage(), e);
            }
        } else {
            dispatchEphemeralDockerRun(jobType, taskId, app, cwd);
        }
    }

    private void dispatchToPersistentRunner(String jobType, String taskId, String cwd) throws IOException, InterruptedException {
        String runnerUrl = props.getAgentRunnerUrl();
        if (runnerUrl == null || runnerUrl.isBlank()) return;

        java.net.http.HttpClient client = java.net.http.HttpClient.newHttpClient();
        String body = String.format(
                "{\"jobType\":\"%s\",\"taskId\":\"%s\",\"workspaceDir\":\"%s\"}",
                jobType, taskId, cwd);
        java.net.http.HttpRequest request = java.net.http.HttpRequest.newBuilder()
                .uri(java.net.URI.create(runnerUrl.replaceAll("/$", "") + "/run"))
                .header("Content-Type", "application/json")
                .header("X-Runner-Token", props.getRunnerCallbackToken())
                .POST(java.net.http.HttpRequest.BodyPublishers.ofString(body))
                .build();
        java.net.http.HttpResponse<String> response = client.send(request,
                java.net.http.HttpResponse.BodyHandlers.ofString());
        log.info("Dispatched to persistent runner: task={} status={}", taskId, response.statusCode());
        if (response.statusCode() >= 400) {
            throw new IOException("Agent runner returned HTTP " + response.statusCode() + ": " + response.body());
        }
    }

    private void dispatchEphemeralDockerRun(String jobType, String taskId, App app, String cwd) {
        List<String> args = new ArrayList<>();
        args.add("docker");
        args.add("run");
        args.add("--rm");
        args.add("--name");
        args.add(("appforge-" + jobType + "-" + taskId).substring(0,
                Math.min(63, ("appforge-" + jobType + "-" + taskId).length())));
        args.add("--network");
        args.add(props.getDockerNetwork());
        args.add("--label");
        args.add("appforge.role=agent-runner");
        args.add("--label");
        args.add("appforge.taskId=" + taskId);
        args.add("--label");
        args.add("appforge.appId=" + (app.getId() != null ? app.getId() : "unknown"));
        args.add("-v");
        args.add(new File(cwd).getAbsolutePath() + ":/workspace");
        args.add("-e");
        args.add("JOB_TYPE=" + jobType);
        args.add("-e");
        args.add("TASK_ID=" + taskId);
        args.add("-e");
        args.add("WORKSPACE_DIR=/workspace");
        args.add("-e");
        args.add("CALLBACK_URL=" + getCallbackUrl());
        args.add("-e");
        args.add("CALLBACK_TOKEN=" + props.getRunnerCallbackToken());
        args.add("--memory");
        args.add(props.getAgentMemoryLimit());
        args.add("--cpus");
        args.add(props.getAgentCpuLimit());
        args.add(props.getAgentRunnerImage());

        log.info("Starting ephemeral Docker runner: {}", String.join(" ", args));

        try {
            ProcessBuilder pb = new ProcessBuilder(args);
            pb.redirectErrorStream(true);
            Process process = pb.start();

            // fire-and-forget: runner will callback
            new Thread(() -> {
                try {
                    String output = new String(process.getInputStream().readAllBytes());
                    boolean finished = process.waitFor(300, TimeUnit.SECONDS);
                    int exitCode = finished ? process.exitValue() : -1;
                    if (exitCode != 0) {
                        log.warn("Docker runner exited with {}: {}", exitCode, output);
                    }
                } catch (Exception e) {
                    log.error("Docker runner error", e);
                }
            }).start();

        } catch (IOException e) {
            log.error("Failed to start Docker runner", e);
        }
    }

    public void cancelRunnerJob(String taskId, String appId) {
        String runnerUrl = props.getAgentRunnerUrl();
        if (runnerUrl != null && !runnerUrl.isBlank()) {
            // HTTP POST to cancel
            try {
                java.net.http.HttpClient client = java.net.http.HttpClient.newHttpClient();
                java.net.http.HttpRequest request = java.net.http.HttpRequest.newBuilder()
                        .uri(java.net.URI.create(runnerUrl.replaceAll("/$", "") + "/cancel"))
                        .header("Content-Type", "application/json")
                        .header("X-Runner-Token", props.getRunnerCallbackToken())
                        .POST(java.net.http.HttpRequest.BodyPublishers.ofString(
                                "{\"taskId\":\"" + taskId + "\"}"))
                        .build();
                client.send(request, java.net.http.HttpResponse.BodyHandlers.discarding());
            } catch (Exception e) {
                log.warn("Failed to cancel runner job", e);
            }
        }
        jobSpecStore.remove(taskId);
    }

    public void closeRunnerAgent(String appId) {
        // No persistent agent sessions in Claude SDK, just clean up job specs
        jobSpecStore.remove(appId);
    }

    private String getCallbackUrl() {
        String url = props.getRunnerCallbackUrl();
        if (url != null && !url.isBlank()) return url;
        return "http://host.docker.internal:" + props.getPort();
    }
}

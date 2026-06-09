package com.appforge.service;

import com.appforge.config.AppForgeProperties;
import com.appforge.model.*;
import com.appforge.store.JsonStoreService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
public class ClaudeAgentService {

    private final JsonStoreService store;
    private final IdGenerator id;
    private final AppForgeProperties props;
    private final TaskEventService taskEventService;
    private final DockerExecutorService dockerExecutor;
    private final JobSpecStore jobSpecStore;
    private final WorkspaceService workspace;
    private final Set<String> cancelledTasks = ConcurrentHashMap.newKeySet();

    public Task startAgentRun(String appId, AgentRunRequest input) {
        App app = store.findApp(appId)
                .orElseThrow(() -> new IllegalArgumentException("App not found: " + appId));

        String apiKey = props.getDeepseekApiKey();
        if (apiKey == null || apiKey.isBlank()) {
            throw new IllegalArgumentException("DEEPSEEK_API_KEY not configured. Set deepseekApiKey in config.json or in application.yml.");
        }

        Task task = Task.builder()
                .id(id.createId("task"))
                .appId(appId)
                .type("claude_agent")
                .status("running")
                .prompt(input.getPrompt())
                .createdAt(id.now())
                .completedAt(null)
                .build();

        store.insertTask(task);
        runAgentTaskAsync(app, input, task.getId());
        return task;
    }

    @Async
    public void runAgentTaskAsync(App app, AgentRunRequest input, String taskId) {
        try {
            runAgentTask(app, input, taskId);
        } catch (Exception e) {
            log.error("Agent task failed: {}", e.getMessage(), e);
            taskEventService.pushTaskEvent(taskId, "task_failed", Map.of("message", e.getMessage()));
            markTask(taskId, "failed");
        }
    }

    private void runAgentTask(App app, AgentRunRequest input, String taskId) {
        String cwd = store.appWorkspace(app.getId());

        taskEventService.pushTaskEvent(taskId, "step_started", Map.of(
                "message", "Running Claude Agent",
                "step", "claude_agent"
        ));

        // record before file tree
        Set<String> beforeFiles = flattenTree(workspace.readTree(cwd));

        // build prompt
        String prompt = buildAgentPrompt(input, app);

        // always dispatch to Docker runner (no local mode)
        dockerExecutor.dispatchRunnerJob("claude_agent", taskId, app, cwd, prompt);

        log.info("Agent run dispatched: task={} app={}", taskId, app.getId());
    }

    public void stopAgentRun(String appId, String taskId) {
        cancelledTasks.add(taskId);
        dockerExecutor.cancelRunnerJob(taskId, appId);
        taskEventService.pushTaskEvent(taskId, "task_failed", Map.of("message", "Task stopped by user"));
        markTask(taskId, "failed");
    }

    public void closeAgentSession(String appId) {
        dockerExecutor.closeRunnerAgent(appId);
    }

    public boolean isTaskCancelled(String taskId) {
        return cancelledTasks.contains(taskId);
    }

    private void markTask(String taskId, String status) {
        String completedAt = ("completed".equals(status) || "failed".equals(status))
                ? id.now() : null;
        store.updateTaskStatus(taskId, status, completedAt);
    }

    private String buildAgentPrompt(AgentRunRequest input, App app) {
        StringBuilder sb = new StringBuilder();
        sb.append("Project name: ").append(app.getName()).append("\n");
        sb.append("Project slug: ").append(app.getSlug()).append("\n");
        sb.append("GitLab repository: ").append(app.getRepoUrl() != null && !app.getRepoUrl().isBlank() ? app.getRepoUrl() : "not configured").append("\n");
        sb.append("Currently opened file: ").append(input.getActiveFile() != null ? input.getActiveFile() : "none").append("\n\n");
        sb.append("Run setup rules:\n");
        sb.append("- AppForge runs projects via Docker in the IDE terminal.\n");
        sb.append("- Keep or create .appforge/run.json with runtime \"docker\", install \"docker compose build\", command \"docker compose up --remove-orphans\", stop \"docker compose down --remove-orphans\".\n");
        sb.append("- Keep or create Dockerfile and docker-compose.yml matching the project stack.\n");
        sb.append("- Do not bind-mount project source in docker-compose.yml; compose runs on the host Docker daemon.\n");
        sb.append("- Preview is opened via the AppForge Traefik gateway (/app/:appId/).\n");
        sb.append("- In docker-compose.yml, use external network with key and name both \"appforge-net\".\n");
        sb.append("- Publish the service port to a random host port: ports: [\"0:8080\"] (the 0 means Docker assigns a random host port for preview).\n");
        sb.append("- Do not rely on local npm/python in the IDE container unless runtime is explicitly local.\n\n");
        sb.append("User request:\n");
        sb.append(input.getPrompt());
        return sb.toString();
    }

    private Set<String> flattenTree(List<WorkspaceService.TreeNode> nodes) {
        return nodes.stream()
                .flatMap(n -> {
                    if ("file".equals(n.type())) {
                        return java.util.stream.Stream.of(n.path());
                    }
                    if (n.children() != null) {
                        return flattenTree(n.children()).stream();
                    }
                    return java.util.stream.Stream.empty();
                })
                .collect(Collectors.toSet());
    }
}

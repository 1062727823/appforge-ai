package com.appforge.service;

import com.appforge.model.App;
import com.appforge.model.Task;
import com.appforge.store.JsonStoreService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;

import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

@Slf4j
@Service
@RequiredArgsConstructor
public class TaskService {

    private final JsonStoreService store;
    private final IdGenerator id;
    private final GitService gitService;
    private final TaskEventService taskEventService;
    private final Set<String> cancelledTasks = ConcurrentHashMap.newKeySet();

    public Optional<Task> findTask(String taskId) {
        return store.findTask(taskId);
    }

    public void cancelTask(String taskId) {
        cancelledTasks.add(taskId);
        log.info("Task cancelled: {}", taskId);
    }

    public boolean isTaskCancelled(String taskId) {
        return cancelledTasks.contains(taskId);
    }

    public Task startWorkspaceSync(String appId, boolean force) {
        App app = store.findApp(appId)
                .orElseThrow(() -> new IllegalArgumentException("App not found: " + appId));

        if (!force && "ready".equals(app.getStatus())) {
            return null; // skip - already ready
        }

        // check for existing running sync task
        boolean hasRunning = store.listTasksByAppId(appId).stream()
                .anyMatch(t -> "running".equals(t.getStatus())
                        && ("create_app".equals(t.getType()) || "workspace_sync".equals(t.getType())));
        if (hasRunning) {
            return store.listTasksByAppId(appId).stream()
                    .filter(t -> "running".equals(t.getStatus()))
                    .findFirst().orElse(null);
        }

        Task task = Task.builder()
                .id(id.createId("task"))
                .appId(appId)
                .type("workspace_sync")
                .status("running")
                .prompt("")
                .createdAt(id.now())
                .completedAt(null)
                .build();

        store.insertTask(task);
        runGitWorkspaceTask(task.getId(), appId, "Syncing workspace on editor entry");
        return task;
    }

    @Async
    public void runCreateTaskAsync(String taskId, String appId) {
        runGitWorkspaceTask(taskId, appId, "Creating project workspace");
    }

    public void runGitWorkspaceTask(String taskId, String appId, String introMessage) {
        if (isTaskCancelled(taskId)) return;

        App app = store.findApp(appId).orElse(null);
        if (app == null) {
            taskEventService.pushTaskEvent(taskId, "task_failed", Map.of("message", "App not found"));
            markTask(taskId, "failed");
            return;
        }

        String cwd = store.appWorkspace(appId);

        taskEventService.pushTaskEvent(taskId, "step_started", Map.of(
                "message", introMessage,
                "step", "prepare_workspace"
        ));

        String syncMessage = app.getRepoUrl() != null && !app.getRepoUrl().isBlank()
                ? "Syncing remote Git repository"
                : "Initializing local Git repository";

        taskEventService.pushTaskEvent(taskId, "step_started", Map.of(
                "message", syncMessage,
                "step", "create_repo"
        ));

        try {
            String action = gitService.syncWorkspaceGit(appId, app.getRepoUrl(), cwd,
                    (command, output) -> taskEventService.pushTaskEvent(taskId, "command_output",
                            Map.of("command", command, "output", output)));

            // mark app ready
            app.setStatus("ready");
            app.setUpdatedAt(id.now());
            store.updateApp(app);

            markTask(taskId, "completed");
            String msg;
            if ("skip".equals(action)) {
                msg = "Workspace ready (no git repository configured)";
            } else if ("clone".equals(action)) {
                msg = "Workspace cloned successfully";
            } else {
                msg = "Workspace synced successfully";
            }
            taskEventService.pushTaskEvent(taskId, "task_completed", Map.of(
                    "appStatus", "ready",
                    "message", msg
            ));

        } catch (Exception e) {
            taskEventService.pushTaskEvent(taskId, "task_failed", Map.of("message", e.getMessage()));
            markTask(taskId, "failed");
        }
    }

    private void markTask(String taskId, String status) {
        String completedAt = ("completed".equals(status) || "failed".equals(status))
                ? id.now() : null;
        store.updateTaskStatus(taskId, status, completedAt);
    }
}

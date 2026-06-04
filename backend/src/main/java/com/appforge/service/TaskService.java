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
        store.readLock();
        try {
            return store.getState().getTasks().stream()
                    .filter(t -> t.getId().equals(taskId))
                    .findFirst();
        } finally {
            store.readUnlock();
        }
    }

    public void cancelTask(String taskId) {
        cancelledTasks.add(taskId);
        log.info("Task cancelled: {}", taskId);
    }

    public boolean isTaskCancelled(String taskId) {
        return cancelledTasks.contains(taskId);
    }

    public Task startWorkspaceSync(String appId, boolean force) {
        store.readLock();
        try {
            App app = store.getState().getApps().stream()
                    .filter(a -> a.getId().equals(appId))
                    .findFirst()
                    .orElseThrow(() -> new IllegalArgumentException("App not found: " + appId));

            if (!force && "ready".equals(app.getStatus())) {
                return null; // skip - already ready
            }

            // check for existing running sync task
            boolean hasRunning = store.getState().getTasks().stream()
                    .anyMatch(t -> t.getAppId().equals(appId) && "running".equals(t.getStatus())
                            && ("create_app".equals(t.getType()) || "workspace_sync".equals(t.getType())));
            if (hasRunning) {
                return store.getState().getTasks().stream()
                        .filter(t -> t.getAppId().equals(appId) && "running".equals(t.getStatus()))
                        .findFirst().orElse(null);
            }
        } finally {
            store.readUnlock();
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

        store.writeLock();
        try {
            store.getState().getTasks().add(task);
            store.saveStore();
        } finally {
            store.writeUnlock();
        }

        runGitWorkspaceTask(task.getId(), appId, "Syncing workspace on editor entry");
        return task;
    }

    @Async
    public void runCreateTaskAsync(String taskId, String appId) {
        runGitWorkspaceTask(taskId, appId, "Creating project workspace");
    }

    public void runGitWorkspaceTask(String taskId, String appId, String introMessage) {
        if (isTaskCancelled(taskId)) return;

        store.readLock();
        App app = store.getState().getApps().stream()
                .filter(a -> a.getId().equals(appId))
                .findFirst().orElse(null);
        store.readUnlock();

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
            store.writeLock();
            try {
                store.getState().getApps().stream()
                        .filter(a -> a.getId().equals(appId))
                        .findFirst().ifPresent(a -> {
                            a.setStatus("ready");
                            a.setUpdatedAt(id.now());
                        });
                store.saveStore();
            } finally {
                store.writeUnlock();
            }

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
        store.writeLock();
        try {
            store.getState().getTasks().stream()
                    .filter(t -> t.getId().equals(taskId))
                    .findFirst()
                    .ifPresent(t -> {
                        t.setStatus(status);
                        if ("completed".equals(status) || "failed".equals(status)) {
                            t.setCompletedAt(id.now());
                        }
                    });
            store.saveStore();
        } finally {
            store.writeUnlock();
        }
    }
}

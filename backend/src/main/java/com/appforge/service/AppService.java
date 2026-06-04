package com.appforge.service;

import com.appforge.model.*;
import com.appforge.store.JsonStoreService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.util.List;
import java.util.Optional;

@Slf4j
@Service
@RequiredArgsConstructor
public class AppService {

    private final JsonStoreService store;
    private final IdGenerator id;
    private final WorkspaceService workspace;
    private final TaskService taskService;

    public List<App> listApps() {
        store.readLock();
        try {
            return List.copyOf(store.getState().getApps());
        } finally {
            store.readUnlock();
        }
    }

    public Optional<App> findApp(String appId) {
        store.readLock();
        try {
            return store.getState().getApps().stream()
                    .filter(a -> a.getId().equals(appId))
                    .findFirst();
        } finally {
            store.readUnlock();
        }
    }

    public App createApp(CreateAppRequest input) {
        store.writeLock();
        try {
            // check slug uniqueness
            boolean slugExists = store.getState().getApps().stream()
                    .anyMatch(a -> a.getSlug().equals(input.getSlug()));
            if (slugExists) {
                throw new IllegalArgumentException("App with slug '" + input.getSlug() + "' already exists");
            }

            App app = App.builder()
                    .id(id.createId("app"))
                    .name(input.getName())
                    .slug(input.getSlug())
                    .description(input.getDescription() != null ? input.getDescription() : "")
                    .repoUrl(input.getRepoUrl() != null ? input.getRepoUrl() : "")
                    .teamName(input.getTeamName() != null ? input.getTeamName() : "")
                    .visibility(input.getVisibility() != null ? input.getVisibility() : "private")
                    .deployMethod(input.getDeployMethod() != null ? input.getDeployMethod() : "docker")
                    .status("creating")
                    .createdAt(id.now())
                    .updatedAt(id.now())
                    .build();

            store.getState().getApps().add(app);
            store.saveStore();

            // ensure workspace directory
            String wsDir = store.appWorkspace(app.getId());
            try {
                workspace.ensureDir(wsDir);
            } catch (IOException e) {
                throw new RuntimeException("Failed to create workspace: " + e.getMessage(), e);
            }

            // add to deploy list
            store.getState().getDeployApps().add(DeployAppEntry.builder()
                    .appId(app.getId())
                    .name(app.getName())
                    .slug(app.getSlug())
                    .teamName(app.getTeamName())
                    .deployMethod(app.getDeployMethod())
                    .status("pending")
                    .addedAt(id.now())
                    .build());
            store.saveStore();

            // trigger async git workspace setup
            Task task = Task.builder()
                    .id(id.createId("task"))
                    .appId(app.getId())
                    .type("create_app")
                    .status("running")
                    .prompt("")
                    .createdAt(id.now())
                    .completedAt(null)
                    .build();
            store.getState().getTasks().add(task);
            store.saveStore();

            taskService.runCreateTaskAsync(task.getId(), app.getId());

            return app;
        } finally {
            store.writeUnlock();
        }
    }

    public App updateApp(String appId, UpdateAppRequest input) {
        store.writeLock();
        try {
            App app = store.getState().getApps().stream()
                    .filter(a -> a.getId().equals(appId))
                    .findFirst()
                    .orElseThrow(() -> new IllegalArgumentException("App not found: " + appId));

            if (input.getName() != null) app.setName(input.getName());
            if (input.getDescription() != null) app.setDescription(input.getDescription());
            if (input.getRepoUrl() != null) app.setRepoUrl(input.getRepoUrl());
            if (input.getTeamName() != null) app.setTeamName(input.getTeamName());
            if (input.getVisibility() != null) app.setVisibility(input.getVisibility());
            app.setUpdatedAt(id.now());

            store.saveStore();
            return app;
        } finally {
            store.writeUnlock();
        }
    }

    public void deleteApp(String appId) {
        store.writeLock();
        try {
            App app = store.getState().getApps().stream()
                    .filter(a -> a.getId().equals(appId))
                    .findFirst()
                    .orElseThrow(() -> new IllegalArgumentException("App not found: " + appId));

            // cancel running tasks
            store.getState().getTasks().stream()
                    .filter(t -> t.getAppId().equals(appId) && "running".equals(t.getStatus()))
                    .forEach(t -> taskService.cancelTask(t.getId()));

            // remove from deploy list
            store.getState().getDeployApps().removeIf(d -> d.getAppId().equals(appId));
            // remove tasks
            store.getState().getTasks().removeIf(t -> t.getAppId().equals(appId));
            // remove events
            store.getState().getEvents().removeIf(e -> store.getState().getTasks().stream()
                    .noneMatch(t -> t.getId().equals(e.getTaskId())));
            // remove app
            store.getState().getApps().removeIf(a -> a.getId().equals(appId));
            store.saveStore();

            // delete workspace
            try {
                workspace.deleteDir(store.appWorkspace(appId));
            } catch (IOException e) {
                log.warn("Failed to delete workspace for app {}", appId, e);
            }
        } finally {
            store.writeUnlock();
        }
    }
}

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
        return store.listApps();
    }

    public Optional<App> findApp(String appId) {
        return store.findApp(appId);
    }

    public App createApp(CreateAppRequest input) {
        // check slug uniqueness
        boolean slugExists = store.listApps().stream()
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

        store.insertApp(app);

        // ensure workspace directory
        String wsDir = store.appWorkspace(app.getId());
        try {
            workspace.ensureDir(wsDir);
        } catch (IOException e) {
            throw new RuntimeException("Failed to create workspace: " + e.getMessage(), e);
        }

        // add to deploy list
        store.insertDeployApp(DeployAppEntry.builder()
                .appId(app.getId())
                .name(app.getName())
                .slug(app.getSlug())
                .teamName(app.getTeamName())
                .deployMethod(app.getDeployMethod())
                .status("pending")
                .addedAt(id.now())
                .build());

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
        store.insertTask(task);

        taskService.runCreateTaskAsync(task.getId(), app.getId());

        return app;
    }

    public App updateApp(String appId, UpdateAppRequest input) {
        App app = store.findApp(appId)
                .orElseThrow(() -> new IllegalArgumentException("App not found: " + appId));

        if (input.getName() != null) app.setName(input.getName());
        if (input.getDescription() != null) app.setDescription(input.getDescription());
        if (input.getRepoUrl() != null) app.setRepoUrl(input.getRepoUrl());
        if (input.getTeamName() != null) app.setTeamName(input.getTeamName());
        if (input.getVisibility() != null) app.setVisibility(input.getVisibility());
        app.setUpdatedAt(id.now());

        store.updateApp(app);
        return app;
    }

    public void deleteApp(String appId) {
        App app = store.findApp(appId)
                .orElseThrow(() -> new IllegalArgumentException("App not found: " + appId));

        // cancel running tasks
        List<Task> appTasks = store.listTasksByAppId(appId);
        appTasks.stream()
                .filter(t -> "running".equals(t.getStatus()))
                .forEach(t -> taskService.cancelTask(t.getId()));

        // delete events for all tasks of this app
        for (Task t : appTasks) {
            store.deleteEventsByTaskId(t.getId());
        }

        // delete deploy entry, tasks, app
        store.deleteDeployApp(appId);
        store.deleteTasksByAppId(appId);
        store.deleteApp(appId);

        // delete workspace
        try {
            workspace.deleteDir(store.appWorkspace(appId));
        } catch (IOException e) {
            log.warn("Failed to delete workspace for app {}", appId, e);
        }
    }
}

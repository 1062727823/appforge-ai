package com.appforge.service;

import com.appforge.store.JsonStoreService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.attribute.BasicFileAttributes;
import java.time.Instant;
import java.util.Set;

@Slf4j
@Service
@RequiredArgsConstructor
public class RunIdleService {

    private final RunDockerService runDocker;
    private final JsonStoreService store;

    private static final long IDLE_TIMEOUT_MINUTES = 30;

    @Scheduled(fixedRate = 60_000)
    public void scanIdleProjects() {
        if (!runDocker.isDockerAvailable()) {
            return;
        }
        Set<String> runningAppIds = runDocker.listRunningAppIds();

        for (String appId : runningAppIds) {
            String cwd = store.appWorkspace(appId);
            Path triggerFile = Path.of(cwd, ".appforge", ".run-trigger");

            try {
                if (Files.exists(triggerFile)) {
                    BasicFileAttributes attrs = Files.readAttributes(triggerFile, BasicFileAttributes.class);
                    Instant lastModified = attrs.lastModifiedTime().toInstant();
                    long idleMinutes = java.time.Duration.between(lastModified, Instant.now()).toMinutes();

                    if (idleMinutes > IDLE_TIMEOUT_MINUTES) {
                        log.info("Stopping idle project: {} (idle {} minutes)", appId, idleMinutes);
                        runDocker.stopRun(appId, cwd);
                    }
                }
            } catch (IOException e) {
                log.warn("Failed to check idle status for {}", appId, e);
            }
        }
    }
}

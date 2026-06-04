package com.appforge.service;

import com.appforge.config.AppForgeProperties;
import com.appforge.store.JsonStoreService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.LinkedHashMap;
import java.util.Map;

@Slf4j
@Service
@RequiredArgsConstructor
public class RunSpecService {

    private final JsonStoreService store;
    private final AppForgeProperties props;
    private final WorkspaceService workspace;

    public Map<String, Object> resolveRunSpec(String appId) {
        String cwd = store.appWorkspace(appId);
        Path manifest = Path.of(cwd, ".appforge", "run.json");

        Map<String, Object> spec = new LinkedHashMap<>();
        spec.put("runtime", "docker");
        spec.put("command", "docker compose up -d --remove-orphans");
        spec.put("install", "docker compose build");
        spec.put("stop", "docker compose down --remove-orphans");
        spec.put("port", 3000);

        if (Files.exists(manifest)) {
            try {
                String content = Files.readString(manifest);
                @SuppressWarnings("unchecked")
                Map<String, Object> parsed = new com.fasterxml.jackson.databind.ObjectMapper()
                        .readValue(content, Map.class);
                spec.putAll(parsed);
            } catch (IOException e) {
                log.warn("Failed to parse run.json for {}", appId);
            }
        }

        return spec;
    }

    public void writeRunTrigger(String appId, String action) {
        String cwd = store.appWorkspace(appId);
        Path triggerFile = Path.of(cwd, ".appforge", ".run-trigger");
        try {
            workspace.ensureDir(triggerFile.getParent().toString());
            String content = String.format("{\"action\":\"%s\",\"at\":\"%s\"}",
                    action, java.time.Instant.now().toString());
            Files.writeString(triggerFile, content);
        } catch (IOException e) {
            throw new RuntimeException("Failed to write run trigger: " + e.getMessage(), e);
        }
    }
}

package com.appforge.service;

import com.appforge.config.AppForgeProperties;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.*;

@Slf4j
@Service
@RequiredArgsConstructor
public class DeployHistoryService {

    private static final int MAX_ENTRIES = 50;

    private final AppForgeProperties props;
    private final ObjectMapper mapper = new ObjectMapper();

    @SuppressWarnings("unchecked")
    public List<Map<String, Object>> readHistory(String appId) {
        Path historyFile = getHistoryFile(appId);
        if (!Files.exists(historyFile)) return List.of();

        try {
            String content = Files.readString(historyFile);
            return mapper.readValue(content, List.class);
        } catch (IOException e) {
            return List.of();
        }
    }

    public void appendHistory(String appId, String action, String status, String message, String deployUrl) {
        Path historyFile = getHistoryFile(appId);
        List<Map<String, Object>> entries = new ArrayList<>(readHistory(appId));

        Map<String, Object> entry = new LinkedHashMap<>();
        entry.put("id", UUID.randomUUID().toString().replace("-", "").substring(0, 16));
        entry.put("action", action);
        entry.put("status", status);
        entry.put("message", message);
        entry.put("deployUrl", deployUrl);
        entry.put("at", java.time.Instant.now().toString());
        entries.add(0, entry);

        if (entries.size() > MAX_ENTRIES) {
            entries = entries.subList(0, MAX_ENTRIES);
        }

        try {
            Files.createDirectories(historyFile.getParent());
            Files.writeString(historyFile, mapper.writerWithDefaultPrettyPrinter().writeValueAsString(entries));
        } catch (IOException e) {
            log.warn("Failed to write deploy history for {}: {}", appId, e.getMessage());
        }
    }

    private Path getHistoryFile(String appId) {
        return Path.of(props.getDataDir(), "workspaces", appId, ".appforge", "deploy-history.json");
    }
}

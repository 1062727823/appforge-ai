package com.appforge.service;

import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardOpenOption;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Slf4j
@Service
public class EnvFileService {

    private final Path envFile;

    public EnvFileService() {
        String envPath = System.getenv().getOrDefault("APPFORGE_ENV_FILE", ".env");
        this.envFile = Paths.get(envPath);
    }

    public Map<String, String> readEnvFile() {
        Map<String, String> result = new LinkedHashMap<>();
        if (!Files.exists(envFile)) return result;

        try {
            List<String> lines = Files.readAllLines(envFile);
            for (String line : lines) {
                line = line.trim();
                if (line.isEmpty() || line.startsWith("#")) continue;
                int eq = line.indexOf('=');
                if (eq > 0) {
                    String key = line.substring(0, eq).trim();
                    String value = line.substring(eq + 1).trim();
                    if (value.startsWith("\"") && value.endsWith("\"") && value.length() >= 2) {
                        value = value.substring(1, value.length() - 1);
                    }
                    result.put(key, value);
                }
            }
        } catch (IOException e) {
            log.warn("Failed to read env file: {}", e.getMessage());
        }
        return result;
    }

    public void upsertEnvValues(Map<String, String> updates) {
        try {
            Map<String, String> current = readEnvFile();
            current.putAll(updates);

            StringBuilder sb = new StringBuilder();
            for (var entry : current.entrySet()) {
                sb.append(entry.getKey()).append("=\"").append(entry.getValue()).append("\"\n");
            }
            Files.writeString(envFile, sb.toString(),
                    StandardOpenOption.CREATE, StandardOpenOption.TRUNCATE_EXISTING);
        } catch (IOException e) {
            log.warn("Failed to write env file: {}", e.getMessage());
        }
    }

    public String resolveEnvValue(String key) {
        String envVal = System.getenv(key);
        if (envVal != null) return envVal;

        Map<String, String> fileVals = readEnvFile();
        return fileVals.getOrDefault(key, "");
    }

    public boolean canWriteEnvFile() {
        return !Files.exists(envFile) || Files.isWritable(envFile);
    }
}

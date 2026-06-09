package com.appforge.service;

import com.appforge.config.AppForgeProperties;
import com.appforge.model.UpdateSettingsRequest;
import com.appforge.store.JsonStoreService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.LinkedHashMap;
import java.util.Map;

@Service
@RequiredArgsConstructor
public class SettingsService {

    private final JsonStoreService store;
    private final EnvFileService envFile;
    private final AppForgeProperties props;

    public Map<String, Object> getSettings() {
        Map<String, Object> cursor = new LinkedHashMap<>();
        cursor.put("apiKey", maskSecret(props.getDeepseekApiKey()));
        cursor.put("model", props.getDeepseekModel());

        Map<String, Object> gitlab = new LinkedHashMap<>();
        gitlab.put("baseUrl", props.getGitlabBaseUrl());
        gitlab.put("internalUrl", props.getGitlabInternalUrl());
        gitlab.put("token", maskSecret(props.getGitlabToken()));

        Map<String, Object> gateway = new LinkedHashMap<>();
        gateway.put("publicUrl", props.getGatewayPublicUrl());
        gateway.put("deployPublicUrl", props.getDeployGatewayPublicUrl());

        Map<String, Object> meta = new LinkedHashMap<>();
        meta.put("version", "0.1.0-java");
        meta.put("storePath", props.getStorePath());

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("cursor", cursor);
        result.put("gitlab", gitlab);
        result.put("gateway", gateway);
        result.put("meta", meta);
        return result;
    }

    public void updateSettings(UpdateSettingsRequest input) {
        Map<String, String> envUpdates = new LinkedHashMap<>();

        if (input.getCursorApiKey() != null) {
            envUpdates.put("DEEPSEEK_API_KEY", input.getCursorApiKey());
            props.setDeepseekApiKey(input.getCursorApiKey());
        }
        if (input.getCursorModel() != null) {
            envUpdates.put("DEEPSEEK_MODEL", input.getCursorModel());
            props.setDeepseekModel(input.getCursorModel());
        }
        if (input.getGitlabBaseUrl() != null) envUpdates.put("GITLAB_BASE_URL", input.getGitlabBaseUrl());
        if (input.getGitlabInternalUrl() != null) envUpdates.put("GITLAB_INTERNAL_URL", input.getGitlabInternalUrl());
        if (input.getGitlabToken() != null) envUpdates.put("GITLAB_TOKEN", input.getGitlabToken());
        if (input.getAppGatewayPublicUrl() != null) envUpdates.put("APP_GATEWAY_PUBLIC_URL", input.getAppGatewayPublicUrl());
        if (input.getAppDeployGatewayPublicUrl() != null) envUpdates.put("APP_DEPLOY_GATEWAY_PUBLIC_URL", input.getAppDeployGatewayPublicUrl());

        if (!envUpdates.isEmpty() && envFile.canWriteEnvFile()) {
            envFile.upsertEnvValues(envUpdates);
        }

        // persist to H2 settings table
        for (var entry : envUpdates.entrySet()) {
            store.saveSetting(entry.getKey(), entry.getValue());
        }
    }

    public void bootstrapSettings() {
        // apply stored settings at startup
        Map<String, Object> stored = store.loadSettings();
        stored.forEach((k, v) -> {
            if (v != null && System.getenv(k) == null) {
                // stored settings override missing env vars
            }
        });
    }

    private String maskSecret(String value) {
        if (value == null || value.isBlank()) return "";
        if (value.length() <= 8) return "****";
        return value.substring(0, 4) + "****" + value.substring(value.length() - 4);
    }
}

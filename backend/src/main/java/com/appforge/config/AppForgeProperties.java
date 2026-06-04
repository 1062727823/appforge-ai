package com.appforge.config;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;

@Data
@ConfigurationProperties(prefix = "appforge")
public class AppForgeProperties {

    private String dataDir;
    private String webRoot;
    private String codeServerUrl;
    private String agentRunnerUrl;
    private String agentRunnerImage;
    private String runnerCallbackToken;
    private String runnerCallbackUrl;
    private String gatewayPublicUrl;
    private String deployGatewayPublicUrl;
    private String dockerNetwork;
    private String runtimeNetwork;
    private String gitlabBaseUrl;
    private String gitlabInternalUrl;
    private String gitlabToken;
    private String deepseekApiKey;
    private String deepseekModel;
    private String agentMemoryLimit;
    private String agentCpuLimit;
    private String logLevel;

    public int getPort() {
        String port = System.getenv().getOrDefault("PORT", "4173");
        return Integer.parseInt(port);
    }

    public String getStorePath() {
        return dataDir + "/db.json";
    }

    public String getWorkspaceDir() {
        return dataDir + "/workspaces";
    }

    public String getAppWorkspace(String appId) {
        return getWorkspaceDir() + "/" + appId + "/repo";
    }
}

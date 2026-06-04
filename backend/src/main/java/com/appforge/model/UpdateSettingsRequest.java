package com.appforge.model;

import lombok.Data;

@Data
public class UpdateSettingsRequest {
    private String cursorApiKey;
    private String cursorModel;
    private String gitlabBaseUrl;
    private String gitlabInternalUrl;
    private String gitlabToken;
    private String appGatewayPublicUrl;
    private String appDeployGatewayPublicUrl;
}

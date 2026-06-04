package com.appforge.controller;

import com.appforge.config.AppForgeProperties;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api")
@RequiredArgsConstructor
public class CreateOptionsController {

    private final AppForgeProperties props;

    @GetMapping("/create-options")
    public Map<String, Object> getCreateOptions() {
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("teams", List.of(
                Map.of("name", "Default", "label", "Default Team")
        ));
        result.put("visibilityOptions", List.of(
                Map.of("value", "private", "label", "Private"),
                Map.of("value", "internal", "label", "Internal"),
                Map.of("value", "public", "label", "Public")
        ));
        result.put("deployMethods", List.of(
                Map.of("value", "docker", "label", "Docker Compose", "available", true),
                Map.of("value", "kubernetes", "label", "Kubernetes", "available", false)
        ));

        String gitlabUrl = props.getGitlabBaseUrl();
        if (gitlabUrl != null && !gitlabUrl.isBlank()) {
            result.put("gitlab", Map.of(
                    "baseUrl", gitlabUrl,
                    "exampleRepoUrl", gitlabUrl + "/acme/sales-crm",
                    "hosts", List.of(gitlabUrl.replace("https://", "").replace("http://", "").split(":")[0])
            ));
        } else {
            result.put("gitlab", Map.of(
                    "baseUrl", "https://gitlab.com",
                    "exampleRepoUrl", "https://gitlab.com/acme/sales-crm",
                    "hosts", List.of("gitlab.com")
            ));
        }

        result.put("repositories", List.of());
        return result;
    }
}

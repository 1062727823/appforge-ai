package com.appforge.model;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class AppState {
    @Builder.Default
    private List<App> apps = new ArrayList<>();
    @Builder.Default
    private List<Task> tasks = new ArrayList<>();
    @Builder.Default
    private List<TaskEvent> events = new ArrayList<>();
    @Builder.Default
    private List<DeployAppEntry> deployApps = new ArrayList<>();
    private List<Map<String, String>> teams;
    private List<Map<String, String>> visibilityOptions;
    private List<Map<String, String>> deployMethods;
    private Map<String, Object> settings;
}

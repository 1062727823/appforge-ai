package com.appforge.controller;

import com.appforge.model.DeployAppEntry;
import com.appforge.service.*;
import com.appforge.store.JsonStoreService;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.util.*;

@RestController
@RequestMapping("/api")
@RequiredArgsConstructor
public class DeployController {

    private final DeployDockerService deployDocker;
    private final DeployHistoryService history;
    private final DeployListService deployList;
    private final DeployLogStreamService logStream;
    private final RunDockerService runDocker;
    private final TraefikService traefik;
    private final JsonStoreService store;

    @GetMapping("/deploy/overview")
    public ResponseEntity<Map<String, Object>> deployOverview() {
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("runningAppIds", runDocker.listRunningAppIds());
        result.put("deployApps", deployList.getDeployApps());
        return ResponseEntity.ok(result);
    }

    @PostMapping("/apps/{appId}/deploy/dismiss")
    public ResponseEntity<?> dismissDeploy(@PathVariable String appId) {
        deployList.removeFromDeployList(appId);
        return ResponseEntity.ok(Map.of("ok", true));
    }

    @GetMapping("/apps/{appId}/deploy/url")
    public ResponseEntity<?> getDeployUrl(@PathVariable String appId) {
        return ResponseEntity.ok(Map.of("url", traefik.deployUrlFor(appId)));
    }

    @GetMapping("/apps/{appId}/deploy/status")
    public ResponseEntity<?> getDeployStatus(@PathVariable String appId) {
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("history", history.readHistory(appId));
        result.put("deployUrl", traefik.deployUrlFor(appId));
        return ResponseEntity.ok(result);
    }

    @GetMapping("/apps/{appId}/deploy/history")
    public ResponseEntity<?> getDeployHistory(@PathVariable String appId) {
        return ResponseEntity.ok(history.readHistory(appId));
    }

    @GetMapping("/apps/{appId}/deploy/logs/stream")
    public SseEmitter deployLogStream(@PathVariable String appId) {
        return logStream.registerDeployLogClient(appId);
    }

    @GetMapping("/apps/{appId}/deploy/logs")
    public ResponseEntity<?> getDeployLogs(@PathVariable String appId) {
        return ResponseEntity.ok(Map.of("message", "Deploy logs available via stream endpoint"));
    }

    @PostMapping("/apps/{appId}/deploy/trigger")
    public ResponseEntity<?> triggerDeploy(@PathVariable String appId) {
        deployDocker.triggerDeploy(appId);
        return ResponseEntity.ok(Map.of("ok", true));
    }

    @PostMapping("/apps/{appId}/deploy/stop")
    public ResponseEntity<?> stopDeploy(@PathVariable String appId) {
        deployDocker.stopDeploy(appId);
        return ResponseEntity.ok(Map.of("ok", true));
    }

    @PostMapping("/apps/{appId}/deploy/restart")
    public ResponseEntity<?> restartDeploy(@PathVariable String appId) {
        deployDocker.restartDeploy(appId);
        return ResponseEntity.ok(Map.of("ok", true));
    }

    @RequestMapping(value = {"/apps/{appId}/deploy/preview", "/apps/{appId}/deploy/preview/**"},
            method = {RequestMethod.GET, RequestMethod.POST, RequestMethod.PUT, RequestMethod.DELETE})
    public ResponseEntity<?> deployPreviewProxy(@PathVariable String appId, HttpServletRequest request) {
        String url = traefik.deployUrlFor(appId);
        return ResponseEntity.status(302)
                .header("Location", url)
                .build();
    }
}

package com.appforge.controller;

import com.appforge.model.App;
import com.appforge.model.CreateAppRequest;
import com.appforge.model.UpdateAppRequest;
import com.appforge.service.AppService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api")
@RequiredArgsConstructor
public class AppController {

    private final AppService appService;

    @GetMapping("/apps")
    public Map<String, Object> listApps() {
        return Map.of("apps", appService.listApps());
    }

    @PostMapping("/apps")
    public ResponseEntity<?> createApp(@Valid @RequestBody CreateAppRequest input) {
        try {
            App app = appService.createApp(input);
            return ResponseEntity.status(HttpStatus.CREATED).body(app);
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    @PutMapping("/apps/{appId}")
    public ResponseEntity<?> updateApp(@PathVariable String appId,
                                       @Valid @RequestBody UpdateAppRequest input) {
        try {
            App app = appService.updateApp(appId, input);
            return ResponseEntity.ok(app);
        } catch (IllegalArgumentException e) {
            if (e.getMessage().startsWith("App not found")) {
                return ResponseEntity.notFound().build();
            }
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    @DeleteMapping("/apps/{appId}")
    public ResponseEntity<?> deleteApp(@PathVariable String appId) {
        try {
            appService.deleteApp(appId);
            return ResponseEntity.ok(Map.of("ok", true));
        } catch (IllegalArgumentException e) {
            if (e.getMessage().startsWith("App not found")) {
                return ResponseEntity.notFound().build();
            }
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    @GetMapping("/apps/{appId}/ide")
    public ResponseEntity<?> getIdeUrl(@PathVariable String appId) {
        var appOpt = appService.findApp(appId);
        if (appOpt.isEmpty()) {
            return ResponseEntity.notFound().build();
        }
        String folder = "/data/appforge/workspaces/" + appId + "/repo";
        // nginx proxy path
        String url = "/ide/?folder=" + java.net.URLEncoder.encode(folder, java.nio.charset.StandardCharsets.UTF_8);
        return ResponseEntity.ok(Map.of("folder", folder, "url", url));
    }
}

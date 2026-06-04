package com.appforge.controller;

import com.appforge.model.RunTriggerRequest;
import com.appforge.service.*;
import com.appforge.store.JsonStoreService;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.util.Map;
import java.util.concurrent.CompletableFuture;

@Slf4j
@RestController
@RequestMapping("/api")
@RequiredArgsConstructor
public class RunController {

    private final RunSpecService runSpecService;
    private final RunDockerService runDockerService;
    private final TraefikService traefikService;
    private final JsonStoreService store;

    @GetMapping("/apps/{appId}/run/spec")
    public ResponseEntity<Map<String, Object>> getRunSpec(@PathVariable String appId) {
        return ResponseEntity.ok(Map.of("spec", runSpecService.resolveRunSpec(appId), "source", "default"));
    }

    @PostMapping("/apps/{appId}/run/trigger")
    public ResponseEntity<?> triggerRun(@PathVariable String appId,
                                        @RequestBody RunTriggerRequest input) {
        if (!"start".equals(input.getAction()) && !"stop".equals(input.getAction())) {
            return ResponseEntity.badRequest().body(Map.of("error", "action must be start or stop"));
        }
        runSpecService.writeRunTrigger(appId, input.getAction());
        return ResponseEntity.ok(Map.of("ok", true));
    }

    @GetMapping("/apps/{appId}/run/start-logs")
    public SseEmitter startRunWithLogs(@PathVariable String appId,
                                        @RequestParam(defaultValue = "false") boolean rebuild) {
        SseEmitter emitter = new SseEmitter(600_000L); // 10 min timeout
        String cwd = store.appWorkspace(appId);
        Map<String, Object> spec = runSpecService.resolveRunSpec(appId);

        CompletableFuture.runAsync(() -> {
            try {
                runDockerService.runWithLogging(appId, cwd, spec, rebuild, event -> {
                    try {
                        emitter.send(SseEmitter.event()
                                .name(event.type())
                                .data(Map.of("text", event.text())));
                    } catch (Exception e) {
                        log.debug("SSE send failed for {}: {}", appId, e.getMessage());
                    }
                });
                emitter.complete();
            } catch (Exception e) {
                log.error("Run failed for {}", appId, e);
                emitter.completeWithError(e);
            }
        });

        return emitter;
    }

    @GetMapping("/apps/{appId}/run/stop-logs")
    public SseEmitter stopRunWithLogs(@PathVariable String appId) {
        SseEmitter emitter = new SseEmitter(300_000L);
        String cwd = store.appWorkspace(appId);
        Map<String, Object> spec = runSpecService.resolveRunSpec(appId);

        CompletableFuture.runAsync(() -> {
            try {
                runDockerService.stopWithLogging(appId, cwd, spec, event -> {
                    try {
                        emitter.send(SseEmitter.event()
                                .name(event.type())
                                .data(Map.of("text", event.text())));
                    } catch (Exception e) {
                        log.debug("SSE send failed for {}: {}", appId, e.getMessage());
                    }
                });
                emitter.complete();
            } catch (Exception e) {
                log.error("Stop failed for {}", appId, e);
                emitter.completeWithError(e);
            }
        });

        return emitter;
    }

    @GetMapping("/apps/{appId}/run/status")
    public ResponseEntity<?> getRunStatus(@PathVariable String appId) {
        String cwd = store.appWorkspace(appId);
        var status = runDockerService.getRunStatus(appId, cwd);
        return ResponseEntity.ok(status);
    }

    @PostMapping("/apps/{appId}/run/stop")
    public ResponseEntity<?> stopRun(@PathVariable String appId) {
        String cwd = store.appWorkspace(appId);
        runDockerService.stopRun(appId, cwd);
        return ResponseEntity.ok(Map.of("ok", true));
    }

    @GetMapping("/apps/{appId}/run/preview-url")
    public ResponseEntity<?> getPreviewUrl(@PathVariable String appId) {
        String cwd = store.appWorkspace(appId);
        var status = runDockerService.getRunStatus(appId, cwd);
        String url = (status.url() != null && !status.url().isEmpty())
                ? status.url()
                : traefikService.gatewayUrlFor(appId);
        return ResponseEntity.ok(Map.of("url", url));
    }

    @RequestMapping(value = {"/apps/{appId}/run/preview", "/apps/{appId}/run/preview/**"},
            method = {RequestMethod.GET, RequestMethod.POST, RequestMethod.PUT, RequestMethod.DELETE})
    public ResponseEntity<?> previewProxy(@PathVariable String appId, HttpServletRequest request) {
        String url = traefikService.gatewayUrlFor(appId);
        return ResponseEntity.status(302)
                .header("Location", url)
                .build();
    }

    @GetMapping("/apps/{appId}/compile")
    public SseEmitter compileProject(@PathVariable String appId) {
        SseEmitter emitter = new SseEmitter(300_000L);
        String cwd = store.appWorkspace(appId);

        CompletableFuture.runAsync(() -> {
            try {
                String mvnCmd = System.getProperty("os.name").toLowerCase().contains("win")
                        ? "mvn.cmd" : "mvn";
                ProcessBuilder pb = new ProcessBuilder(mvnCmd, "compile", "-q");
                pb.directory(new java.io.File(cwd));
                pb.redirectErrorStream(true);
                Process p = pb.start();

                emitter.send(SseEmitter.event().name("status")
                        .data(Map.of("text", "compile_started")));

                try (java.io.BufferedReader reader = new java.io.BufferedReader(
                        new java.io.InputStreamReader(p.getInputStream()))) {
                    String line;
                    while ((line = reader.readLine()) != null) {
                        emitter.send(SseEmitter.event().name("log")
                                .data(Map.of("text", line)));
                    }
                }

                int rc = p.waitFor();
                if (rc == 0) {
                    emitter.send(SseEmitter.event().name("status")
                            .data(Map.of("text", "compile_done")));
                } else {
                    emitter.send(SseEmitter.event().name("status")
                            .data(Map.of("text", "compile_failed")));
                    emitter.send(SseEmitter.event().name("error")
                            .data(Map.of("text", "mvn compile 失败 (exit=" + rc + ")")));
                }
                emitter.send(SseEmitter.event().name("status")
                        .data(Map.of("text", "done")));
                emitter.complete();
            } catch (Exception e) {
                log.error("Compile failed for {}", appId, e);
                emitter.completeWithError(e);
            }
        });

        return emitter;
    }
}
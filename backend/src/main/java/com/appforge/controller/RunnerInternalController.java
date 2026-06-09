package com.appforge.controller;

import com.appforge.config.AppForgeProperties;
import com.appforge.model.Task;
import com.appforge.service.JobSpecStore;
import com.appforge.service.TaskEventService;
import com.appforge.store.JsonStoreService;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.Instant;
import java.util.Map;

@Slf4j
@RestController
@RequestMapping("/api/internal/runner")
@RequiredArgsConstructor
public class RunnerInternalController {

    private final AppForgeProperties props;
    private final JobSpecStore jobSpecStore;
    private final TaskEventService taskEventService;
    private final JsonStoreService store;

    private boolean verifyToken(HttpServletRequest request) {
        String token = request.getHeader("X-Runner-Token");
        return props.getRunnerCallbackToken().equals(token);
    }

    @GetMapping("/tasks/{taskId}")
    public ResponseEntity<?> getTaskSpec(@PathVariable String taskId, HttpServletRequest request) {
        if (!verifyToken(request)) {
            return ResponseEntity.status(401).body(Map.of("error", "Unauthorized runner"));
        }

        Map<String, Object> spec = jobSpecStore.get(taskId);
        if (spec == null) {
            return ResponseEntity.notFound().build();
        }

        return ResponseEntity.ok(spec);
    }

    @PostMapping("/events")
    public ResponseEntity<?> receiveEvents(@RequestBody Map<String, Object> body,
                                           HttpServletRequest request) {
        if (!verifyToken(request)) {
            return ResponseEntity.status(401).body(Map.of("error", "Unauthorized runner"));
        }

        String taskId = (String) body.get("taskId");
        String type = (String) body.get("type");
        @SuppressWarnings("unchecked")
        Map<String, Object> payload = (Map<String, Object>) body.get("payload");

        if (taskId == null || type == null) {
            return ResponseEntity.badRequest().body(Map.of("error", "taskId and type are required"));
        }

        taskEventService.pushTaskEvent(taskId, type, payload != null ? payload : Map.of());
        return ResponseEntity.ok(Map.of("ok", true));
    }

    @PostMapping("/finished")
    public ResponseEntity<?> runnerFinished(@RequestBody Map<String, Object> body,
                                            HttpServletRequest request) {
        if (!verifyToken(request)) {
            return ResponseEntity.status(401).body(Map.of("error", "Unauthorized runner"));
        }

        String taskId = (String) body.get("taskId");
        if (taskId == null) {
            return ResponseEntity.badRequest().body(Map.of("error", "taskId is required"));
        }

        jobSpecStore.remove(taskId);

        @SuppressWarnings("unchecked")
        Map<String, Object> result = (Map<String, Object>) body.get("result");
        boolean ok = result != null && Boolean.TRUE.equals(result.get("ok"));

        if (ok) {
            taskEventService.pushTaskEvent(taskId, "task_completed",
                    Map.of("message", "Claude Agent completed"));
            markTask(taskId, "completed");
        } else {
            String error = result != null ? (String) result.getOrDefault("error", "Unknown error") : "Unknown error";
            taskEventService.pushTaskEvent(taskId, "task_failed", Map.of("message", error));
            markTask(taskId, "failed");
        }

        return ResponseEntity.ok(Map.of("ok", true));
    }

    private void markTask(String taskId, String status) {
        String completedAt = ("completed".equals(status) || "failed".equals(status))
                ? Instant.now().toString() : null;
        store.updateTaskStatus(taskId, status, completedAt);
    }
}


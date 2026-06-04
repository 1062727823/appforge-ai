package com.appforge.controller;

import com.appforge.model.AgentRunRequest;
import com.appforge.model.Task;
import com.appforge.service.ClaudeAgentService;
import com.appforge.service.TaskService;
import com.appforge.service.TaskEventService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.util.Map;

@RestController
@RequestMapping("/api")
@RequiredArgsConstructor
public class TaskController {

    private final TaskService taskService;
    private final TaskEventService taskEventService;
    private final ClaudeAgentService claudeAgentService;

    @PostMapping("/apps/{appId}/workspace-sync")
    public ResponseEntity<?> workspaceSync(@PathVariable String appId,
                                           @RequestParam(defaultValue = "false") boolean force) {
        try {
            Task task = taskService.startWorkspaceSync(appId, force);
            if (task == null) {
                return ResponseEntity.ok(Map.of("skipped", true, "status", "skipped"));
            }
            return ResponseEntity.ok(task);
        } catch (IllegalArgumentException e) {
            if (e.getMessage().startsWith("App not found")) {
                return ResponseEntity.notFound().build();
            }
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    @PostMapping("/apps/{appId}/agent-runs")
    public ResponseEntity<?> startAgentRun(@PathVariable String appId,
                                           @Valid @RequestBody AgentRunRequest input) {
        try {
            Task task = claudeAgentService.startAgentRun(appId, input);
            return ResponseEntity.ok(task);
        } catch (IllegalArgumentException e) {
            if (e.getMessage().contains("not found")) {
                return ResponseEntity.notFound().build();
            }
            return ResponseEntity.status(503).body(Map.of("error", e.getMessage()));
        }
    }

    @GetMapping("/tasks/{taskId}/events")
    public SseEmitter taskEvents(@PathVariable String taskId) {
        return taskEventService.registerTaskEventClient(taskId);
    }

    @PostMapping("/apps/{appId}/agent-runs/{taskId}/stop")
    public ResponseEntity<?> stopAgentRun(@PathVariable String appId,
                                          @PathVariable String taskId) {
        claudeAgentService.stopAgentRun(appId, taskId);
        return ResponseEntity.ok(Map.of("ok", true));
    }

    @PostMapping("/apps/{appId}/agent/session/close")
    public ResponseEntity<?> closeAgentSession(@PathVariable String appId) {
        claudeAgentService.closeAgentSession(appId);
        return ResponseEntity.ok(Map.of("ok", true));
    }
}

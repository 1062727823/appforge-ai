package com.appforge.service;

import com.appforge.model.TaskEvent;
import com.appforge.store.JsonStoreService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.io.IOException;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;

@Slf4j
@Service
@RequiredArgsConstructor
public class TaskEventService {

    private final JsonStoreService store;
    private final IdGenerator id;
    private final Map<String, List<SseEmitter>> clients = new ConcurrentHashMap<>();

    public void pushTaskEvent(String taskId, String type, Map<String, Object> payload) {
        TaskEvent event = TaskEvent.builder()
                .id(id.createId("evt"))
                .taskId(taskId)
                .type(type)
                .payload(payload)
                .createdAt(id.now())
                .build();

        store.insertEvent(event);

        // push to SSE clients
        List<SseEmitter> emitters = clients.get(taskId);
        if (emitters != null) {
            for (SseEmitter emitter : emitters) {
                try {
                    emitter.send(SseEmitter.event()
                            .name(type)
                            .data(payload));
                } catch (IOException e) {
                    emitter.completeWithError(e);
                }
            }
        }

        // close clients on terminal events
        if ("task_completed".equals(type) || "task_failed".equals(type)) {
            List<SseEmitter> toClose = clients.remove(taskId);
            if (toClose != null) {
                toClose.forEach(SseEmitter::complete);
            }
        }
    }

    public SseEmitter registerTaskEventClient(String taskId) {
        SseEmitter emitter = new SseEmitter(3600_000L); // 1 hour timeout
        clients.computeIfAbsent(taskId, k -> new CopyOnWriteArrayList<>()).add(emitter);

        emitter.onCompletion(() -> removeClient(taskId, emitter));
        emitter.onTimeout(() -> removeClient(taskId, emitter));
        emitter.onError(e -> removeClient(taskId, emitter));

        // replay existing events from DB
        List<TaskEvent> existing = store.listEventsByTaskId(taskId);
        for (TaskEvent e : existing) {
            try {
                emitter.send(SseEmitter.event()
                        .name(e.getType())
                        .data(e.getPayload()));
            } catch (IOException ex) {
                emitter.completeWithError(ex);
                break;
            }
        }

        return emitter;
    }

    private void removeClient(String taskId, SseEmitter emitter) {
        List<SseEmitter> emitters = clients.get(taskId);
        if (emitters != null) {
            emitters.remove(emitter);
        }
    }
}

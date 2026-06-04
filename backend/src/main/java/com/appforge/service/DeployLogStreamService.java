package com.appforge.service;

import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.io.IOException;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

@Slf4j
@Service
public class DeployLogStreamService {

    private static final int MAX_EVENTS = 5000;

    private final Map<String, List<Map<String, Object>>> eventBuffers = new ConcurrentHashMap<>();
    private final Map<String, List<SseEmitter>> clients = new ConcurrentHashMap<>();

    public void pushDeployLogEvent(String appId, String type, Map<String, Object> payload) {
        Map<String, Object> event = new LinkedHashMap<>();
        event.put("type", type);
        event.put("payload", payload);

        eventBuffers.computeIfAbsent(appId, k -> Collections.synchronizedList(new ArrayList<>()))
                .add(event);

        // Trim buffer
        List<Map<String, Object>> buffer = eventBuffers.get(appId);
        if (buffer.size() > MAX_EVENTS) {
            buffer.subList(0, buffer.size() - MAX_EVENTS).clear();
        }

        // Push to connected clients
        List<SseEmitter> emitters = clients.get(appId);
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

        // Close clients on done event
        if ("done".equals(type)) {
            List<SseEmitter> toClose = clients.remove(appId);
            if (toClose != null) {
                toClose.forEach(SseEmitter::complete);
            }
        }
    }

    public SseEmitter registerDeployLogClient(String appId) {
        SseEmitter emitter = new SseEmitter(3600_000L);
        clients.computeIfAbsent(appId, k -> new ArrayList<>()).add(emitter);

        emitter.onCompletion(() -> removeClient(appId, emitter));
        emitter.onTimeout(() -> removeClient(appId, emitter));
        emitter.onError(e -> removeClient(appId, emitter));

        // Replay buffered events
        List<Map<String, Object>> buffer = eventBuffers.get(appId);
        if (buffer != null) {
            synchronized (buffer) {
                for (Map<String, Object> event : buffer) {
                    try {
                        emitter.send(SseEmitter.event()
                                .name((String) event.get("type"))
                                .data(event.get("payload")));
                    } catch (IOException e) {
                        emitter.completeWithError(e);
                        break;
                    }
                }
            }
        }

        return emitter;
    }

    public void clearLiveEvents(String appId) {
        eventBuffers.remove(appId);
    }

    private void removeClient(String appId, SseEmitter emitter) {
        List<SseEmitter> emitters = clients.get(appId);
        if (emitters != null) {
            emitters.remove(emitter);
        }
    }
}

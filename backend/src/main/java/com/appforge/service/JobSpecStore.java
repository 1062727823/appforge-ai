package com.appforge.service;

import org.springframework.stereotype.Service;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

@Service
public class JobSpecStore {

    private final Map<String, Map<String, Object>> specs = new ConcurrentHashMap<>();

    public void register(String taskId, Map<String, Object> spec) {
        specs.put(taskId, spec);
    }

    public Map<String, Object> get(String taskId) {
        return specs.get(taskId);
    }

    public void remove(String taskId) {
        specs.remove(taskId);
    }
}

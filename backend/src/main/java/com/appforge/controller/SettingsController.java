package com.appforge.controller;

import com.appforge.model.UpdateSettingsRequest;
import com.appforge.service.SettingsService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api")
@RequiredArgsConstructor
public class SettingsController {

    private final SettingsService settingsService;

    @GetMapping("/settings")
    public Map<String, Object> getSettings() {
        return settingsService.getSettings();
    }

    @PutMapping("/settings")
    public ResponseEntity<?> updateSettings(@RequestBody UpdateSettingsRequest input) {
        settingsService.updateSettings(input);
        return ResponseEntity.ok(Map.of("ok", true));
    }
}

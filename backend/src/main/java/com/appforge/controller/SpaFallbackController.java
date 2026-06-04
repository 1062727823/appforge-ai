package com.appforge.controller;

import com.appforge.config.AppForgeProperties;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import java.io.File;

@RestController
@RequiredArgsConstructor
public class SpaFallbackController {

    private final AppForgeProperties props;

    @GetMapping("/{path:[^.]+}")
    public ResponseEntity<Resource> spaFallback(HttpServletRequest request) {
        String path = request.getRequestURI();
        if (path.startsWith("/api/") || path.startsWith("/ide/")) {
            return ResponseEntity.notFound().build();
        }

        String webRoot = props.getWebRoot();
        if (webRoot == null || webRoot.isBlank()) {
            // try default locations
            webRoot = findWebRoot();
        }

        if (webRoot == null) return ResponseEntity.notFound().build();

        File indexFile = new File(webRoot, "index.html");
        if (indexFile.exists()) {
            return ResponseEntity.ok()
                    .contentType(MediaType.TEXT_HTML)
                    .body(new FileSystemResource(indexFile));
        }

        return ResponseEntity.notFound().build();
    }

    private String findWebRoot() {
        String[] candidates = {
                "../web/dist",
                "../../apps/web/dist",
                "apps/web/dist",
                "./web/dist"
        };
        for (String candidate : candidates) {
            File dir = new File(candidate);
            if (dir.isDirectory() && new File(dir, "index.html").exists()) {
                return dir.getAbsolutePath();
            }
        }
        return null;
    }
}

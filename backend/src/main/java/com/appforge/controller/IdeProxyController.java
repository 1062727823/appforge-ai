package com.appforge.controller;

import com.appforge.config.AppForgeProperties;
import com.appforge.model.App;
import com.appforge.service.AppService;
import com.appforge.store.JsonStoreService;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;

import java.net.URI;
import java.util.Map;
import java.util.Optional;

@Slf4j
@RestController
@RequiredArgsConstructor
public class IdeProxyController {

    private final AppForgeProperties props;
    private final JsonStoreService store;
    private final AppService appService;
    private final java.net.http.HttpClient httpClient = java.net.http.HttpClient.newBuilder()
            .version(java.net.http.HttpClient.Version.HTTP_1_1)
            .followRedirects(java.net.http.HttpClient.Redirect.NORMAL)
            .build();

    @GetMapping("/api/apps/{appId}/ide")
    public ResponseEntity<?> getIdeUrl(@PathVariable String appId) {
        Optional<App> appOpt = appService.findApp(appId);
        if (appOpt.isEmpty()) {
            return ResponseEntity.notFound().build();
        }

        String codeServerUrl = props.getCodeServerUrl();
        if (codeServerUrl == null || codeServerUrl.isBlank()) {
            return ResponseEntity.status(503).body(Map.of("error", "CODE_SERVER_URL is not configured"));
        }

        // Container-side path: code-server mounts at /data/appforge/workspaces
        String folder = "/data/appforge/workspaces/" + appId + "/repo";
        String directUrl = codeServerUrl + "/?folder=" + java.net.URLEncoder.encode(folder, java.nio.charset.StandardCharsets.UTF_8);
        return ResponseEntity.ok(Map.of(
                "folder", folder,
                "url", directUrl
        ));
    }

    @RequestMapping(value = {"/ide", "/ide/**"},
            method = {RequestMethod.GET, RequestMethod.POST, RequestMethod.PUT, RequestMethod.DELETE, RequestMethod.PATCH})
    public ResponseEntity<?> ideProxy(HttpServletRequest request) {
        String codeServerUrl = props.getCodeServerUrl();
        if (codeServerUrl == null || codeServerUrl.isBlank()) {
            return ResponseEntity.status(503).body(Map.of("error", "CODE_SERVER_URL is not configured"));
        }

        String path = request.getRequestURI().replaceFirst("^/ide", "");
        String query = request.getQueryString();
        String targetUrl = codeServerUrl.replaceAll("/$", "") + "/" + path.replaceAll("^/", "");
        if (query != null) targetUrl += "?" + query;

        try {
            java.net.http.HttpRequest.Builder reqBuilder = java.net.http.HttpRequest.newBuilder()
                    .uri(URI.create(targetUrl));

            // forward only safe headers
            var headerNames = request.getHeaderNames();
            while (headerNames.hasMoreElements()) {
                String name = headerNames.nextElement();
                String lower = name.toLowerCase(java.util.Locale.ROOT);
                if (lower.startsWith("sec-") || lower.equals("host") || lower.equals("connection")
                        || lower.equals("upgrade") || lower.equals("origin") || lower.equals("referer")
                        || lower.equals("accept-encoding")) {
                    continue;
                }
                var values = request.getHeaders(name);
                while (values.hasMoreElements()) {
                    reqBuilder.header(name, values.nextElement());
                }
            }

            // copy body if present
            if (request.getContentLengthLong() > 0) {
                byte[] body = request.getInputStream().readAllBytes();
                reqBuilder.method(request.getMethod(), java.net.http.HttpRequest.BodyPublishers.ofByteArray(body));
            } else {
                reqBuilder.method(request.getMethod(), java.net.http.HttpRequest.BodyPublishers.noBody());
            }

            java.net.http.HttpResponse<byte[]> response = httpClient.send(reqBuilder.build(),
                    java.net.http.HttpResponse.BodyHandlers.ofByteArray());

            HttpHeaders headers = new HttpHeaders();
            response.headers().map().forEach((k, v) -> {
                if (!k.equalsIgnoreCase("transfer-encoding")) {
                    headers.addAll(k, v);
                }
            });

            return ResponseEntity.status(response.statusCode())
                    .headers(headers)
                    .body(response.body());

        } catch (Exception e) {
            log.error("IDE proxy error: {}", e.getMessage());
            return ResponseEntity.status(502).body(Map.of("error", "Proxy error: " + e.getMessage()));
        }
    }
}

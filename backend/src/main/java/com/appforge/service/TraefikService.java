package com.appforge.service;

import com.appforge.config.AppForgeProperties;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.LinkedHashMap;
import java.util.Map;

@Service
@RequiredArgsConstructor
public class TraefikService {

    private final AppForgeProperties props;

    public static final String RUNTIME_NETWORK = "appforge-runtime";
    public static final String TRAEFIK_ENTRYPOINT = "web";
    public static final String TRAEFIK_DEPLOY_ENTRYPOINT = "deploy";

    public String gatewayPathFor(String appId) {
        return "/app/" + appId + "/";
    }

    public String gatewayUrlFor(String appId) {
        return props.getGatewayPublicUrl().replaceAll("/$", "") + "/app/" + appId + "/";
    }

    public String deployPathFor(String appId) {
        return "/deploy/" + appId + "/";
    }

    public String deployUrlFor(String appId) {
        return props.getDeployGatewayPublicUrl().replaceAll("/$", "") + "/deploy/" + appId + "/";
    }

    public String traefikRouterName(String appId) {
        return "appforge-" + appId + "-app";
    }

    public String deployRouterName(String appId) {
        return "appforge-" + appId + "-deploy";
    }

    public Map<String, Object> buildTraefikLabels(String appId, int port, boolean stripPrefix) {
        Map<String, Object> labels = new LinkedHashMap<>();
        labels.put("traefik.enable", "true");
        labels.put("traefik.http.routers." + traefikRouterName(appId) + ".rule",
                "PathPrefix(`" + gatewayPathFor(appId) + "`)");
        labels.put("traefik.http.routers." + traefikRouterName(appId) + ".entrypoints", TRAEFIK_ENTRYPOINT);
        labels.put("traefik.http.services." + traefikRouterName(appId) + ".loadbalancer.server.port", String.valueOf(port));

        if (stripPrefix) {
            labels.put("traefik.http.middlewares." + traefikRouterName(appId) + "-strip.stripprefix.prefixes",
                    gatewayPathFor(appId));
            labels.put("traefik.http.routers." + traefikRouterName(appId) + ".middlewares",
                    traefikRouterName(appId) + "-strip");
        }

        return labels;
    }

    public String formatTraefikLabelsYaml(String appId, int port, boolean stripPrefix) {
        StringBuilder sb = new StringBuilder();
        Map<String, Object> labels = buildTraefikLabels(appId, port, stripPrefix);
        sb.append("    labels:\n");
        for (var entry : labels.entrySet()) {
            sb.append("      - \"").append(entry.getKey()).append("=").append(entry.getValue()).append("\"\n");
        }
        return sb.toString();
    }

    public String formatDeployTraefikLabelsYaml(String appId, int port, boolean stripPrefix) {
        StringBuilder sb = new StringBuilder();
        sb.append("    labels:\n");
        sb.append("      - \"traefik.enable=true\"\n");
        sb.append("      - \"traefik.http.routers.").append(deployRouterName(appId)).append(".rule=PathPrefix(`")
                .append(deployPathFor(appId)).append("`)").append("\"\n");
        sb.append("      - \"traefik.http.routers.").append(deployRouterName(appId)).append(".entrypoints=")
                .append(TRAEFIK_DEPLOY_ENTRYPOINT).append("\"\n");
        sb.append("      - \"traefik.http.services.").append(deployRouterName(appId))
                .append(".loadbalancer.server.port=").append(port).append("\"\n");
        if (stripPrefix) {
            sb.append("      - \"traefik.http.middlewares.").append(deployRouterName(appId))
                    .append("-strip.stripprefix.prefixes=").append(deployPathFor(appId)).append("\"\n");
            sb.append("      - \"traefik.http.routers.").append(deployRouterName(appId))
                    .append(".middlewares=").append(deployRouterName(appId)).append("-strip\"\n");
        }
        return sb.toString();
    }

    public String runtimeNetworkBlock() {
        return "    networks:\n" +
                "      - " + RUNTIME_NETWORK + "\n" +
                "\n" +
                "networks:\n" +
                "  " + RUNTIME_NETWORK + ":\n" +
                "    external: true\n" +
                "    name: " + RUNTIME_NETWORK + "\n";
    }
}

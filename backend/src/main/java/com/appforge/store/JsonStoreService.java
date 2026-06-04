package com.appforge.store;

import com.appforge.config.AppForgeProperties;
import com.appforge.model.*;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.annotation.PostConstruct;
import lombok.Getter;
import lombok.extern.slf4j.Slf4j;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Service;

import java.util.*;
import java.util.stream.Collectors;

@Slf4j
@Service
public class JsonStoreService {

    private final AppForgeProperties props;
    private final JdbcTemplate db;
    private final ObjectMapper mapper;

    @Getter
    private AppState state;

    private static final TypeReference<List<Map<String, String>>> LIST_MAP_STR_TYPE =
            new TypeReference<>() {};
    private static final TypeReference<Map<String, Object>> MAP_OBJ_TYPE =
            new TypeReference<>() {};

    public JsonStoreService(AppForgeProperties props, JdbcTemplate db) {
        this.props = props;
        this.db = db;
        this.mapper = new ObjectMapper();
    }

    @PostConstruct
    public void ensureStore() {
        loadState();
        log.info("Store initialized (H2), apps={} tasks={} events={}",
                state.getApps().size(), state.getTasks().size(), state.getEvents().size());
    }

    private void loadState() {
        List<App> apps = db.query("SELECT * FROM apps", APP_MAPPER);
        List<Task> tasks = db.query("SELECT * FROM tasks", TASK_MAPPER);
        List<TaskEvent> events = db.query("SELECT * FROM task_events", EVENT_MAPPER);
        List<DeployAppEntry> deploys = db.query("SELECT * FROM deploy_apps", DEPLOY_MAPPER);

        List<Map<String, String>> teams = listMapFromDb("teams");
        List<Map<String, String>> visibilityOptions = listMapFromDb("visibilityOptions");
        List<Map<String, String>> deployMethods = listMapFromDb("deployMethods");
        Map<String, Object> settings = mapFromDb();

        this.state = AppState.builder()
                .apps(new ArrayList<>(apps))
                .tasks(new ArrayList<>(tasks))
                .events(new ArrayList<>(events))
                .deployApps(new ArrayList<>(deploys))
                .teams(teams)
                .visibilityOptions(visibilityOptions)
                .deployMethods(deployMethods)
                .settings(settings)
                .build();
    }

    private List<Map<String, String>> listMapFromDb(String key) {
        List<String> rows = db.query(
                "SELECT config_value FROM platform_config WHERE config_key = ?",
                (rs, rowNum) -> rs.getString("config_value"), key);
        if (rows.isEmpty()) return new ArrayList<>();
        try {
            return mapper.readValue(rows.get(0), LIST_MAP_STR_TYPE);
        } catch (JsonProcessingException e) {
            return new ArrayList<>();
        }
    }

    private Map<String, Object> mapFromDb() {
        List<Map<String, Object>> rows = db.query(
                "SELECT setting_key, setting_value FROM settings",
                (rs, rowNum) -> Map.of(
                        "key", (Object) rs.getString("setting_key"),
                        "value", (Object) rs.getString("setting_value")));
        Map<String, Object> result = new LinkedHashMap<>();
        for (var row : rows) {
            result.put((String) row.get("key"), row.get("value"));
        }
        return result;
    }

    public void saveStore() {
        // Persist all mutable state to H2
        db.update("DELETE FROM apps");
        for (App a : state.getApps()) {
            db.update("INSERT INTO apps VALUES (?,?,?,?,?,?,?,?,?,?,?)",
                    a.getId(), a.getName(), a.getSlug(),
                    a.getDescription() != null ? a.getDescription() : "",
                    a.getRepoUrl() != null ? a.getRepoUrl() : "",
                    a.getTeamName() != null ? a.getTeamName() : "Default",
                    a.getVisibility() != null ? a.getVisibility() : "private",
                    a.getDeployMethod() != null ? a.getDeployMethod() : "docker",
                    a.getStatus() != null ? a.getStatus() : "ready",
                    a.getCreatedAt(), a.getUpdatedAt());
        }

        db.update("DELETE FROM tasks");
        for (Task t : state.getTasks()) {
            db.update("INSERT INTO tasks VALUES (?,?,?,?,?,?,?)",
                    t.getId(), t.getAppId(), t.getType(), t.getStatus(),
                    t.getPrompt() != null ? t.getPrompt() : "",
                    t.getCreatedAt(), t.getCompletedAt());
        }

        db.update("DELETE FROM task_events");
        for (TaskEvent e : state.getEvents()) {
            db.update("INSERT INTO task_events VALUES (?,?,?,?,?)",
                    e.getId(), e.getTaskId(), e.getType(),
                    toJson(e.getPayload()), e.getCreatedAt());
        }

        db.update("DELETE FROM deploy_apps");
        for (DeployAppEntry d : state.getDeployApps()) {
            db.update("INSERT INTO deploy_apps VALUES (?,?,?,?,?,?,?)",
                    d.getAppId(), d.getName(), d.getSlug(),
                    d.getTeamName() != null ? d.getTeamName() : "Default",
                    d.getDeployMethod() != null ? d.getDeployMethod() : "docker",
                    d.getStatus() != null ? d.getStatus() : "deploying",
                    d.getAddedAt());
        }

        if (state.getTeams() != null) {
            upsertConfig("teams", toJson(state.getTeams()));
        }
        if (state.getVisibilityOptions() != null) {
            upsertConfig("visibilityOptions", toJson(state.getVisibilityOptions()));
        }
        if (state.getDeployMethods() != null) {
            upsertConfig("deployMethods", toJson(state.getDeployMethods()));
        }

        if (state.getSettings() != null) {
            db.update("DELETE FROM settings");
            for (var entry : state.getSettings().entrySet()) {
                db.update("INSERT INTO settings VALUES (?,?)",
                        entry.getKey(), String.valueOf(entry.getValue()));
            }
        }
    }

    private void upsertConfig(String key, String value) {
        int updated = db.update(
                "UPDATE platform_config SET config_value = ? WHERE config_key = ?",
                value, key);
        if (updated == 0) {
            db.update("INSERT INTO platform_config VALUES (?,?)", key, value);
        }
    }

    private String toJson(Object obj) {
        try {
            return mapper.writeValueAsString(obj != null ? obj : "{}");
        } catch (JsonProcessingException e) {
            return "{}";
        }
    }

    // Keep lock API as no-ops for backward compatibility (H2 handles concurrency)
    public void readLock() {}
    public void readUnlock() {}
    public void writeLock() {}
    public void writeUnlock() {}

    public String appWorkspace(String appId) {
        return props.getAppWorkspace(appId);
    }

    // Row mappers
    private static final RowMapper<App> APP_MAPPER = (rs, rowNum) -> App.builder()
            .id(rs.getString("id"))
            .name(rs.getString("name"))
            .slug(rs.getString("slug"))
            .description(rs.getString("description"))
            .repoUrl(rs.getString("repo_url"))
            .teamName(rs.getString("team_name"))
            .visibility(rs.getString("visibility"))
            .deployMethod(rs.getString("deploy_method"))
            .status(rs.getString("status"))
            .createdAt(rs.getString("created_at"))
            .updatedAt(rs.getString("updated_at"))
            .build();

    private static final RowMapper<Task> TASK_MAPPER = (rs, rowNum) -> Task.builder()
            .id(rs.getString("id"))
            .appId(rs.getString("app_id"))
            .type(rs.getString("type"))
            .status(rs.getString("status"))
            .prompt(rs.getString("prompt"))
            .createdAt(rs.getString("created_at"))
            .completedAt(rs.getString("completed_at"))
            .build();

    private static final RowMapper<TaskEvent> EVENT_MAPPER = (rs, rowNum) -> {
        String payloadJson = rs.getString("payload");
        Map<String, Object> payload = new LinkedHashMap<>();
        if (payloadJson != null && !payloadJson.isEmpty() && !"{}".equals(payloadJson)) {
            try {
                payload = new ObjectMapper().readValue(payloadJson,
                        new TypeReference<LinkedHashMap<String, Object>>() {});
            } catch (JsonProcessingException ignored) {}
        }
        return TaskEvent.builder()
                .id(rs.getString("id"))
                .taskId(rs.getString("task_id"))
                .type(rs.getString("type"))
                .payload(payload)
                .createdAt(rs.getString("created_at"))
                .build();
    };

    private static final RowMapper<DeployAppEntry> DEPLOY_MAPPER = (rs, rowNum) -> DeployAppEntry.builder()
            .appId(rs.getString("app_id"))
            .name(rs.getString("name"))
            .slug(rs.getString("slug"))
            .teamName(rs.getString("team_name"))
            .deployMethod(rs.getString("deploy_method"))
            .status(rs.getString("status"))
            .addedAt(rs.getString("added_at"))
            .build();
}

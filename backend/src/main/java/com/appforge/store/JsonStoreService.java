package com.appforge.store;

import com.appforge.config.AppForgeProperties;
import com.appforge.model.*;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.annotation.PostConstruct;
import lombok.extern.slf4j.Slf4j;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Service;

import java.util.*;

/**
 * H2-backed persistence. Every read goes directly to H2 (no in-memory state mirror).
 * Write methods issue targeted INSERT / UPDATE / DELETE.
 */
@Slf4j
@Service
public class JsonStoreService {

    private final AppForgeProperties props;
    private final JdbcTemplate db;
    private final ObjectMapper mapper;

    private static final TypeReference<LinkedHashMap<String, Object>> PAYLOAD_TYPE =
            new TypeReference<>() {};

    public JsonStoreService(AppForgeProperties props, JdbcTemplate db) {
        this.props = props;
        this.db = db;
        this.mapper = new ObjectMapper();
    }

    @PostConstruct
    public void ensureStore() {
        log.info("Store initialized (H2 direct access)");
    }

    // ── workspace path (not DB) ──────────────────────────────────────

    public String appWorkspace(String appId) {
        return props.getAppWorkspace(appId);
    }

    // ==================================================================
    //  Apps
    // ==================================================================

    public List<App> listApps() {
        return db.query("SELECT * FROM apps ORDER BY created_at DESC", APP_MAPPER);
    }

    public Optional<App> findApp(String appId) {
        List<App> list = db.query("SELECT * FROM apps WHERE id = ?", APP_MAPPER, appId);
        return list.isEmpty() ? Optional.empty() : Optional.of(list.get(0));
    }

    public void insertApp(App app) {
        db.update(
                "INSERT INTO apps (id,name,slug,description,repo_url,team_name,visibility,deploy_method,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
                app.getId(), app.getName(), app.getSlug(),
                nullToEmpty(app.getDescription()), nullToEmpty(app.getRepoUrl()),
                nullToEmpty(app.getTeamName()), nullToEmpty(app.getVisibility(), "private"),
                nullToEmpty(app.getDeployMethod(), "docker"), nullToEmpty(app.getStatus(), "ready"),
                app.getCreatedAt(), app.getUpdatedAt());
    }

    public int updateApp(App app) {
        return db.update(
                "UPDATE apps SET name=?, slug=?, description=?, repo_url=?, team_name=?, visibility=?, deploy_method=?, status=?, updated_at=? WHERE id=?",
                app.getName(), app.getSlug(),
                nullToEmpty(app.getDescription()), nullToEmpty(app.getRepoUrl()),
                nullToEmpty(app.getTeamName()), nullToEmpty(app.getVisibility(), "private"),
                nullToEmpty(app.getDeployMethod(), "docker"), nullToEmpty(app.getStatus(), "ready"),
                app.getUpdatedAt(), app.getId());
    }

    public int deleteApp(String appId) {
        return db.update("DELETE FROM apps WHERE id = ?", appId);
    }

    // ==================================================================
    //  Tasks
    // ==================================================================

    public List<Task> listTasks() {
        return db.query("SELECT * FROM tasks ORDER BY created_at DESC", TASK_MAPPER);
    }

    public List<Task> listTasksByAppId(String appId) {
        return db.query("SELECT * FROM tasks WHERE app_id = ? ORDER BY created_at DESC", TASK_MAPPER, appId);
    }

    public Optional<Task> findTask(String taskId) {
        List<Task> list = db.query("SELECT * FROM tasks WHERE id = ?", TASK_MAPPER, taskId);
        return list.isEmpty() ? Optional.empty() : Optional.of(list.get(0));
    }

    public void insertTask(Task task) {
        db.update(
                "INSERT INTO tasks (id,app_id,type,status,prompt,created_at,completed_at) VALUES (?,?,?,?,?,?,?)",
                task.getId(), task.getAppId(), task.getType(), task.getStatus(),
                nullToEmpty(task.getPrompt()), task.getCreatedAt(), task.getCompletedAt());
    }

    public int updateTaskStatus(String taskId, String status, String completedAt) {
        return db.update("UPDATE tasks SET status=?, completed_at=? WHERE id=?", status, completedAt, taskId);
    }

    public int deleteTask(String taskId) {
        return db.update("DELETE FROM tasks WHERE id = ?", taskId);
    }

    public int deleteTasksByAppId(String appId) {
        return db.update("DELETE FROM tasks WHERE app_id = ?", appId);
    }

    // ==================================================================
    //  TaskEvents
    // ==================================================================

    public List<TaskEvent> listEvents() {
        return db.query("SELECT * FROM task_events ORDER BY created_at ASC", EVENT_MAPPER);
    }

    public List<TaskEvent> listEventsByTaskId(String taskId) {
        return db.query("SELECT * FROM task_events WHERE task_id = ? ORDER BY created_at ASC", EVENT_MAPPER, taskId);
    }

    public void insertEvent(TaskEvent event) {
        db.update("INSERT INTO task_events (id,task_id,type,payload,created_at) VALUES (?,?,?,?,?)",
                event.getId(), event.getTaskId(), event.getType(),
                toJson(event.getPayload()), event.getCreatedAt());
    }

    public int deleteEventsByTaskId(String taskId) {
        return db.update("DELETE FROM task_events WHERE task_id = ?", taskId);
    }

    // ==================================================================
    //  DeployApps
    // ==================================================================

    public List<DeployAppEntry> listDeployApps() {
        return db.query("SELECT * FROM deploy_apps ORDER BY added_at DESC", DEPLOY_MAPPER);
    }

    public void insertDeployApp(DeployAppEntry entry) {
        db.update(
                "INSERT INTO deploy_apps (app_id,name,slug,team_name,deploy_method,status,added_at) VALUES (?,?,?,?,?,?,?)",
                entry.getAppId(), entry.getName(), entry.getSlug(),
                nullToEmpty(entry.getTeamName(), "Default"),
                nullToEmpty(entry.getDeployMethod(), "docker"),
                nullToEmpty(entry.getStatus(), "pending"),
                entry.getAddedAt());
    }

    public int deleteDeployApp(String appId) {
        return db.update("DELETE FROM deploy_apps WHERE app_id = ?", appId);
    }

    // ==================================================================
    //  Settings
    // ==================================================================

    public Map<String, Object> loadSettings() {
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

    public void saveSetting(String key, String value) {
        int updated = db.update("UPDATE settings SET setting_value = ? WHERE setting_key = ?", value, key);
        if (updated == 0) {
            db.update("INSERT INTO settings (setting_key, setting_value) VALUES (?,?)", key, value);
        }
    }

    public int clearSettings() {
        return db.update("DELETE FROM settings");
    }

    // ==================================================================
    //  helpers
    // ==================================================================

    private String nullToEmpty(String s) {
        return s == null ? "" : s;
    }

    private String nullToEmpty(String s, String defaultVal) {
        return s == null || s.isBlank() ? defaultVal : s;
    }

    private String toJson(Object obj) {
        try {
            return mapper.writeValueAsString(obj != null ? obj : "{}");
        } catch (JsonProcessingException e) {
            return "{}";
        }
    }

    // ==================================================================
    //  RowMappers
    // ==================================================================

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

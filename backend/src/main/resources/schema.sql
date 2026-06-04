CREATE TABLE IF NOT EXISTS apps (
    id            VARCHAR(64) PRIMARY KEY,
    name          VARCHAR(255) NOT NULL,
    slug          VARCHAR(255) NOT NULL,
    description   TEXT DEFAULT '',
    repo_url      VARCHAR(512) DEFAULT '',
    team_name     VARCHAR(100) DEFAULT 'Default',
    visibility    VARCHAR(20) DEFAULT 'private',
    deploy_method VARCHAR(20) DEFAULT 'docker',
    status        VARCHAR(20) DEFAULT 'ready',
    created_at    VARCHAR(64) NOT NULL,
    updated_at    VARCHAR(64) NOT NULL
);

CREATE TABLE IF NOT EXISTS tasks (
    id           VARCHAR(64) PRIMARY KEY,
    app_id       VARCHAR(64) NOT NULL,
    type         VARCHAR(32) NOT NULL,
    status       VARCHAR(20) NOT NULL DEFAULT 'pending',
    prompt       TEXT DEFAULT '',
    created_at   VARCHAR(64) NOT NULL,
    completed_at VARCHAR(64) NULL,
    FOREIGN KEY (app_id) REFERENCES apps(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_tasks_app_id ON tasks(app_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);

CREATE TABLE IF NOT EXISTS task_events (
    id         VARCHAR(64) PRIMARY KEY,
    task_id    VARCHAR(64) NOT NULL,
    type       VARCHAR(32) NOT NULL,
    payload    TEXT DEFAULT '{}',
    created_at VARCHAR(64) NOT NULL,
    FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_events_task_id ON task_events(task_id);

CREATE TABLE IF NOT EXISTS deploy_apps (
    app_id        VARCHAR(64) PRIMARY KEY,
    name          VARCHAR(255) NOT NULL,
    slug          VARCHAR(255) NOT NULL,
    team_name     VARCHAR(100) DEFAULT 'Default',
    deploy_method VARCHAR(20) DEFAULT 'docker',
    status        VARCHAR(20) DEFAULT 'deploying',
    added_at      VARCHAR(64) NOT NULL
);

CREATE TABLE IF NOT EXISTS platform_config (
    config_key   VARCHAR(64) PRIMARY KEY,
    config_value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
    setting_key   VARCHAR(64) PRIMARY KEY,
    setting_value TEXT NOT NULL
);

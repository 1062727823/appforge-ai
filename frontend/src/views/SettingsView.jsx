import { useEffect, useState } from "react";
import { getSettings, updateSettings } from "../lib/api.js";
import "./settings-view.css";

function SecretField({ configured, hint, label, masked, onChange, placeholder, value }) {
  return (
    <label className="settings-field">
      <span className="settings-field-label">{label}</span>
      <input
        autoComplete="off"
        onChange={(event) => onChange(event.target.value)}
        placeholder={configured ? `已配置 ${masked}` : placeholder}
        type="password"
        value={value}
      />
      <span className="settings-field-hint">{hint}</span>
    </label>
  );
}

export function SettingsView({ active }) {
  const [settings, setSettings] = useState(null);
  const [form, setForm] = useState({
    appDeployGatewayPublicUrl: "",
    appGatewayPublicUrl: "",
    cursorApiKey: "",
    cursorModel: "",
    gitlabBaseUrl: "",
    gitlabInternalUrl: "",
    gitlabToken: "",
  });
  const [status, setStatus] = useState({ message: "", type: "info" });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!active) return;
    getSettings()
      .then((payload) => {
        setSettings(payload);
        setForm({
          appDeployGatewayPublicUrl: payload.gateway?.deployUrl || "",
          appGatewayPublicUrl: payload.gateway?.previewUrl || "",
          cursorApiKey: "",
          cursorModel: payload.cursor?.model || "",
          gitlabBaseUrl: payload.gitlab?.baseUrl || "",
          gitlabInternalUrl: payload.gitlab?.internalBaseUrl || "",
          gitlabToken: "",
        });
      })
      .catch((error) => setStatus({ message: error.message, type: "error" }));
  }, [active]);

  function updateField(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function handleSave() {
    setSaving(true);
    setStatus({ message: "正在保存配置…", type: "info" });

    try {
      const payload = await updateSettings({
        appDeployGatewayPublicUrl: form.appDeployGatewayPublicUrl.trim(),
        appGatewayPublicUrl: form.appGatewayPublicUrl.trim(),
        cursorModel: form.cursorModel.trim(),
        gitlabBaseUrl: form.gitlabBaseUrl.trim(),
        gitlabInternalUrl: form.gitlabInternalUrl.trim(),
        ...(form.cursorApiKey.trim() ? { cursorApiKey: form.cursorApiKey.trim() } : {}),
        ...(form.gitlabToken.trim() ? { gitlabToken: form.gitlabToken.trim() } : {}),
      });
      setSettings(payload);
      setForm((current) => ({
        ...current,
        cursorApiKey: "",
        gitlabToken: "",
      }));
      setStatus({ message: "配置已保存。", type: "info" });
    } catch (error) {
      setStatus({ message: error.message || "保存失败", type: "error" });
    } finally {
      setSaving(false);
    }
  }

  if (!settings) {
    return (
      <section className={`view${active ? " active" : ""}`} id="settingsView">
        <div className="settings-page">
          <p className="settings-loading">加载配置中…</p>
        </div>
      </section>
    );
  }

  return (
    <section className={`view${active ? " active" : ""}`} id="settingsView">
      <div className="settings-page">
        <header className="settings-header">
          <div>
            <h2>平台设置</h2>
            <p>管理 GitLab 集成、Cursor Agent 与网关地址。留空密钥字段将保留现有值。</p>
          </div>
          <button className="primary-btn" disabled={saving} onClick={handleSave} type="button">
            {saving ? "保存中…" : "保存设置"}
          </button>
        </header>

        {status.message ? (
          <div className={`settings-status${status.type === "error" ? " error" : ""}`}>{status.message}</div>
        ) : null}

        <div className="settings-grid">
          <article className="settings-section">
            <h3>GitLab 集成</h3>
            <p>创建应用时可关联 GitLab 仓库；Token 用于 clone 私有仓库。</p>

            <label className="settings-field">
              <span className="settings-field-label">GitLab 实例地址</span>
              <input
                onChange={(event) => updateField("gitlabBaseUrl", event.target.value)}
                placeholder="https://gitlab.com"
                value={form.gitlabBaseUrl}
              />
              <span className="settings-field-hint">
                示例仓库：{settings.gitlab?.exampleRepoUrl || "https://gitlab.com/acme/sales-crm"}
              </span>
            </label>

            <label className="settings-field">
              <span className="settings-field-label">GitLab 内部访问地址（可选）</span>
              <input
                onChange={(event) => updateField("gitlabInternalUrl", event.target.value)}
                placeholder="http://host.docker.internal:8929"
                value={form.gitlabInternalUrl}
              />
              <span className="settings-field-hint">
                API 在 Docker 内 clone 时使用。留空且实例为 localhost 时，会自动改写为
                host.docker.internal。
              </span>
            </label>

            <SecretField
              configured={settings.gitlab?.tokenConfigured}
              hint="Personal Access Token，需具备 read_repository 权限。"
              label="GitLab Token"
              masked={settings.gitlab?.tokenMasked}
              onChange={(value) => updateField("gitlabToken", value)}
              placeholder="glpat-xxxxxxxx"
              value={form.gitlabToken}
            />
          </article>

          <article className="settings-section">
            <h3>Cursor Agent</h3>
            <p>Agent 生成代码与任务执行所需的 Cursor 凭据。</p>

            <SecretField
              configured={settings.cursor?.apiKeyConfigured}
              hint="在 Cursor 控制台创建 API Key；修改后 Agent 任务会使用新 Key。"
              label="Cursor API Key"
              masked={settings.cursor?.apiKeyMasked}
              onChange={(value) => updateField("cursorApiKey", value)}
              placeholder="key_xxxxxxxx"
              value={form.cursorApiKey}
            />

            <label className="settings-field">
              <span className="settings-field-label">默认模型</span>
              <input
                onChange={(event) => updateField("cursorModel", event.target.value)}
                placeholder="composer-latest"
                value={form.cursorModel}
              />
            </label>
          </article>

          <article className="settings-section">
            <h3>网关地址</h3>
            <p>开发预览与生产部署对外访问地址，用于编辑器预览与部署卡片展示。</p>

            <label className="settings-field">
              <span className="settings-field-label">开发预览网关</span>
              <input
                onChange={(event) => updateField("appGatewayPublicUrl", event.target.value)}
                placeholder="http://127.0.0.1:8088"
                value={form.appGatewayPublicUrl}
              />
            </label>

            <label className="settings-field">
              <span className="settings-field-label">生产部署网关</span>
              <input
                onChange={(event) => updateField("appDeployGatewayPublicUrl", event.target.value)}
                placeholder="http://127.0.0.1:8089"
                value={form.appDeployGatewayPublicUrl}
              />
            </label>
          </article>
        </div>

        <footer className="settings-meta">
          <span>
            {settings.meta?.persistence === "env_file_and_store"
              ? `配置会写入 ${settings.meta?.envFilePath} 并同步到平台存储。`
              : settings.meta?.envFilePath
                ? `.env 为只读挂载，配置会保存到平台存储并在当前进程立即生效。`
                : "配置会保存到平台存储并在当前进程立即生效。"}
          </span>
        </footer>
      </div>
    </section>
  );
}

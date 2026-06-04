import { useEffect, useState } from "react";
import { GITLAB_REPO_URL_ERROR, isValidGitLabRepoUrl } from "@appforge/shared/gitlab.js";
import { getCreateOptions, updateApp } from "../lib/api.js";

function buildForm(app) {
  return {
    description: app?.description || "",
    name: app?.name || "",
    repoUrl: app?.repoUrl || "",
    teamName: app?.teamName || "",
    visibility: app?.visibility || "team",
  };
}

export function AppEditModal({ app, onClose, onSaved, open }) {
  const [form, setForm] = useState(buildForm(app));
  const [options, setOptions] = useState({
    gitlab: { exampleRepoUrl: "" },
    teams: [],
    visibilityOptions: [],
  });
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm(buildForm(app));
    setError("");
    setFieldErrors({});
    getCreateOptions()
      .then((payload) => {
        setOptions(payload);
        setForm((current) => ({
          ...current,
          teamName: current.teamName || payload.teams?.[0]?.name || "",
          visibility: current.visibility || payload.visibilityOptions?.[0]?.value || "team",
        }));
      })
      .catch(() => {});
  }, [app, open]);

  if (!open || !app) return null;

  function updateField(key, value) {
    setForm((current) => ({ ...current, [key]: value }));
    if (fieldErrors[key]) {
      setFieldErrors((current) => {
        const next = { ...current };
        delete next[key];
        return next;
      });
    }
  }

  function validateForm() {
    const nextErrors = {};
    const name = form.name.trim();
    const repoUrl = form.repoUrl.trim();

    if (!name) nextErrors.name = "应用名称不能为空";
    if (
      repoUrl &&
      !isValidGitLabRepoUrl(repoUrl, {
        baseUrl: options.gitlab?.baseUrl,
        hosts: options.gitlab?.hosts,
      })
    ) {
      nextErrors.repoUrl = GITLAB_REPO_URL_ERROR;
    }

    setFieldErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");

    if (!validateForm()) return;

    const name = form.name.trim();
    const repoUrl = form.repoUrl.trim();

    setSaving(true);
    try {
      await updateApp(app.id, {
        description: form.description.trim(),
        name,
        repoUrl,
        teamName: form.teamName.trim(),
        visibility: form.visibility,
      });
      await onSaved?.();
      onClose();
    } catch (submitError) {
      setError(submitError.message || "保存失败");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      aria-labelledby="app-edit-title"
      aria-modal="true"
      className="app-edit-overlay"
      onClick={onClose}
      role="dialog"
    >
      <form
        className="app-edit-modal panel"
        onClick={(event) => event.stopPropagation()}
        onSubmit={handleSubmit}
      >
        <div className="app-edit-head">
          <div>
            <h3 id="app-edit-title">编辑基础信息</h3>
            <p>修改应用名称、团队、描述与 GitLab 仓库地址。</p>
          </div>
          <button aria-label="关闭" className="ghost-btn app-edit-close" onClick={onClose} type="button">
            ×
          </button>
        </div>

        <div className="app-edit-grid">
          <label className="app-edit-field">
            <span>应用名称</span>
            <input
              className={fieldErrors.name ? "has-error" : undefined}
              onChange={(event) => updateField("name", event.target.value)}
              required
              value={form.name}
            />
            {fieldErrors.name ? (
              <small className="app-edit-field-error">{fieldErrors.name}</small>
            ) : null}
          </label>

          <label className="app-edit-field">
            <span>应用标识</span>
            <input disabled readOnly value={app.slug} />
          </label>

          <label className="app-edit-field">
            <span>团队</span>
            <select
              onChange={(event) => updateField("teamName", event.target.value)}
              value={form.teamName}
            >
              {options.teams.map((team) => (
                <option key={team.id || team.name} value={team.name}>
                  {team.name}
                </option>
              ))}
            </select>
          </label>

          <label className="app-edit-field">
            <span>可见性</span>
            <select
              onChange={(event) => updateField("visibility", event.target.value)}
              value={form.visibility}
            >
              {options.visibilityOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="app-edit-field app-edit-field-wide">
            <span>GitLab 仓库</span>
            <input
              className={fieldErrors.repoUrl ? "has-error" : undefined}
              onChange={(event) => updateField("repoUrl", event.target.value)}
              placeholder={options.gitlab?.exampleRepoUrl || "https://gitlab.com/group/project"}
              value={form.repoUrl}
            />
            {options.gitlab?.baseUrl ? (
              <small className="app-edit-hint">当前实例 {options.gitlab.baseUrl}</small>
            ) : null}
            {fieldErrors.repoUrl ? (
              <small className="app-edit-field-error">{fieldErrors.repoUrl}</small>
            ) : null}
          </label>

          <label className="app-edit-field app-edit-field-wide">
            <span>描述</span>
            <textarea
              onChange={(event) => updateField("description", event.target.value)}
              placeholder="可选，简要说明应用用途"
              rows={3}
              value={form.description}
            />
          </label>
        </div>

        {error ? <p className="app-edit-error">{error}</p> : null}

        <div className="app-edit-actions">
          <button className="ghost-btn" disabled={saving} onClick={onClose} type="button">
            取消
          </button>
          <button className="primary-btn" disabled={saving} type="submit">
            {saving ? "保存中…" : "保存"}
          </button>
        </div>
      </form>
    </div>
  );
}

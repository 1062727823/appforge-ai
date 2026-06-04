import { useEffect, useMemo, useState } from "react";
import { GITLAB_REPO_URL_ERROR, isValidGitLabRepoUrl } from "@appforge/shared/gitlab.js";
import { createApp, getCreateOptions } from "../lib/api.js";
import { bootstrapEditorWorkspace } from "../lib/editorBootstrap.js";
import { slugify } from "../lib/utils.js";
import { useApp } from "../context/AppContext.jsx";
import "./create-view.css";

const STEPS = [
  { id: "app", label: "创建应用" },
  { id: "workspace", label: "初始化工作区" },
  { id: "agent", label: "启动 Agent" },
  { id: "editor", label: "打开编辑器" },
];

function DeployMethodIcon({ value }) {
  if (value === "kubernetes") {
    return (
      <svg aria-hidden="true" height="18" viewBox="0 0 24 24" width="18">
        <path
          d="M12 2 3 7v10l9 5 9-5V7l-9-5zm0 2.2 6.5 3.6v7.2L12 18.8 5.5 15.1V7.8L12 4.2z"
          fill="currentColor"
        />
      </svg>
    );
  }
  if (value === "dockerfile") {
    return (
      <svg aria-hidden="true" height="18" viewBox="0 0 24 24" width="18">
        <path
          d="M4 8h2v2H4V8zm3 0h2v2H7V8zm3 0h2v2h-2V8zm3 0h2v2h-2V8zm3 0h2v2h-2V8zM2 11h18v2H2v-2zm0 3h18v2H2v-2z"
          fill="currentColor"
        />
      </svg>
    );
  }
  return (
    <svg aria-hidden="true" height="18" viewBox="0 0 24 24" width="18">
      <path
        d="M4 6h16v12H4V6zm2 2v8h12V8H6zm2 2h2v2H8v-2zm3 0h2v2h-2v-2zm3 0h2v2h-2v-2z"
        fill="currentColor"
      />
    </svg>
  );
}

function DeployMethodCard({ method, selected, onSelect }) {
  const disabled = !method.available;

  return (
    <button
      aria-pressed={selected}
      className={`create-deploy-option${selected ? " selected" : ""}`}
      disabled={disabled}
      onClick={() => onSelect(method.value)}
      type="button"
    >
      <span className="create-deploy-icon">
        <DeployMethodIcon value={method.value} />
      </span>
      <span className="create-deploy-copy">
        <strong>{method.label}</strong>
        <p>{method.description}</p>
      </span>
      <span className="create-deploy-badges">
        {(method.badges || []).map((badge) => (
          <span
            className={`create-deploy-badge${
              badge === "推荐" ? " accent" : badge === "即将推出" ? " muted" : ""
            }`}
            key={badge}
          >
            {badge}
          </span>
        ))}
      </span>
    </button>
  );
}

export function CreateView({ active }) {
  const { openEditor, refreshApps, setView } = useApp();
  const [options, setOptions] = useState({
    deployMethods: [],
    gitlab: {
      baseUrl: "https://gitlab.com",
      exampleRepoUrl: "https://gitlab.com/acme/sales-crm",
      hosts: ["gitlab.com"],
    },
    repositories: [],
    teams: [],
    visibilityOptions: [],
  });
  const [form, setForm] = useState({
    deployMethod: "docker-compose",
    description: "",
    name: "",
    repoUrl: "",
    slug: "",
    teamName: "",
    visibility: "",
  });
  const [errors, setErrors] = useState({});
  const [status, setStatus] = useState({ message: "", type: "info" });
  const [creating, setCreating] = useState(false);
  const [activeStep, setActiveStep] = useState("");
  const [doneSteps, setDoneSteps] = useState([]);

  useEffect(() => {
    if (!active) return;
    getCreateOptions()
      .then((payload) => {
        const defaultDeploy =
          payload.deployMethods?.find((item) => item.available)?.value || "docker-compose";
        setOptions((prev) => ({ ...prev, ...payload }));
        setForm((current) => ({
          ...current,
          deployMethod: defaultDeploy,
          teamName: payload.teams?.[0]?.name || "",
          visibility: payload.visibilityOptions?.[0]?.value || "",
        }));
      })
      .catch((error) => setStatus({ message: error.message, type: "error" }));
  }, [active]);

  const selectedDeploy = useMemo(
    () => options.deployMethods.find((item) => item.value === form.deployMethod) || null,
    [form.deployMethod, options.deployMethods],
  );

  function updateField(field, value) {
    setForm((current) => {
      const next = { ...current, [field]: value };
      if (field === "name" && !current.slug.trim()) {
        next.slug = slugify(value);
      }
      if (field === "slug") {
        next.slug = slugify(value);
      }
      return next;
    });
  }

  function validate() {
    const nextErrors = {};
    if (!form.name.trim()) nextErrors.name = "请输入项目名称";
    if (!form.slug.trim()) nextErrors.slug = "请输入项目标识";
    else if (!/^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$/.test(form.slug)) {
      nextErrors.slug = "仅支持小写字母、数字和中划线，长度 3-64";
    }
    if (!selectedDeploy?.available) {
      nextErrors.deployMethod = "请选择可用的部署方式";
    }
    if (
      form.repoUrl &&
      !isValidGitLabRepoUrl(form.repoUrl, {
        baseUrl: options.gitlab?.baseUrl,
        hosts: options.gitlab?.hosts,
      })
    ) {
      nextErrors.repoUrl = GITLAB_REPO_URL_ERROR;
    }
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }

  async function handleSubmit() {
    if (!validate()) {
      setStatus({ message: "请修正表单中的错误后再创建。", type: "error" });
      return;
    }

    setCreating(true);
    setStatus({ message: "正在创建应用并初始化 Docker Compose 工作区…", type: "info" });
    setActiveStep("app");
    setDoneSteps([]);

    try {
      const result = await createApp({
        deployMethod: form.deployMethod,
        description: form.description.trim(),
        name: form.name.trim(),
        repoUrl: form.repoUrl.trim(),
        slug: form.slug.trim(),
        teamName: form.teamName.trim() || options.teams[0]?.name || "",
        visibility: form.visibility,
      });

      await refreshApps();
      setDoneSteps(["app"]);
      setActiveStep("workspace");
      setDoneSteps(["app", "workspace"]);
      setActiveStep("agent");

      openEditor(result.appId);
      await bootstrapEditorWorkspace(result.appId, result.taskId);

      setDoneSteps(["app", "workspace", "agent", "editor"]);
      setActiveStep("");
      setStatus({ message: "应用已创建，编辑器已打开。", type: "info" });
    } catch (error) {
      setStatus({ message: error.message || "创建应用失败", type: "error" });
    } finally {
      setCreating(false);
    }
  }

  function clearForm() {
    const defaultDeploy =
      options.deployMethods.find((item) => item.available)?.value || "docker-compose";
    setForm({
      deployMethod: defaultDeploy,
      description: "",
      name: "",
      repoUrl: "",
      slug: "",
      teamName: options.teams[0]?.name || "",
      visibility: options.visibilityOptions[0]?.value || "",
    });
    setErrors({});
    setStatus({ message: "", type: "info" });
    setActiveStep("");
    setDoneSteps([]);
  }

  return (
    <section className={`view${active ? " active" : ""}`} id="createView">
      <div className="create-page">
        <div className="create-page-header">
          <div>
            <button className="ghost-btn back-btn" onClick={() => setView("dashboard")} type="button">
              返回应用管理
            </button>
            <h2>创建新应用</h2>
            <p>填写项目信息并选择部署方式。当前平台会基于 Docker Compose 自动生成运行与部署配置。</p>
          </div>
        </div>

        <div className="create-page-grid">
          <article className="create-section">
            <h3 className="create-section-title">项目信息</h3>
            <p className="create-section-desc">用于创建工作区、权限范围与可选的 GitLab 仓库关联。</p>

            <div className="create-form-grid">
              <label>
                项目名称
                <input
                  onChange={(event) => updateField("name", event.target.value)}
                  placeholder="例如：销售 CRM"
                  value={form.name}
                />
                <small className="field-error">{errors.name || ""}</small>
              </label>
              <label>
                项目标识
                <input
                  onChange={(event) => updateField("slug", event.target.value)}
                  placeholder="例如：sales-crm"
                  value={form.slug}
                />
                <small className="field-error">{errors.slug || ""}</small>
              </label>
              <label>
                所属团队
                <select onChange={(event) => updateField("teamName", event.target.value)} value={form.teamName}>
                  {options.teams.map((team) => (
                    <option key={team.name} value={team.name}>
                      {team.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                可见范围
                <select onChange={(event) => updateField("visibility", event.target.value)} value={form.visibility}>
                  {options.visibilityOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <label className="create-field-block">
              项目描述
              <textarea
                onChange={(event) => updateField("description", event.target.value)}
                placeholder="简要说明这个项目要解决的问题，Agent 会据此生成初始代码。"
                rows={3}
                value={form.description}
              />
            </label>

            <label className="create-field-block">
              GitLab 仓库地址（可选）
              <input
                list="repoOptions"
                onChange={(event) => updateField("repoUrl", event.target.value)}
                placeholder={options.gitlab?.exampleRepoUrl || "https://gitlab.com/acme/sales-crm"}
                value={form.repoUrl}
              />
              <span className="create-field-hint">
                留空则创建空白工作区。gitlab.com 需 HTTPS；自建 GitLab 请先在设置中填写实例地址（如
                http://localhost:8929），支持 .git 后缀与子组路径。
              </span>
              <small className="field-error">{errors.repoUrl || ""}</small>
            </label>
            <datalist id="repoOptions">
              {options.repositories.map((repo) => (
                <option key={repo.repoUrl} value={repo.repoUrl}>
                  {repo.name} / {repo.slug}
                </option>
              ))}
            </datalist>
          </article>

          <article className="create-section">
            <h3 className="create-section-title">部署方式</h3>
            <p className="create-section-desc">决定运行与生产部署的容器编排方案，创建后写入工作区模板。</p>

            <div className="create-deploy-list">
              {options.deployMethods.map((method) => (
                <DeployMethodCard
                  key={method.value}
                  method={method}
                  onSelect={(value) => updateField("deployMethod", value)}
                  selected={form.deployMethod === method.value}
                />
              ))}
            </div>
            <small className="field-error">{errors.deployMethod || ""}</small>

            {selectedDeploy ? (
              <dl className="create-deploy-summary">
                <dt>将生成的配置</dt>
                <dd>{selectedDeploy.scaffold?.join(" · ") || "—"}</dd>
                <dt>运行命令</dt>
                <dd>{selectedDeploy.runCommand || "—"}</dd>
                <dt>部署命令</dt>
                <dd>{selectedDeploy.deployCommand || "—"}</dd>
              </dl>
            ) : null}
          </article>
        </div>

        <footer className="create-footer">
          <div>
            {status.message ? (
              <div className={`create-status${status.type === "error" ? " error" : ""}`}>{status.message}</div>
            ) : null}
            {activeStep || doneSteps.length ? (
              <div className="create-stepper">
                {STEPS.map((step) => (
                  <span
                    className={`create-stepper-item${step.id === activeStep ? " running" : ""}${
                      doneSteps.includes(step.id) ? " done" : ""
                    }`}
                    key={step.id}
                  >
                    {step.label}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
          <div className="create-footer-actions">
            <button className="ghost-btn" disabled={creating} onClick={clearForm} type="button">
              清空
            </button>
            <button className="primary-btn" disabled={creating} onClick={handleSubmit} type="button">
              {creating ? "创建中…" : "创建并进入编辑器"}
            </button>
          </div>
        </footer>
      </div>
    </section>
  );
}

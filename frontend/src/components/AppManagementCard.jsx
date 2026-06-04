import { StatusPill } from "./ui.jsx";
import { statusClass, statusText } from "../lib/utils.js";

function parseRepo(url) {
  if (!url) return { display: null, full: null };

  try {
    const normalized = url.replace(/\.git$/i, "");
    const parsed = new URL(normalized);
    const path = parsed.pathname.replace(/^\/+|\/+$/g, "");
    const full = `${parsed.host}${path ? `/${path}` : ""}`;
    const display = full.length > 42 ? `${full.slice(0, 24)}…${full.slice(-14)}` : full;
    return { display, full: url };
  } catch {
    const display = url.length > 42 ? `${url.slice(0, 38)}…` : url;
    return { display, full: url };
  }
}

function appInitial(app) {
  const source = app.name || app.slug || "?";
  return source.charAt(0).toUpperCase();
}

export function AppManagementCard({ app, deployed, onDelete, onEdit, onEditInfo }) {
  const repo = parseRepo(app.repoUrl);

  return (
    <article className="app-mgmt-card">
      <div aria-hidden="true" className="app-mgmt-card-accent" />

      <header className="app-mgmt-card-head">
        <div className="app-mgmt-identity">
          <div aria-hidden="true" className="app-mgmt-mark">
            {appInitial(app)}
          </div>
          <div className="app-mgmt-title-wrap">
            <h3>{app.name}</h3>
            <p className="app-mgmt-subtitle">
              <code>{app.slug}</code>
              <span aria-hidden="true">·</span>
              <span>{app.teamName || "默认团队"}</span>
            </p>
          </div>
        </div>
        <div className="app-mgmt-badges">
          {deployed ? (
            <StatusPill className="preview" title="删除前需先在部署页停止">
              生产中
            </StatusPill>
          ) : null}
          <StatusPill className={statusClass(app.status)}>{statusText(app.status)}</StatusPill>
        </div>
      </header>

      {app.description ? (
        <p className="app-mgmt-desc">{app.description}</p>
      ) : null}

      <dl className="app-mgmt-meta">
        <div className="app-mgmt-meta-row">
          <dt>仓库</dt>
          <dd className={repo.full ? undefined : "is-empty"} title={repo.full || undefined}>
            {repo.full ? repo.display : "待创建"}
          </dd>
        </div>
      </dl>

      <footer className="app-mgmt-card-foot">
        <button className="ghost-btn app-mgmt-info-btn" onClick={onEditInfo} type="button">
          基础信息
        </button>
        <button className="primary-btn app-mgmt-edit-btn" onClick={onEdit} type="button">
          进入编辑
        </button>
        <button
          className="ghost-btn app-mgmt-delete-btn"
          disabled={deployed}
          onClick={onDelete}
          title={deployed ? "请先停止生产部署" : undefined}
          type="button"
        >
          删除
        </button>
      </footer>
    </article>
  );
}

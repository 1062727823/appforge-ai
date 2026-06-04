import { useState } from "react";
import { statusClass, statusText } from "../lib/utils.js";
import { useApp } from "../context/AppContext.jsx";
import { EmptyState, StatusPill } from "../components/ui.jsx";

function VersionAppCard({ app, deployUrl, onOpen }) {
  return (
    <article
      className="version-app-card"
      onClick={() => onOpen(app)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpen(app);
        }
      }}
      role="button"
      tabIndex={0}
    >
      <div className="deploy-card-top">
        <div>
          <strong>{app.name}</strong>
          <small>{app.teamName || "默认团队"}</small>
        </div>
        <StatusPill className={statusClass(app.status)}>{statusText(app.status)}</StatusPill>
      </div>
      <div className="deploy-card-url">{deployUrl}</div>
      <div className="deploy-card-meta">
        <span>{app.visibility || "team"}</span>
        <span>{app.slug}</span>
      </div>
    </article>
  );
}

export function VersionsView({ active }) {
  const { apps, getDeployOverviewFor } = useApp();
  const [selectedApp, setSelectedApp] = useState(null);

  if (selectedApp) {
    return (
      <section className={`view${active ? " active" : ""}`} id="versionsView">
        <div className="version-detail-view">
          <button className="ghost-btn back-btn" onClick={() => setSelectedApp(null)} type="button">
            返回应用列表
          </button>
          <article className="panel">
            <div className="section-heading compact">
              <div>
                <h2>{selectedApp.name}</h2>
                <p>每次 Agent 修改都会形成可回滚版本。</p>
              </div>
              <button className="ghost-btn" type="button">
                导出源码
              </button>
            </div>
            <div className="timeline">
              <EmptyState>版本时间线即将接入 Agent 变更记录。</EmptyState>
            </div>
          </article>
        </div>
      </section>
    );
  }

  return (
    <section className={`view${active ? " active" : ""}`} id="versionsView">
      <div className="version-list-view">
        <div className="section-heading">
          <div>
            <h2>应用版本</h2>
            <p>选择应用查看版本记录、变更摘要和回滚入口。</p>
          </div>
        </div>
        <div className="version-card-grid">
          {apps.length ? (
            apps.map((app) => {
              const overview = getDeployOverviewFor(app.id);
              const deployUrl = overview?.deployUrl || `http://127.0.0.1:8089/deploy/${app.id}/`;
              return <VersionAppCard app={app} deployUrl={deployUrl} key={app.id} onOpen={setSelectedApp} />;
            })
          ) : (
            <EmptyState>暂无应用版本。请先创建一个应用。</EmptyState>
          )}
        </div>
      </div>
    </section>
  );
}

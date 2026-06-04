import { VIEW_TITLES } from "../lib/utils.js";
import { useApp } from "../context/AppContext.jsx";

const NAV_ITEMS = [
  { icon: "dashboard", label: "应用管理", view: "dashboard" },
  { icon: "deploy", label: "部署管理", view: "deploy" },
  { icon: "versions", label: "版本历史", view: "versions" },
];

const BOTTOM_NAV_ITEMS = [{ icon: "settings", label: "设置", view: "settings" }];

function NavIcon({ name }) {
  if (name === "dashboard") {
    return (
      <svg className="nav-icon" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 4h7v7H4V4zm9 0h7v7h-7V4zM4 13h7v7H4v-7zm9 0h7v7h-7v-7z" fill="currentColor" />
      </svg>
    );
  }
  if (name === "deploy") {
    return (
      <svg className="nav-icon" viewBox="0 0 24 24" aria-hidden="true">
        <path
          d="M12 3 2 8.5 12 14l7.5-3.75V16h2V8.5L22 8.5 12 3zm-8 9.5V16l8 4.5 8-4.5v-3.5L12 17 4 12.5z"
          fill="currentColor"
        />
      </svg>
    );
  }
  if (name === "settings") {
    return (
      <svg className="nav-icon" viewBox="0 0 24 24" aria-hidden="true">
        <path
          d="M12 8.5A3.5 3.5 0 1 0 12 15.5 3.5 3.5 0 0 0 12 8.5zm8.94 4.5a7.96 7.96 0 0 0-.12-1.5l2.03-1.58-1.92-3.32-2.39.96a8.05 8.05 0 0 0-2.6-1.5L15.5 2h-3.8l-.58 2.56a8.05 8.05 0 0 0-2.6 1.5l-2.39-.96-1.92 3.32 2.03 1.58c-.08.5-.12 1-.12 1.5s.04 1 .12 1.5l-2.03 1.58 1.92 3.32 2.39-.96c.78.64 1.65 1.14 2.6 1.5l.58 2.56h3.8l.58-2.56c.95-.36 1.82-.86 2.6-1.5l2.39.96 1.92-3.32-2.03-1.58c.08-.5.12-1 .12-1.5z"
          fill="currentColor"
        />
      </svg>
    );
  }
  return (
    <svg className="nav-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M12 2a10 10 0 1 0 10 10h-2a8 8 0 1 1-8-8V2zm1 5h-2v6l5 3 .9-1.45L13 11.5V7z"
        fill="currentColor"
      />
    </svg>
  );
}

export function Sidebar() {
  const { setView, view } = useApp();

  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-mark">A</div>
        <div>
          <div className="brand-name">AppForge AI</div>
          <div className="brand-subtitle">Prompt to App Platform</div>
        </div>
      </div>

      <nav className="nav-list" aria-label="主导航">
        {NAV_ITEMS.map((item) => (
          <button
            className={`nav-item${view === item.view ? " active" : ""}`}
            key={item.view}
            onClick={() => setView(item.view)}
            title={item.label}
            type="button"
          >
            <NavIcon name={item.icon} />
            <span className="nav-label">{item.label}</span>
          </button>
        ))}
      </nav>

      <div className="sidebar-bottom">
        <nav className="nav-list nav-list-bottom" aria-label="系统导航">
          {BOTTOM_NAV_ITEMS.map((item) => (
            <button
              className={`nav-item${view === item.view ? " active" : ""}`}
              key={item.view}
              onClick={() => setView(item.view)}
              title={item.label}
              type="button"
            >
              <NavIcon name={item.icon} />
              <span className="nav-label">{item.label}</span>
            </button>
          ))}
        </nav>

        <div className="usage-panel" title="本月 AI 用量">
        <div className="usage-ring" aria-hidden="true" style={{ "--usage": "42" }}>
          <span />
        </div>
        <div className="usage-copy">
          <div className="usage-label">AI 用量</div>
          <div className="usage-value">
            <span>42</span>%
          </div>
        </div>
        </div>
      </div>
    </aside>
  );
}

export function Topbar({ editorActions = null }) {
  const { activeAppId, apps, setView, view } = useApp();
  const title = VIEW_TITLES[view] || "应用工作台";
  const activeApp = apps.find((item) => item.id === activeAppId);

  const fileMeta =
    view === "editor" && activeAppId
      ? {
          subtitle: "Web IDE 工作区",
          title: activeApp?.name || activeApp?.slug || activeAppId,
        }
      : null;

  return (
    <header className="topbar">
      <div className="topbar-main">
        <p className="eyebrow">AppForge Workbench</p>
        <div className="title-row">
          <h1>{title}</h1>
          {fileMeta ? (
            <div className="active-file-meta">
              <strong>{fileMeta.title}</strong>
              <span>{fileMeta.subtitle}</span>
            </div>
          ) : null}
        </div>
      </div>
      <div className="top-actions">
        {view !== "create" && view !== "settings" ? (
          <button className="primary-btn toolbar-btn" onClick={() => setView("create")} type="button">
            创建应用
          </button>
        ) : null}
        {editorActions}
      </div>
    </header>
  );
}

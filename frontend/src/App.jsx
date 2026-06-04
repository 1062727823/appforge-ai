import { useEffect } from "react";
import { Sidebar, Topbar } from "./components/Layout.jsx";
import { AppProvider, useApp } from "./context/AppContext.jsx";
import { CreateView } from "./views/CreateView.jsx";
import { DashboardView } from "./views/DashboardView.jsx";
import { DeployView } from "./views/DeployView.jsx";
import { EditorView, useEditorControls } from "./views/EditorView.jsx";
import { VersionsView } from "./views/VersionsView.jsx";
import { SettingsView } from "./views/SettingsView.jsx";
import "./components/deploy/deploy-log.css";
import "./views/create-view.css";
import "./views/dashboard-view.css";
import "./views/deploy-view.css";
import "./views/settings-view.css";
import "./views/editor-view.css";

function EditorToolbar({ editorControls }) {
  const { exitEditor, setView } = useApp();
  const { openPreview, previewEnabled, running, startRun, stopRun, compile } = editorControls;

  return (
    <div className="editor-top-actions" id="editorTopActions">
      <button className="toolbar-btn ghost-btn" onClick={compile} type="button">编译</button>
      {running ? (
        <button className="toolbar-btn ghost-btn stop-btn" onClick={stopRun} type="button">
          停止
        </button>
      ) : (
        <>
          <button className="toolbar-btn primary-btn" onClick={() => startRun(false)} type="button">
            运行
          </button>
          <button className="toolbar-btn primary-btn" onClick={() => startRun(true)} type="button">
            重新构建并运行
          </button>
        </>
      )}
      <button className="toolbar-btn ghost-btn" disabled={!previewEnabled} onClick={openPreview} type="button">
        打开预览
      </button>
      <button className="toolbar-btn ghost-btn" onClick={() => exitEditor()} type="button">
        退出编辑
      </button>
      <button className="toolbar-btn primary-btn" onClick={() => setView("deploy")} type="button">
        部署
      </button>
    </div>
  );
}

function AppShell() {
  const { activeAppId, view } = useApp();
  const editorControls = useEditorControls(activeAppId);

  useEffect(() => {
    document.body.classList.toggle("editor-active", view === "editor");
  }, [view]);

  const editorActions = view === "editor" && activeAppId
    ? <EditorToolbar editorControls={editorControls} />
    : null;

  return (
    <div className="app-shell">
      <Sidebar />
      <main className="main">
        <Topbar editorActions={editorActions} />
        <DashboardView active={view === "dashboard"} />
        <CreateView active={view === "create"} />
        <DeployView active={view === "deploy"} />
        <VersionsView active={view === "versions"} />
        <SettingsView active={view === "settings"} />
        <EditorView active={view === "editor"} editorControls={editorControls} />
      </main>
    </div>
  );
}

export default function App() {
  return (
    <AppProvider>
      <AppShell />
    </AppProvider>
  );
}

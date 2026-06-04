import { useMemo, useState } from "react";
import { deleteApp } from "../lib/api.js";
import { useApp } from "../context/AppContext.jsx";
import { AppManagementCard } from "../components/AppManagementCard.jsx";
import { AppEditModal } from "../components/AppEditModal.jsx";
import { EmptyState } from "../components/ui.jsx";

export function DashboardView({ active }) {
  const {
    apps,
    appsError,
    getDeployOverviewFor,
    isAppDeployed,
    loadingApps,
    openEditor,
    refreshApps,
    refreshDeployOverview,
  } = useApp();
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [editingApp, setEditingApp] = useState(null);

  const filteredApps = useMemo(
    () =>
      apps.filter((app) => {
        const matchesStatus = statusFilter === "all" || app.status === statusFilter;
        const content = `${app.name} ${app.slug} ${app.teamName || ""} ${app.repoUrl || ""}`.toLowerCase();
        return matchesStatus && (!searchQuery || content.includes(searchQuery));
      }),
    [apps, searchQuery, statusFilter],
  );

  const stats = useMemo(
    () => ({
      creating: apps.filter((app) => app.status === "creating").length,
      ready: apps.filter((app) => app.status === "ready").length,
      repo: apps.filter((app) => app.repoUrl).length,
      total: apps.length,
    }),
    [apps],
  );

  async function handleDelete(appId) {
    const app = apps.find((item) => item.id === appId);
    if (!app) return;

    if (isAppDeployed(appId)) {
      window.alert("该应用正在生产环境运行或部署中，请先在部署页停止后再删除。");
      return;
    }

    if (!window.confirm(`确定删除“${app.name}”这个应用吗？删除后会同时清理工作区、任务和事件记录。`)) {
      return;
    }

    await deleteApp(appId);
    await refreshApps();
  }

  return (
    <section className={`view${active ? " active" : ""}`} id="dashboardView">
      <AppEditModal
        app={editingApp}
        onClose={() => setEditingApp(null)}
        onSaved={async () => {
          await refreshApps();
          await refreshDeployOverview().catch(() => {});
        }}
        open={Boolean(editingApp)}
      />
      <div className="stats-grid">
        <article className="stat-card">
          <span>应用总数</span>
          <strong>{stats.total}</strong>
          <small>当前已创建应用</small>
        </article>
        <article className="stat-card">
          <span>可编辑应用</span>
          <strong>{stats.ready}</strong>
          <small>可以进入编辑器继续生成</small>
        </article>
        <article className="stat-card">
          <span>生成中</span>
          <strong>{stats.creating}</strong>
          <small>Agent 正在准备工作区</small>
        </article>
        <article className="stat-card">
          <span>已关联仓库</span>
          <strong>{stats.repo}</strong>
          <small>已填写 GitLab 仓库地址</small>
        </article>
      </div>

      <div className="section-heading">
        <div>
          <h2>应用列表</h2>
          <p>管理已经创建的应用，进入编辑器或删除不再需要的项目。</p>
        </div>
        <div className="filters">
          <input
            onChange={(event) => setSearchQuery(event.target.value.trim().toLowerCase())}
            placeholder="搜索应用"
            type="search"
            value={searchQuery}
          />
          <select
            aria-label="按状态筛选"
            onChange={(event) => setStatusFilter(event.target.value)}
            value={statusFilter}
          >
            <option value="all">全部状态</option>
            <option value="ready">可用</option>
            <option value="creating">生成中</option>
            <option value="running">运行中</option>
            <option value="stopped">已停止</option>
          </select>
        </div>
      </div>

      <div className="app-grid">
        {loadingApps ? <EmptyState>加载应用中…</EmptyState> : null}
        {!loadingApps && appsError ? <EmptyState>{appsError}</EmptyState> : null}
        {!loadingApps && !appsError && !filteredApps.length ? (
          <EmptyState>{apps.length ? "没有匹配的应用。" : "暂无应用。请先创建一个应用。"}</EmptyState>
        ) : null}
        {!loadingApps && !appsError
          ? filteredApps.map((app) => {
              const deployed = isAppDeployed(app.id);
              return (
                <AppManagementCard
                  app={app}
                  deployed={deployed}
                  key={app.id}
                  onDelete={() => handleDelete(app.id).catch((error) => window.alert(error.message))}
                  onEdit={() => openEditor(app.id)}
                  onEditInfo={() => setEditingApp(app)}
                />
              );
            })
          : null}
      </div>
    </section>
  );
}

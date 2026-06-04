import { useEffect, useState } from "react";
import { DeployLogPanel } from "../components/deploy/DeployLogPanel.jsx";
import { ContainerLogsSection } from "../components/deploy/ContainerLogsSection.jsx";
import { EmptyState, KvGrid, StatusPill } from "../components/ui.jsx";
import { actionLabel, deployStatusLabel, historyStatusTone } from "../lib/utils.js";

const DETAIL_TABS = [
  { id: "overview", label: "概览" },
  { id: "logs", label: "日志" },
  { id: "history", label: "历史" },
];

const LOG_TABS = [
  { id: "build", label: "构建部署" },
  { id: "containers", label: "容器运行" },
];

function GatewayGrid({ status, compact = false }) {
  const preview = status.preview || {};
  const deploy = status.deployGateway || {};

  return (
    <div className={`gateway-grid${compact ? " gateway-grid-compact" : ""}`}>
      <div className="gateway-card">
        <div className="gateway-card-head">
          <strong>开发预览</strong>
          <StatusPill className={preview.running ? "deployed" : "idle"}>
            {preview.running ? "运行中" : "未运行"}
          </StatusPill>
        </div>
        <code className="gateway-url">{preview.url || "-"}</code>
        <div className="gateway-meta">
          入口 {preview.entrypoint || "web"} · 路径 {preview.path || "-"}
        </div>
      </div>
      <div className="gateway-card">
        <div className="gateway-card-head">
          <strong>生产部署</strong>
          <StatusPill className={status.running ? "deployed" : "idle"}>
            {status.running ? "运行中" : "已停止"}
          </StatusPill>
        </div>
        <code className="gateway-url">{deploy.url || "-"}</code>
        <div className="gateway-meta">
          入口 {deploy.entrypoint || "deploy"} · 路由 {deploy.router || "-"}
        </div>
      </div>
    </div>
  );
}

function EventHistory({ history = [] }) {
  if (!history.length) {
    return <EmptyState>暂无事件记录。点击「部署新版本」开始第一次部署。</EmptyState>;
  }

  return (
    <div className="history-table deploy-history-table">
      <div className="history-row history-header">
        <span>时间</span>
        <span>操作</span>
        <span>状态</span>
        <span>详情</span>
      </div>
      {history.slice(0, 20).map((entry) => {
        const tone = historyStatusTone(entry);
        const details = [
          entry.message,
          entry.deployUrl ? `URL ${entry.deployUrl}` : "",
          entry.durationLabel ? `耗时 ${entry.durationLabel}` : "",
          entry.id ? `ID ${entry.id}` : "",
        ]
          .filter(Boolean)
          .join(" · ");

        return (
          <div className="history-row deploy-event-row" key={entry.id || entry.at}>
            <span>{new Date(entry.at).toLocaleString()}</span>
            <span>{actionLabel(entry.action)}</span>
            <span>
              <StatusPill className={tone.className}>{tone.text}</StatusPill>
            </span>
            <span className="history-detail">{details || "-"}</span>
          </div>
        );
      })}
    </div>
  );
}

function buildInfoItems(status, appId, app) {
  return [
    ["应用 ID", status?.app?.id || appId],
    ["应用标识", status?.app?.slug || app?.slug || "-"],
    ["团队", status?.app?.teamName || app?.teamName || "默认团队"],
    ["Compose 文件", status?.deployGateway?.composeFile || "docker-compose.yml"],
    ["部署服务", status?.deployGateway?.service || "deploy"],
    ["Traefik 路由", status?.deployGateway?.router || "-"],
    ["Compose 项目", status?.project || "-"],
    ["部署命令", "docker compose --profile deploy up -d deploy"],
  ];
}

function buildSummaryLine(status, latestDeploy, deployTone) {
  const parts = [
    status?.deployGateway?.url || status?.deployUrl,
    status?.running ? `${status.containers?.length || 0} 个容器` : null,
    status?.port ? `端口 ${status.port}` : null,
    latestDeploy ? `最近部署 ${deployTone}` : "尚未部署",
  ].filter(Boolean);

  return parts.join(" · ") || "尚未生成生产地址";
}

export function DeployDetailView({
  app,
  appId,
  loading,
  onBack,
  onDeployAction,
  status,
}) {
  const [detailTab, setDetailTab] = useState("overview");
  const [logTab, setLogTab] = useState("build");
  const [logKey, setLogKey] = useState(0);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  useEffect(() => {
    setDetailTab("overview");
    setLogTab("build");
    setLogKey(0);
    setAdvancedOpen(false);
  }, [appId]);

  useEffect(() => {
    if (status?.deploying) {
      setDetailTab("logs");
      setLogTab("build");
    }
  }, [status?.deploying]);

  if (loading && !status) {
    return (
      <div className="deploy-detail-view">
        <button className="ghost-btn back-btn" onClick={onBack} type="button">
          返回应用列表
        </button>
        <EmptyState>加载部署详情…</EmptyState>
      </div>
    );
  }

  if (!status) return null;

  const pill = deployStatusLabel(status);
  const latestDeploy = status.latestDeploy;
  const deployTone = latestDeploy?.status === "failed"
    ? "失败"
    : latestDeploy?.status === "running"
      ? "进行中"
      : latestDeploy
        ? "成功"
        : "未部署";
  const deployUrl = status.deployGateway?.url || status.deployUrl || "";
  const summaryLine = buildSummaryLine(status, latestDeploy, deployTone);
  const infoItems = buildInfoItems(status, appId, app);

  function handleDeployAction(action) {
    if (action === "deploy" || action === "toggle") {
      setDetailTab("logs");
      setLogTab("build");
    }
    onDeployAction(action);
  }

  return (
    <div className="deploy-detail-view">
      <header className="deploy-detail-header panel">
        <button className="ghost-btn back-btn deploy-detail-back" onClick={onBack} type="button">
          ← 返回
        </button>

        <div className="deploy-detail-head-main">
          <div className="deploy-detail-title">
            <StatusPill className={pill.className}>{pill.text}</StatusPill>
            <h2>{status.app?.name || app?.name || appId}</h2>
            <p className="deploy-detail-summary">{summaryLine}</p>
          </div>

          <div className="runtime-actions deploy-detail-actions">
            <button
              className="primary-btn"
              disabled={Boolean(status.deploying)}
              onClick={() => handleDeployAction("toggle")}
              type="button"
            >
              {status.running ? "停止" : "启动"}
            </button>
            <button
              className="ghost-btn"
              disabled={Boolean(status.deploying)}
              onClick={() => handleDeployAction("restart")}
              type="button"
            >
              重启
            </button>
            <button
              className="ghost-btn"
              disabled={!deployUrl || Boolean(status.deploying)}
              onClick={() => window.open(deployUrl, "_blank", "noopener,noreferrer")}
              type="button"
            >
              打开
            </button>
            <button
              className="ghost-btn"
              disabled={Boolean(status.deploying)}
              onClick={() => handleDeployAction("deploy")}
              type="button"
            >
              部署新版本
            </button>
          </div>
        </div>
      </header>

      <nav aria-label="部署详情分区" className="deploy-detail-tabs">
        {DETAIL_TABS.map((tab) => (
          <button
            aria-selected={detailTab === tab.id}
            className={`deploy-detail-tab${detailTab === tab.id ? " active" : ""}`}
            key={tab.id}
            onClick={() => setDetailTab(tab.id)}
            type="button"
          >
            {tab.label}
          </button>
        ))}
      </nav>

      <div className="deploy-detail-body">
        {detailTab === "overview" ? (
          <div className="deploy-overview-layout">
            <div className="runtime-metrics deploy-overview-metrics">
              <article className="stat-card">
                <span>容器状态</span>
                <strong>{status.deploying ? "部署中" : status.running ? "运行中" : "已停止"}</strong>
                <small>
                  {status.running
                    ? `${status.containers?.length || 0} 个容器`
                    : status.message || "暂无运行中的生产容器"}
                </small>
              </article>
              <article className="stat-card">
                <span>服务端口</span>
                <strong>{status.port ? String(status.port) : "-"}</strong>
                <small>{status.project || "-"}</small>
              </article>
              <article className="stat-card">
                <span>最近部署</span>
                <strong>{deployTone}</strong>
                <small>
                  {latestDeploy
                    ? `${status.lastDeployLabel}${latestDeploy.durationLabel ? ` · ${latestDeploy.durationLabel}` : ""}`
                    : "尚未部署"}
                </small>
              </article>
            </div>

            <article className="panel deploy-overview-panel">
              <h3>网关地址</h3>
              <GatewayGrid compact status={status} />
            </article>

            <article className="panel deploy-overview-panel">
              <button
                aria-expanded={advancedOpen}
                className="deploy-advanced-toggle"
                onClick={() => setAdvancedOpen((value) => !value)}
                type="button"
              >
                <span>运行配置</span>
                <span className="deploy-advanced-toggle-meta">
                  {advancedOpen ? "收起" : "展开"} · {infoItems.length} 项
                </span>
              </button>
              {advancedOpen ? <KvGrid items={infoItems} /> : null}
            </article>

            {(status.containers || []).length ? (
              <article className="panel deploy-overview-panel">
                <div className="deploy-overview-panel-head">
                  <h3>容器</h3>
                  <button className="ghost-btn" onClick={() => setDetailTab("logs")} type="button">
                    查看日志
                  </button>
                </div>
                <div className="deploy-container-chips">
                  {(status.containers || []).map((container) => (
                    <button
                      className="deploy-container-chip"
                      key={container.id}
                      onClick={() => {
                        setDetailTab("logs");
                        setLogTab("containers");
                      }}
                      type="button"
                    >
                      <strong>{container.service || container.name || container.shortId}</strong>
                      <span>{container.state || "unknown"}</span>
                      <small>{container.shortId || container.id?.slice(0, 12)}</small>
                    </button>
                  ))}
                </div>
              </article>
            ) : null}
          </div>
        ) : null}

        {detailTab === "logs" ? (
          <article className="panel deploy-logs-workspace">
            <div className="deploy-logs-toolbar">
              <div aria-label="日志类型" className="deploy-log-subtabs" role="tablist">
                {LOG_TABS.map((tab) => (
                  <button
                    aria-selected={logTab === tab.id}
                    className={`deploy-log-subtab${logTab === tab.id ? " active" : ""}`}
                    key={tab.id}
                    onClick={() => setLogTab(tab.id)}
                    role="tab"
                    type="button"
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
              <button className="ghost-btn" onClick={() => setLogKey((value) => value + 1)} type="button">
                刷新
              </button>
            </div>

            <div className="deploy-logs-panel-shell">
              {logTab === "build" ? (
                <DeployLogPanel appId={appId} height="fill" key={logKey} />
              ) : (
                <ContainerLogsSection
                  appId={appId}
                  compact
                  containers={status.containers || []}
                  height="fill"
                  key={logKey}
                  running={Boolean(status.running)}
                />
              )}
            </div>
          </article>
        ) : null}

        {detailTab === "history" ? (
          <article className="panel deploy-history-panel">
            <div className="deploy-overview-panel-head">
              <h3>事件记录</h3>
              <span className="deploy-history-count">最近 {Math.min(status.history?.length || 0, 20)} 条</span>
            </div>
            <EventHistory history={status.history || []} />
          </article>
        ) : null}
      </div>
    </div>
  );
}

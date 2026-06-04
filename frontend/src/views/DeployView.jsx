import { useCallback, useEffect, useState } from "react";
import {
  dismissFromDeployList,
  getDeployStatus,
  restartDeploy,
  stopDeploy,
  triggerDeploy,
} from "../lib/api.js";
import { useApp } from "../context/AppContext.jsx";
import { DeployDetailView } from "./DeployDetailView.jsx";
import { EmptyState, StatusPill } from "../components/ui.jsx";

function DeployCard({ app, overview, onOpen, onRemove }) {
  const pill = overview?.deploying
    ? { text: "部署中", className: "preview" }
    : overview?.running
      ? { text: "运行中", className: "deployed" }
      : overview?.lastDeployAt
        ? { text: "已停止", className: "idle" }
        : { text: "未部署", className: "idle" };
  const deployUrl = overview?.deployUrl || `http://127.0.0.1:8089/deploy/${app.id}/`;

  return (
    <article
      className="deployed-app-item"
      onClick={() => onOpen(app.id)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpen(app.id);
        }
      }}
      role="button"
      tabIndex={0}
    >
      <button
        aria-label={`从部署列表移除 ${app.name}`}
        className="app-card-delete"
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          onRemove(app.id);
        }}
        title="从列表移除"
        type="button"
      >
        ×
      </button>
      <div className="deploy-card-top">
        <div>
          <strong>{app.name}</strong>
          <small>{app.teamName || "默认团队"}</small>
        </div>
        <StatusPill className={pill.className}>{pill.text}</StatusPill>
      </div>
      <div className="deploy-card-url">{deployUrl}</div>
      <div className="deploy-card-meta">
        <span>{overview?.lastDeployLabel || "尚未部署"}</span>
        <span>{app.slug}</span>
      </div>
    </article>
  );
}

export function DeployView({ active }) {
  const {
    apps,
    deployListApps,
    getDeployOverviewFor,
    isAppDeployed,
    refreshDeployOverview,
    setView,
  } = useApp();
  const [detailAppId, setDetailAppId] = useState(null);
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(false);

  const refreshDetail = useCallback(async (appId) => {
    const nextStatus = await getDeployStatus(appId);
    setStatus(nextStatus);
    return nextStatus;
  }, []);

  useEffect(() => {
    if (!detailAppId) return undefined;

    let cancelled = false;
    setLoading(true);
    refreshDetail(detailAppId)
      .catch((error) => window.alert(error.message || "加载部署详情失败"))
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [detailAppId, refreshDetail]);

  useEffect(() => {
    if (!detailAppId || !status?.deploying) return undefined;

    const timer = window.setInterval(() => {
      refreshDetail(detailAppId)
        .then(() => refreshDeployOverview())
        .catch(() => {});
    }, 3000);

    return () => clearInterval(timer);
  }, [detailAppId, refreshDeployOverview, refreshDetail, status?.deploying]);

  async function handleDismissFromList(appId) {
    const app = apps.find((item) => item.id === appId);

    if (isAppDeployed(appId)) {
      window.alert("该应用正在生产环境运行或部署中，请先在详情页停止后再从列表移除。");
      return;
    }

    if (
      !window.confirm(
        `确定将“${app?.name || appId}”从部署管理列表移除吗？应用本身会保留，可在应用管理中继续编辑。`,
      )
    ) {
      return;
    }

    try {
      await dismissFromDeployList(appId);
      await refreshDeployOverview();
      if (detailAppId === appId) {
        setDetailAppId(null);
        setStatus(null);
      }
    } catch (error) {
      window.alert(error.message || "从列表移除失败");
    }
  }

  async function runDeployAction(action) {
    if (!detailAppId) return;
    try {
      if (action === "toggle") {
        if (status?.running) await stopDeploy(detailAppId);
        else await triggerDeploy(detailAppId);
      } else if (action === "restart") {
        await restartDeploy(detailAppId);
      } else if (action === "deploy") {
        await triggerDeploy(detailAppId);
      }
      await refreshDetail(detailAppId);
      await refreshDeployOverview();
    } catch (error) {
      window.alert(error.message || "操作失败");
    }
  }

  const hiddenCount = apps.length - deployListApps.length;
  const app = apps.find((item) => item.id === detailAppId);

  if (detailAppId) {
    return (
      <section className={`view${active ? " active" : ""}`} id="deployView">
        <DeployDetailView
          app={app}
          appId={detailAppId}
          loading={loading}
          onBack={() => {
            setDetailAppId(null);
            setStatus(null);
            refreshDeployOverview().catch(() => {});
          }}
          onDeployAction={runDeployAction}
          status={status}
        />
      </section>
    );
  }

  return (
    <section className={`view${active ? " active" : ""}`} id="deployView">
      <div className="deploy-list-view">
        <div className="section-heading">
          <div>
            <h2>应用部署</h2>
            <p>
              点击卡片进入详情，按「概览 / 日志 / 历史」分区查看。
              {hiddenCount ? ` 另有 ${hiddenCount} 个应用不在列表中。` : ""}
            </p>
          </div>
          <button className="primary-btn" onClick={() => setView("create")} type="button">
            部署新应用
          </button>
        </div>
        <div className="deployed-app-card-grid">
          {deployListApps.length ? (
            deployListApps.map((item) => (
              <DeployCard
                app={item}
                key={item.id}
                onOpen={setDetailAppId}
                onRemove={handleDismissFromList}
                overview={getDeployOverviewFor(item.id)}
              />
            ))
          ) : (
            <EmptyState>
              {apps.length
                ? "部署列表为空。再次部署应用后会自动加入此列表。"
                : "暂无应用。请先创建一个应用。"}
            </EmptyState>
          )}
        </div>
      </div>
    </section>
  );
}

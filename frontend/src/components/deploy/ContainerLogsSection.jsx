import { useEffect, useMemo, useState } from "react";
import { ContainerLogPanel } from "./ContainerLogPanel.jsx";
import { EmptyState, StatusPill } from "../ui.jsx";

const DEFAULT_LOG_HEIGHT = 480;

function containerLabel(container) {
  if (container.service) return container.service;
  if (container.name) return container.name;
  return container.shortId || container.id?.slice(0, 12) || "容器";
}

function containerStateTone(state) {
  if (state === "running") return { className: "deployed", text: "运行中" };
  if (state === "exited") return { className: "idle", text: "已退出" };
  if (state === "restarting") return { className: "preview", text: "重启中" };
  return { className: "idle", text: state || "未知" };
}

export function ContainerLogsSection({
  appId,
  containers = [],
  running = false,
  compact = false,
  height = DEFAULT_LOG_HEIGHT,
}) {
  const [activeId, setActiveId] = useState(null);
  const [refreshToken, setRefreshToken] = useState(0);

  const sortedContainers = useMemo(
    () => [...containers].sort((left, right) => {
      if (left.state === "running" && right.state !== "running") return -1;
      if (right.state === "running" && left.state !== "running") return 1;
      return containerLabel(left).localeCompare(containerLabel(right));
    }),
    [containers],
  );

  useEffect(() => {
    if (!sortedContainers.length) {
      setActiveId(null);
      return;
    }

    if (!activeId || !sortedContainers.some((item) => item.id === activeId)) {
      setActiveId(sortedContainers[0].id);
    }
  }, [activeId, sortedContainers]);

  const activeContainer = sortedContainers.find((item) => item.id === activeId) || null;

  if (!sortedContainers.length) {
    return (
      <EmptyState>
        {running ? "容器正在启动，请稍后刷新。" : "暂无容器。启动部署后可在此查看各容器日志。"}
      </EmptyState>
    );
  }

  return (
    <div className={`container-logs-section${compact ? " compact" : ""}`}>
      <div className="container-log-tabs" role="tablist">
        {sortedContainers.map((container) => {
          const tone = containerStateTone(container.state);
          const selected = container.id === activeId;

          return (
            <button
              aria-selected={selected}
              className={`container-log-tab${selected ? " active" : ""}`}
              key={container.id}
              onClick={() => setActiveId(container.id)}
              role="tab"
              type="button"
            >
              <span className="container-log-tab-label">{containerLabel(container)}</span>
              <StatusPill className={tone.className}>{tone.text}</StatusPill>
              <small>{container.shortId || container.id?.slice(0, 12)}</small>
            </button>
          );
        })}
      </div>

      <div className="container-log-toolbar">
        <span className="container-log-meta">
          {activeContainer?.image ? `镜像 ${activeContainer.image}` : "容器运行日志"}
          {activeContainer?.status ? ` · ${activeContainer.status}` : ""}
          {activeContainer?.state === "running" ? " · 自动刷新" : ""}
        </span>
        {!compact ? (
          <button
            className="ghost-btn"
            onClick={() => setRefreshToken((value) => value + 1)}
            type="button"
          >
            刷新
          </button>
        ) : null}
      </div>

      {activeContainer ? (
        <ContainerLogPanel
          appId={appId}
          autoRefresh={activeContainer.state === "running"}
          compact={compact}
          container={activeContainer}
          height={height}
          refreshToken={refreshToken}
        />
      ) : null}
    </div>
  );
}

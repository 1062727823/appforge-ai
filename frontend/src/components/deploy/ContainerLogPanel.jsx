import { useCallback, useEffect, useState } from "react";
import { LazyLog } from "react-lazylog";
import { getDeployContainerLogs } from "../../lib/api.js";

const DEFAULT_LOG_HEIGHT = 280;
const FILL_LOG_HEIGHT = 480;

const LOG_THEME = {
  base00: "#0b1220",
  base01: "#1e293b",
  base02: "#334155",
  base03: "#64748b",
  base04: "#94a3b8",
  base05: "#cbd5e1",
  base06: "#e2e8f0",
  base07: "#f8fafc",
  base08: "#fca5a5",
  base09: "#fdba74",
  base0A: "#fde047",
  base0B: "#86efac",
  base0C: "#67e8f9",
  base0D: "#93c5fd",
  base0E: "#c4b5fd",
  base0F: "#f9a8d4",
};

export function ContainerLogPanel({
  appId,
  container,
  autoRefresh = false,
  refreshToken = 0,
  height = DEFAULT_LOG_HEIGHT,
  compact = false,
}) {
  const logHeight = height === "fill" ? FILL_LOG_HEIGHT : height;
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [tail, setTail] = useState(300);

  const loadLogs = useCallback(async () => {
    if (!appId || !container?.id) return;

    setLoading(true);
    setError("");
    try {
      const payload = await getDeployContainerLogs(appId, container.id, { tail: 300 });
      setText(payload.log || "");
      setTail(payload.tail || 300);
    } catch (loadError) {
      setError(loadError.message || "加载容器日志失败");
    } finally {
      setLoading(false);
    }
  }, [appId, container?.id]);

  useEffect(() => {
    loadLogs();
  }, [loadLogs, refreshToken]);

  useEffect(() => {
    if (!autoRefresh || !container?.id) return undefined;

    const timer = window.setInterval(() => {
      loadLogs();
    }, 5000);

    return () => clearInterval(timer);
  }, [autoRefresh, container?.id, loadLogs]);

  const displayText = error
    || text.trim()
    || (loading ? "加载容器日志…" : "暂无日志输出。");

  return (
    <div className={`container-log-panel${compact ? " compact" : ""}`}>
      {!compact ? (
        <p className="deploy-log-react-hint">
          {container?.service || container?.name || container?.shortId || "容器"}
          {container?.state ? ` · ${container.state}` : ""}
          {tail ? ` · 最近 ${tail} 行` : ""}
          {loading ? " · 刷新中" : ""}
          {autoRefresh ? " · 自动刷新" : ""}
        </p>
      ) : null}
      <div className="deploy-log-lazylog-shell">
        <LazyLog
          caseInsensitive
          enableSearch
          extraLines={1}
          follow={autoRefresh}
          height={logHeight}
          selectableLines
          stream={autoRefresh}
          text={displayText}
          theme={LOG_THEME}
        />
      </div>
    </div>
  );
}

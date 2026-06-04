import { useEffect, useMemo, useState } from "react";
import { LazyLog } from "react-lazylog";

const DEFAULT_LOG_HEIGHT = 320;
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

function formatHint({ deploying, hasBuildLog, hasRuntimeLog, tail, connected }) {
  if (!connected) return "正在连接日志流…";
  const parts = [];
  if (deploying) parts.push("部署进行中");
  if (hasBuildLog) parts.push("含构建日志");
  if (hasRuntimeLog) parts.push(`含运行日志 (${tail} 行)`);
  return parts.length ? parts.join(" · ") : "构建输出与容器运行日志";
}

export function DeployLogPanel({ appId, height = DEFAULT_LOG_HEIGHT }) {
  const logHeight = height === "fill" ? FILL_LOG_HEIGHT : height;
  const [text, setText] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [connected, setConnected] = useState(false);
  const [meta, setMeta] = useState({
    deploying: false,
    hasBuildLog: false,
    hasRuntimeLog: false,
    tail: 300,
  });

  useEffect(() => {
    if (!appId) return undefined;

    setText("");
    setStreaming(false);
    setConnected(false);
    setMeta({
      deploying: false,
      hasBuildLog: false,
      hasRuntimeLog: false,
      tail: 300,
    });

    const endpoint = `/api/apps/${encodeURIComponent(appId)}/deploy/logs/stream`;
    const source = new EventSource(endpoint);

    const appendText = (chunk) => {
      if (!chunk) return;
      setText((current) => `${current}${chunk}`);
    };

    source.addEventListener("snapshot", (event) => {
      const payload = JSON.parse(event.data || "{}");
      if (payload.text) {
        setText(payload.text);
        setMeta((current) => ({
          ...current,
          hasBuildLog: Boolean(payload.text?.trim()),
        }));
      }
    });

    source.addEventListener("chunk", (event) => {
      const payload = JSON.parse(event.data || "{}");
      appendText(payload.text);
      setMeta((current) => ({ ...current, hasBuildLog: true }));
    });

    source.addEventListener("runtime", (event) => {
      const payload = JSON.parse(event.data || "{}");
      if (!payload.text?.trim()) return;
      setText((current) => {
        const prefix = current.trim()
          ? `\n\n# 容器运行日志 (最近 ${payload.tail || 300} 行)\n`
          : `# 容器运行日志 (最近 ${payload.tail || 300} 行)\n`;
        return `${current}${prefix}${payload.text}`;
      });
      setMeta((current) => ({
        ...current,
        hasRuntimeLog: true,
        tail: payload.tail || current.tail,
      }));
    });

    source.addEventListener("phase", (event) => {
      const payload = JSON.parse(event.data || "{}");
      if (payload.status === "start") {
        setStreaming(true);
        appendText(`\n=== ${payload.phase} ${new Date(payload.at || Date.now()).toISOString()} ===\n`);
      }
      if (payload.status === "end" && payload.exitCode !== undefined) {
        appendText(`\n[exit ${payload.exitCode}]\n`);
      }
      setMeta((current) => ({
        ...current,
        deploying: payload.deploying ?? current.deploying,
      }));
    });

    source.addEventListener("status", (event) => {
      const payload = JSON.parse(event.data || "{}");
      setMeta((current) => ({
        ...current,
        deploying: Boolean(payload.deploying),
      }));
      setStreaming(Boolean(payload.deploying));
    });

    source.addEventListener("done", (event) => {
      const payload = JSON.parse(event.data || "{}");
      setStreaming(false);
      setMeta((current) => ({
        ...current,
        deploying: Boolean(payload.deploying),
      }));
    });

    source.onopen = () => {
      setConnected(true);
    };

    source.onerror = () => {
      if (source.readyState === EventSource.CLOSED) {
        setConnected(false);
        setStreaming(false);
      }
    };

    return () => {
      source.close();
    };
  }, [appId]);

  const hint = useMemo(() => formatHint({ ...meta, connected }), [connected, meta]);

  const displayText =
    text.trim() ||
    (connected ? "暂无日志。执行「部署新版本」后，可在此查看实时构建与容器输出。" : "连接日志流…");

  return (
    <div className="deploy-log-react">
      <p className="deploy-log-react-hint">{hint}</p>
      <div className="deploy-log-lazylog-shell">
        <LazyLog
          caseInsensitive
          enableSearch
          extraLines={1}
          follow={streaming}
          height={logHeight}
          selectableLines
          stream={streaming}
          text={displayText}
          theme={LOG_THEME}
        />
      </div>
    </div>
  );
}

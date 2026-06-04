import { useEffect, useRef, useState } from "react";
import {
  getIdeSession,
  getRunPreviewUrl,
  getRunStatus,
  streamRunLogs,
  streamStopLogs,
  streamCompileLogs,
} from "../lib/api.js";
import { bootstrapEditorWorkspace } from "../lib/editorBootstrap.js";
import { useApp } from "../context/AppContext.jsx";

async function resolvePreviewUrl(appId, statusPayload = null) {
  if (statusPayload?.directUrl) return statusPayload.directUrl;
  if (statusPayload?.gatewayUrl) return statusPayload.gatewayUrl;
  try {
    const payload = await getRunPreviewUrl(appId);
    return payload?.gatewayUrl || payload?.directUrl || payload?.url || "";
  } catch {
    return "";
  }
}

const statusLabels = {
  build_started: "正在构建镜像...", build_done: "构建完成", build_failed: "构建失败",
  no_image: "未找到镜像", up_started: "正在启动容器...", up_done: "运行中", up_failed: "启动失败",
  stop_started: "正在停止...", stop_done: "已停止", error: "出错",
};

export function useEditorControls(activeAppId) {
  const [running, setRunning] = useState(false);
  const [previewUrl, setPreviewUrl] = useState("");
  const [resultModal, setResultModal] = useState(null); // { title, lines }
  const eventSourceRef = useRef(null);

  useEffect(() => () => eventSourceRef.current?.close(), []);

  useEffect(() => {
    if (!activeAppId) { setRunning(false); setPreviewUrl(""); return; }
    getRunStatus(activeAppId, { touch: true })
      .then(async (status) => {
        if (status.running) {
          const url = await resolvePreviewUrl(activeAppId, status);
          setRunning(true); setPreviewUrl(url);
        }
      }).catch(() => {});
  }, [activeAppId]);

  function startRun(rebuild) {
    if (!activeAppId) return;
    eventSourceRef.current?.close();
    setRunning(true);
    const title = rebuild ? "重新构建并运行" : "运行";
    const linesRef = { current: [] };
    setResultModal({ title, lines: [] }); // 立刻显示空弹窗

    const update = () => { setResultModal({ title, lines: [...linesRef.current] }); };

    let hasFailed = false;
    const sse = streamRunLogs(activeAppId, {
      rebuild,
      onLog: (text) => { linesRef.current.push(text); update(); },
      onStatus: (text) => {
        linesRef.current.push(`[${statusLabels[text] || text}]`);
        update();
        if (text === "no_image" || text === "build_failed" || text === "up_failed") {
          setRunning(false);
          hasFailed = true;
        }
      },
      onError: (text) => { linesRef.current.push(`[错误] ${text}`); update(); setRunning(false); hasFailed = true; },
      onDone: () => {
        if (!hasFailed) {
          update();
          resolvePreviewUrl(activeAppId).then(setPreviewUrl);
        }
      },
    });
    eventSourceRef.current = sse;
  }

  function stopRun() {
    if (!activeAppId) return;
    eventSourceRef.current?.close();
    const lines = [];
    setResultModal({ title: "停止", lines: [] });

    const sse = streamStopLogs(activeAppId, {
      onLog: (text) => { lines.push(text); setResultModal({ title: "停止", lines: [...lines] }); },
      onStatus: (text) => { lines.push(`[${statusLabels[text] || text}]`); setResultModal({ title: "停止", lines: [...lines] }); },
      onError: (text) => { lines.push(`[错误] ${text}`); setResultModal({ title: "停止", lines: [...lines] }); },
      onDone: () => { setRunning(false); setPreviewUrl(""); },
    });
    eventSourceRef.current = sse;
  }

  function openPreview() {
    if (!previewUrl) { window.alert("未找到预览地址"); return; }
    window.open(previewUrl, "_blank", "noopener,noreferrer");
  }

  function compile() {
    if (!activeAppId) return;
    eventSourceRef.current?.close();
    const lines = [];
    setResultModal({ title: "编译", lines: [] });

    const sse = streamCompileLogs(activeAppId, {
      onLog: (text) => { lines.push(text); setResultModal({ title: "编译", lines: [...lines] }); },
      onStatus: (text) => { lines.push(`[${statusLabels[text] || text}]`); setResultModal({ title: "编译", lines: [...lines] }); },
      onError: (text) => { lines.push(`[错误] ${text}`); setResultModal({ title: "编译", lines: [...lines] }); },
      onDone: () => {},
    });
    eventSourceRef.current = sse;
  }

  return { running, previewUrl, previewEnabled: Boolean(previewUrl),
           resultModal, setResultModal, startRun, stopRun, openPreview, compile };
}

function ResultModal({ modal, onClose }) {
  console.log("[ResultModal] rendering, modal=", modal);
  if (!modal) return null;
  return (
    <div className="result-modal-overlay" onClick={onClose}>
      <div className="result-modal" onClick={(e) => e.stopPropagation()}>
        <div className="result-modal-header">
          <strong>{modal.title} — 执行结果</strong>
          <button className="result-modal-close" onClick={onClose}>×</button>
        </div>
        <div className="result-modal-body">
          {modal.lines.map((line, i) => (
            <div key={i} className="log-line">{line}</div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function EditorView({ active, editorControls }) {
  const { activeAppId, setView } = useApp();
  const [frameSrc, setFrameSrc] = useState("");
  const [loadError, setLoadError] = useState("");
  const { resultModal, setResultModal } = editorControls || {};

  useEffect(() => {
    if (!active || !activeAppId) { setFrameSrc(""); return undefined; }
    let cancelled = false;
    async function load() {
      setLoadError("");
      try {
        await bootstrapEditorWorkspace(activeAppId);
        const session = await getIdeSession(activeAppId);
        if (!cancelled) setFrameSrc(session.url);
      } catch (error) {
        if (!cancelled) { setLoadError(error.message || "编辑器加载失败"); setFrameSrc(""); }
      }
    }
    load();
    return () => { cancelled = true; setFrameSrc(""); };
  }, [active, activeAppId]);

  if (!activeAppId) {
    return (
      <section className={`view${active ? " active" : ""}`} id="editorView">
        <div className="empty-state">请先从应用管理或创建页打开一个应用。</div>
        <button className="ghost-btn" onClick={() => setView("dashboard")} type="button">返回应用管理</button>
      </section>
    );
  }

  return (
    <section className={`view${active ? " active" : ""}`} id="editorView">
      <div className="editor-shell web-ide-shell">
        <section className="code-pane web-ide-pane">
          {loadError ? <div className="empty-state">{loadError}</div> : null}
          <iframe
            allow="clipboard-read; clipboard-write"
            className="code-server-frame"
            src={frameSrc || undefined}
            title="AppForge Web IDE"
          />
        </section>
        <ResultModal modal={resultModal} onClose={() => setResultModal(null)} />
      </div>
    </section>
  );
}

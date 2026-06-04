export async function triggerAppRun(appId, action = "start") {
  const response = await fetch(`/api/apps/${encodeURIComponent(appId)}/run/trigger`, {
    body: JSON.stringify({ action }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error || "Run trigger failed");
  }
  return response.json();
}

export async function getRunSpec(appId) {
  const response = await fetch(`/api/apps/${encodeURIComponent(appId)}/run/spec`);
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error || "Load run spec failed");
  }
  return response.json();
}

export async function getRunPreviewUrl(appId) {
  const response = await fetch(`/api/apps/${encodeURIComponent(appId)}/run/preview-url`);
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error || "Load preview URL failed");
  }
  return response.json();
}

export async function getRunStatus(appId, { touch = false } = {}) {
  const response = await fetch(`/api/apps/${encodeURIComponent(appId)}/run/status${touch ? "?touch=1" : ""}`);
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error || "Get run status failed");
  }
  return response.json();
}

export async function stopAppContainers(appId) {
  const response = await fetch(`/api/apps/${encodeURIComponent(appId)}/run/stop`, { method: "POST" });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error || "Stop failed");
  }
  return response.json();
}

// === Apps & Settings ===
export async function listApps() {
  const response = await fetch("/api/apps");
  if (!response.ok) throw new Error("Failed to list apps");
  return response.json();
}

export async function createApp(body) {
  const response = await fetch("/api/apps", {
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
  if (!response.ok) { const p = await response.json().catch(() => ({})); throw new Error(p.error || "Create app failed"); }
  return response.json();
}

export async function updateApp(appId, body) {
  const response = await fetch(`/api/apps/${encodeURIComponent(appId)}`, {
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
    method: "PUT",
  });
  if (!response.ok) { const p = await response.json().catch(() => ({})); throw new Error(p.error || "Update app failed"); }
  return response.json();
}

export async function deleteApp(appId) {
  const response = await fetch(`/api/apps/${encodeURIComponent(appId)}`, { method: "DELETE" });
  if (!response.ok) { const p = await response.json().catch(() => ({})); throw new Error(p.error || "Delete app failed"); }
  return response.json();
}

export async function getCreateOptions() {
  const response = await fetch("/api/create-options");
  if (!response.ok) throw new Error("Failed to load create options");
  return response.json();
}

export async function getSettings() {
  const response = await fetch("/api/settings");
  if (!response.ok) throw new Error("Failed to load settings");
  return response.json();
}

export async function updateSettings(body) {
  const response = await fetch("/api/settings", {
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
    method: "PUT",
  });
  if (!response.ok) { const p = await response.json().catch(() => ({})); throw new Error(p.error || "Update settings failed"); }
  return response.json();
}

export async function startWorkspaceSync(appId, force = false) {
  const response = await fetch(`/api/apps/${encodeURIComponent(appId)}/workspace-sync?force=${force}`, { method: "POST" });
  if (!response.ok) { const p = await response.json().catch(() => ({})); throw new Error(p.error || "Workspace sync failed"); }
  return response.json();
}

export async function getDeployOverview() { return { apps: [], runs: [] }; }
export async function closeAgentSession() {}
export async function getDeployContainerLogs() { return ""; }
export async function getDeployStatus() { return { running: false }; }
export async function dismissFromDeployList() {}
export async function stopDeploy() {}
export async function triggerDeploy() {}
export async function restartDeploy() {}
export async function getDeployLogs() { return []; }
export async function getDeployDetail() { return {}; }

export async function getIdeSession(appId) {
  const response = await fetch(`/api/apps/${encodeURIComponent(appId)}/ide`);
  if (!response.ok) { const p = await response.json().catch(() => ({})); throw new Error(p.error || "Get IDE session failed"); }
  return response.json();
}

// SSE-based run logging: connects to start-logs SSE, collects output,
// polls getRunStatus to detect when build+up is done.
export function streamRunLogs(appId, { onLog, onStatus, onError, onDone, rebuild = false }) {
  let aborted = false;
  let statusPoll = null;
  const lines = [];

  // Connect to SSE via EventSource for real-time log streaming
  const params = rebuild ? "?rebuild=true" : "";
  const es = new EventSource(`/api/apps/${encodeURIComponent(appId)}/run/start-logs${params}`);

  es.addEventListener("log", (e) => {
    const data = JSON.parse(e.data);
    lines.push(data.text);
    onLog?.(data.text);
  });
  es.addEventListener("status", (e) => {
    const data = JSON.parse(e.data);
    onStatus?.(data.text);
    // When done signal received from server, start polling for run status
    if (data.text === "done" || data.text === "up_done") {
      startStatusPoll();
    }
  });
  es.addEventListener("error", (e) => {
    try { const data = JSON.parse(e.data); onError?.(data.text); } catch {}
  });
  es.onerror = () => {
    // EventSource closed - start polling if not already
    startStatusPoll();
  };

  function startStatusPoll() {
    if (statusPoll) return;
    statusPoll = setInterval(async () => {
      if (aborted) { clearInterval(statusPoll); return; }
      try {
        const status = await getRunStatus(appId);
        if (status.running) {
          clearInterval(statusPoll);
          es.close();
          onStatus?.("up_done");
          onDone?.();
        }
      } catch { /* retry */ }
    }, 2000);
    // Stop polling after 3 minutes
    setTimeout(() => { if (statusPoll) { clearInterval(statusPoll); onDone?.(); } }, 180000);
  }

  return { close: () => { aborted = true; es.close(); if (statusPoll) clearInterval(statusPoll); } };
}

export function streamCompileLogs(appId, { onLog, onStatus, onError, onDone }) {
  const es = new EventSource(`/api/apps/${encodeURIComponent(appId)}/compile`);
  es.addEventListener("log", (e) => { const d = JSON.parse(e.data); onLog?.(d.text); });
  es.addEventListener("status", (e) => { const d = JSON.parse(e.data); onStatus?.(d.text); });
  es.addEventListener("error", (e) => { try { const d = JSON.parse(e.data); onError?.(d.text); } catch {} });
  es.onerror = () => { es.close(); onDone?.(); };
  return { close: () => es.close() };
}

export function streamStopLogs(appId, { onLog, onStatus, onError, onDone }) {
  let aborted = false;

  const es = new EventSource(`/api/apps/${encodeURIComponent(appId)}/run/stop-logs`);
  es.addEventListener("log", (e) => {
    const data = JSON.parse(e.data);
    onLog?.(data.text);
  });
  es.addEventListener("status", (e) => {
    const data = JSON.parse(e.data);
    onStatus?.(data.text);
  });
  es.addEventListener("error", (e) => {
    try { const data = JSON.parse(e.data); onError?.(data.text); } catch {}
  });
  es.onerror = () => {
    es.close();
    if (!aborted) onDone?.();
  };

  return { close: () => { aborted = true; es.close(); } };
}

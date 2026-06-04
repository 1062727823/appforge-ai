const path = require("path");
const vscode = require("vscode");
const { registerRunTriggerWatcher, runAppInTerminal, stopAppRun } = require("./runApp");

const output = vscode.window.createOutputChannel("AppForge Agent");

function getWorkspaceFolder() {
  return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || "";
}

function getAppIdFromWorkspace() {
  const workspacePath = getWorkspaceFolder();
  const marker = `${path.sep}workspaces${path.sep}`;
  const markerIndex = workspacePath.indexOf(marker);
  if (markerIndex === -1) return "";

  const relative = workspacePath.slice(markerIndex + marker.length);
  return relative.split(path.sep)[0] || "";
}

function getActiveFile() {
  const editor = vscode.window.activeTextEditor;
  if (!editor) return "";

  const workspacePath = getWorkspaceFolder();
  const filePath = editor.document.uri.fsPath;
  return workspacePath ? path.relative(workspacePath, filePath).replace(/\\/g, "/") : filePath;
}

function getSelectionText() {
  const editor = vscode.window.activeTextEditor;
  if (!editor || editor.selection.isEmpty) return "";
  return editor.document.getText(editor.selection);
}

async function closeAgentSession() {
  const appId = getAppIdFromWorkspace();
  if (!appId) {
    throw new Error("Cannot infer AppForge appId from the current workspace. Open this IDE from AppForge.");
  }

  const apiUrl = process.env.APPFORGE_API_URL || "http://api:4173";
  const endpoint = `${apiUrl}/api/apps/${encodeURIComponent(appId)}/agent/session/close`;
  output.appendLine(`[AppForge] POST ${endpoint}`);

  const response = await fetch(endpoint, { method: "POST" });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || `Failed to close agent session (${response.status})`);
  }

  output.appendLine("[AppForge] Agent session closed");
  return payload;
}

async function startAgentRun(prompt, activeFile) {
  const appId = getAppIdFromWorkspace();
  if (!appId) {
    throw new Error("Cannot infer AppForge appId from the current workspace. Open this IDE from AppForge.");
  }

  const apiUrl = process.env.APPFORGE_API_URL || "http://api:4173";
  const endpoint = `${apiUrl}/api/apps/${encodeURIComponent(appId)}/agent-runs`;
  output.appendLine(`[AppForge] POST ${endpoint}`);
  output.appendLine(`[AppForge] activeFile=${activeFile || "(none)"}`);

  const response = await fetch(endpoint, {
    body: JSON.stringify({ activeFile, prompt }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || `Agent run failed with HTTP ${response.status}`);
  }

  const taskId = payload.id || payload.taskId;
  output.appendLine(`[AppForge] Agent task started: ${taskId}`);
  return {
    apiUrl,
    taskId,
  };
}

async function stopAgentRun(taskId) {
  const appId = getAppIdFromWorkspace();
  if (!appId) {
    throw new Error("Cannot infer AppForge appId from the current workspace. Open this IDE from AppForge.");
  }
  if (!taskId) {
    throw new Error("No active agent task to stop.");
  }

  const apiUrl = process.env.APPFORGE_API_URL || "http://api:4173";
  const endpoint = `${apiUrl}/api/apps/${encodeURIComponent(appId)}/agent-runs/${encodeURIComponent(taskId)}/stop`;
  output.appendLine(`[AppForge] POST ${endpoint}`);

  const response = await fetch(endpoint, { method: "POST" });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || `Failed to stop agent run (${response.status})`);
  }

  output.appendLine(`[AppForge] Agent task stopped: ${taskId}`);
  return payload;
}

async function streamTaskEvents({ apiUrl, onEvent, signal, taskId, webview }) {
  const endpoint = `${apiUrl}/api/tasks/${encodeURIComponent(taskId)}/events`;
  output.appendLine(`[AppForge] SSE ${endpoint}`);
  const fs = require("fs");
  const log = (msg) => { try { fs.appendFileSync("/tmp/ext-debug.log", new Date().toISOString() + " SSE: " + msg + "\n"); } catch(e) {} };
  log("connecting to " + endpoint);

  const response = await fetch(endpoint, { signal });
  log("fetch returned status=" + response.status + " hasBody=" + !!response.body);
  if (!response.ok || !response.body) {
    throw new Error(`Unable to stream task events: HTTP ${response.status}`);
  }

  const decoder = new TextDecoder();
  let buffer = "";
  let eventName = "message";
  let eventData = "";
  let finished = false;

  const flush = () => {
    if (!eventData) {
      eventName = "message";
      return;
    }

    const raw = eventData.replace(/\n$/, "");
    eventData = "";
    const name = eventName;
    eventName = "message";

    let payload = {};
    try {
      payload = JSON.parse(raw);
    } catch {
      payload = {};
    }

    const body = payload || {};
    const emit = (type, text) => {
      if (webview) webview.postMessage({ text, type });
      if (onEvent) onEvent(type, text);
    };

    if (name === "agent_message" && body.text) {
      log("emit assistant: " + String(body.text).slice(0,50));
      emit("assistant", body.text);
    } else if (name === "task_completed") {
      log("emit done");
      emit("done", "Done");
      finished = true;
    } else if (name === "task_failed") {
      log("emit error: " + (body.message || "failed"));
      emit("error", body.message || "Task failed");
      finished = true;
    } else if (name === "step_started" && body.step && body.step !== "thinking" && body.step !== "cursor_sdk") {
      log("emit activity: " + (body.message || body.step));
      emit("activity", body.message || body.step);
    } else if (name === "command_output") {
      emit("activity", body.command || "command");
    } else if (name === "files_changed") {
      const count = Array.isArray(body.files) ? body.files.length : 0;
      emit("activity", `${count} files changed`);
    } else if (name === "task_completed") {
      emit("done", "Done");
      finished = true;
    } else if (name === "task_failed") {
      emit("error", body.message || "Task failed");
      finished = true;
    }
  };

  for await (const chunk of response.body) {
    if (finished) break;
    buffer += decoder.decode(chunk, { stream: true });
    let index;
    while ((index = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, index).replace(/\r$/, "");
      buffer = buffer.slice(index + 1);

      if (!line) {
        flush();
      } else if (line.startsWith("event:")) {
        eventName = line.slice(6).trim();
      } else if (line.startsWith("data:")) {
        eventData += `${line.slice(5).trimStart()}\n`;
      }
    }
    if (finished) break;
  }

  await response.body.cancel?.().catch(() => {});
}

async function askAgent({ includeSelection = false } = {}) {
  const activeFile = getActiveFile();
  const selection = includeSelection ? getSelectionText() : "";
  const prompt = await vscode.window.showInputBox({
    ignoreFocusOut: true,
    placeHolder: "Ask Cursor Agent to edit, explain, or run a task",
    prompt: activeFile ? `Current file: ${activeFile}` : "Enter a request for AppForge Cursor Agent",
  });

  if (!prompt?.trim()) return;

  const finalPrompt = selection
    ? `${prompt.trim()}\n\nSelected code from ${activeFile}:\n\`\`\`\n${selection}\n\`\`\``
    : prompt.trim();

  await startAgentRun(finalPrompt, activeFile);
}

async function handleNativeChatRequest(request, context, stream) {
  const activeFile = getActiveFile();
  const selection = getSelectionText();
  const prompt = String(request.prompt || "").trim();
  const finalPrompt = selection
    ? `${prompt}\n\nSelected code from ${activeFile}:\n\`\`\`\n${selection}\n\`\`\``
    : prompt;

  if (!finalPrompt) {
    stream.markdown("Tell me what you want to edit, explain, or run.");
    return;
  }

  const run = await startAgentRun(finalPrompt, activeFile);
  let streamedText = "";
  let wroteAssistant = false;

  if (stream.progress) stream.progress("AppForge Agent started. Calling Cursor SDK...");

  await streamTaskEvents({
    ...run,
    onEvent: (type, text) => {
      if (type === "assistant") {
        const next = String(text || "");
        const delta = next.startsWith(streamedText) ? next.slice(streamedText.length) : next;
        streamedText = next.startsWith(streamedText) ? next : `${streamedText}${next}`;
        if (delta) {
          wroteAssistant = true;
          stream.markdown(delta);
        }
      } else if (type === "activity") {
        if (stream.progress) stream.progress(String(text || ""));
      } else if (type === "error") {
        stream.markdown(`\n\n**Failed:** ${String(text || "Task failed")}`);
      } else if (type === "done" && !wroteAssistant) {
        stream.markdown("Done.");
      }
    },
  });
}

class AgentViewProvider {
  constructor(extensionUri) {
    this.extensionUri = extensionUri;
    this.activeRun = null;
  }

  resolveWebviewView(webviewView) {
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.extensionUri],
    };
    webviewView.webview.html = this.html(webviewView.webview);
    webviewView.webview.onDidReceiveMessage(async (message) => {
      if (message?.type === "close") {
        webviewView.webview.postMessage({ text: "正在关闭 Agent 会话…", type: "status" });
        void closeAgentSession()
          .then(() => {
            webviewView.webview.postMessage({ text: "Agent session closed.", type: "session_closed" });
          })
          .catch((error) => {
            const text = error?.message || "Failed to close agent session.";
            webviewView.webview.postMessage({ text, type: "error" });
          });
        return;
      }

      if (message?.type === "stop") {
        const activeRun = this.activeRun;
        if (!activeRun) return;
        try {
          activeRun.abortController.abort();
          await stopAgentRun(activeRun.taskId);
          webviewView.webview.postMessage({ text: "任务已停止", type: "error" });
        } catch (error) {
          const text = error?.message || "Failed to stop agent run.";
          webviewView.webview.postMessage({ text, type: "error" });
        } finally {
          if (this.activeRun?.taskId === activeRun.taskId) {
            this.activeRun = null;
          }
        }
        return;
      }

      if (message?.type !== "run") return;
      if (this.activeRun) {
        webviewView.webview.postMessage({ text: "Agent is already running.", type: "status" });
        return;
      }
      try {
        const fs = require("fs");
        const log = (msg) => { try { fs.appendFileSync("/tmp/ext-debug.log", new Date().toISOString() + " " + msg + "\n"); } catch(e) {} };
        log("onDidReceiveMessage: prompt=" + String(message.prompt).slice(0,50));

        const activeFile = getActiveFile();
        const selection = message.includeSelection ? getSelectionText() : "";
        const prompt = String(message.prompt || "").trim();
        if (!prompt) { log("empty prompt, returning"); return; }
        const finalPrompt = selection
          ? `${prompt}\n\nSelected code from ${activeFile}:\n\`\`\`\n${selection}\n\`\`\``
          : prompt;

        log("calling startAgentRun...");
        const run = await startAgentRun(finalPrompt, activeFile);
        log("startAgentRun returned: taskId=" + run.taskId + " apiUrl=" + run.apiUrl);

        const abortController = new AbortController();
        this.activeRun = { abortController, taskId: run.taskId };
        webviewView.webview.postMessage({ text: "Agent task started.", type: "activity" });
        log("posted activity, calling streamTaskEvents...");
        streamTaskEvents({ ...run, signal: abortController.signal, webview: webviewView.webview })
          .then(() => log("streamTaskEvents completed"))
          .catch((streamError) => {
            log("streamTaskEvents ERROR: " + (streamError?.message || "unknown"));
            if (abortController.signal.aborted) return;
            const text = streamError?.message || "Failed to stream task events.";
            webviewView.webview.postMessage({ text, type: "error" });
          })
          .finally(() => {
            log("streamTaskEvents finally");
            if (this.activeRun?.taskId === run.taskId) {
              this.activeRun = null;
            }
          });
      } catch (error) {
        const fs = require("fs");
        try { fs.appendFileSync("/tmp/ext-debug.log", new Date().toISOString() + " onDidReceiveMessage CATCH: " + (error?.message || "unknown") + "\n"); } catch(e) {}
        const text = error?.message || "Failed to start Agent.";
        webviewView.webview.postMessage({ type: "status", text });
        vscode.window.showErrorMessage(text);
      }
    });
  }

  html(webview) {
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, "webview", "dist", "assets", "app.js"));
    const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, "webview", "dist", "assets", "style.css"));
    const nonce = Math.random().toString(36).slice(2);
    return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} https: data:; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <link rel="stylesheet" href="${styleUri}">
</head>
<body>
  <div id="root"></div>
  <script nonce="${nonce}" type="module" src="${scriptUri}"></script>
</body>
</html>`;
  }
}

function activate(context) {
  const appId = getAppIdFromWorkspace();

  context.subscriptions.push(
    output,
    vscode.window.registerWebviewViewProvider("appforge.agentView", new AgentViewProvider(context.extensionUri)),
    vscode.commands.registerCommand("appforge.askCursorAgent", () => askAgent()),
    vscode.commands.registerCommand("appforge.askSelection", () => askAgent({ includeSelection: true })),
    vscode.commands.registerCommand("appforge.runApp", async () => {
      try {
        const currentAppId = getAppIdFromWorkspace();
        if (!currentAppId) {
          throw new Error("Cannot infer AppForge appId from the current workspace.");
        }
        await runAppInTerminal({ appId: currentAppId, output });
      } catch (error) {
        const message = error?.message || "Failed to run app.";
        output.appendLine(`[AppForge Run] ${message}`);
        vscode.window.showErrorMessage(message);
      }
    }),
    vscode.commands.registerCommand("appforge.stopApp", () => {
      stopAppRun({ output });
    }),
  );

  if (appId) {
    registerRunTriggerWatcher({ appId, context, output });
  }

  context.subscriptions.push(
    vscode.workspace.onDidChangeWorkspaceFolders(() => {
      const nextAppId = getAppIdFromWorkspace();
      if (nextAppId) {
        registerRunTriggerWatcher({ appId: nextAppId, context, output });
      }
    }),
  );

  setTimeout(() => {
    applyMinimalIdeLayout().catch(() => {});
  }, 1200);
}

async function applyMinimalIdeLayout() {
  const layoutCommands = [
    "workbench.view.explorer",
    "workbench.view.extension.appforge",
    "appforge.agentView.focus",
    "workbench.action.focusActiveEditorGroup",
  ];

  for (const command of layoutCommands) {
    try {
      await vscode.commands.executeCommand(command);
    } catch {
      // Some commands may be unavailable depending on code-server version.
    }
  }
}

function deactivate() {}

module.exports = {
  activate,
  deactivate,
};

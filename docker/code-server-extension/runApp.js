const path = require("path");
const vscode = require("vscode");

const RUN_TERMINAL_NAME = "AppForge Run";
const RUN_TRIGGER_RELATIVE = ".appforge/.run-trigger";

let runTerminal;
let triggerWatcher;
let lastRunSpec;

function getApiUrl() {
  return process.env.APPFORGE_API_URL || "http://api:4173";
}

function getWorkspaceFolderUri() {
  return vscode.workspace.workspaceFolders?.[0]?.uri || null;
}

function getWorkspaceFolderPath() {
  return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || "";
}

function composeProjectName(appId) {
  return `appforge_${String(appId).replace(/[^a-zA-Z0-9_-]/g, "_")}`;
}

async function fetchRunSpec(appId) {
  const endpoint = `${getApiUrl()}/api/apps/${encodeURIComponent(appId)}/run/spec`;
  const response = await fetch(endpoint);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || `Failed to load run spec (${response.status})`);
  }
  return payload;
}

function resolveTerminalCwd(workspacePath, spec) {
  const cwd = String(spec?.cwd || ".").trim() || ".";
  return path.resolve(workspacePath, cwd);
}

function buildTerminalEnv(spec, appId) {
  const env = { ...(spec?.env || {}) };
  if (spec?.runtime === "docker") {
    env.COMPOSE_PROJECT_NAME = env.COMPOSE_PROJECT_NAME || composeProjectName(appId);
  }
  return Object.fromEntries(
    Object.entries(env).map(([key, value]) => [String(key), String(value)]),
  );
}

async function showTerminalPanel() {
  try {
    await vscode.commands.executeCommand("workbench.action.terminal.focus");
  } catch {
    // terminal.show still works when focus command is unavailable.
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function ensureRunTerminal({ workspacePath, spec, appId }) {
  if (runTerminal) {
    try {
      runTerminal.dispose();
    } catch {
      // ignore
    }
    runTerminal = undefined;
  }

  runTerminal = vscode.window.createTerminal({
    cwd: resolveTerminalCwd(workspacePath, spec),
    env: buildTerminalEnv(spec, appId),
    name: RUN_TERMINAL_NAME,
  });

  await showTerminalPanel();
  runTerminal.show(true);
  return runTerminal;
}

async function runAppInTerminal({ appId, output, specPayload }) {
  const workspacePath = getWorkspaceFolderPath();
  if (!workspacePath) {
    throw new Error("Open a workspace before running the app.");
  }

  const payload = specPayload || (await fetchRunSpec(appId));
  const spec = payload.spec || payload;
  if (!spec?.command) {
    throw new Error("Run command is missing.");
  }

  lastRunSpec = spec;
  await ensureRunTerminal({ appId, spec, workspacePath });

  if (spec.runtime === "docker") {
    output.appendLine(`[AppForge Run] runtime=docker project=${composeProjectName(appId)}`);
  } else {
    output.appendLine("[AppForge Run] runtime=local");
  }

  if (spec.install) {
    output.appendLine(`[AppForge Run] ${spec.install}`);
    runTerminal.sendText(spec.install);
  }

  output.appendLine(`[AppForge Run] ${spec.command}`);
  runTerminal.sendText(spec.command, true);

  const source = payload.source || "unknown";
  const runtime = spec.runtime || "docker";
  vscode.window.showInformationMessage(`AppForge: ${runtime} run started (${source})`);
  return spec;
}

async function stopAppRun({ appId, output, specPayload } = {}) {
  const spec = specPayload?.spec || specPayload || lastRunSpec;
  const terminal = runTerminal;

  if (!terminal && !spec?.stop) {
    output?.appendLine("[AppForge Run] No active terminal to stop.");
    return false;
  }

  if (spec?.stop) {
    if (!terminal) {
      const workspacePath = getWorkspaceFolderPath();
      if (!workspacePath) return false;
      await ensureRunTerminal({ appId, spec, workspacePath });
    }

    runTerminal.sendText("\u0003");
    await sleep(400);
    output?.appendLine(`[AppForge Run] ${spec.stop}`);
    runTerminal.sendText(spec.stop, true);
  } else if (terminal) {
    terminal.sendText("\u0003");
  }

  output?.appendLine("[AppForge Run] Stop command sent.");
  vscode.window.showInformationMessage("AppForge: app stopped.");
  return true;
}

async function readTriggerAction() {
  const folderUri = getWorkspaceFolderUri();
  if (!folderUri) return null;

  const triggerUri = vscode.Uri.joinPath(folderUri, ...RUN_TRIGGER_RELATIVE.split("/"));
  try {
    const raw = await vscode.workspace.fs.readFile(triggerUri);
    const payload = JSON.parse(Buffer.from(raw).toString("utf8"));
    return payload.action === "stop" ? "stop" : "start";
  } catch {
    return null;
  }
}

async function handleRunTrigger({ appId, output }) {
  const action = await readTriggerAction();
  if (!action) return;

  if (action === "stop") {
    const payload = await fetchRunSpec(appId).catch(() => null);
    await stopAppRun({ appId, output, specPayload: payload });
    return;
  }

  await runAppInTerminal({ appId, output });
}

function registerRunTriggerWatcher({ appId, output, context }) {
  const folderUri = getWorkspaceFolderUri();
  if (!folderUri) return;

  if (triggerWatcher) {
    triggerWatcher.dispose();
    triggerWatcher = undefined;
  }

  const pattern = new vscode.RelativePattern(folderUri, RUN_TRIGGER_RELATIVE);
  triggerWatcher = vscode.workspace.createFileSystemWatcher(pattern);

  const onTrigger = () => {
    handleRunTrigger({ appId, output }).catch((error) => {
      const message = error?.message || "Failed to handle run trigger.";
      output.appendLine(`[AppForge Run] ${message}`);
      vscode.window.showErrorMessage(message);
    });
  };

  triggerWatcher.onDidCreate(onTrigger);
  triggerWatcher.onDidChange(onTrigger);
  context.subscriptions.push(triggerWatcher);
}

module.exports = {
  registerRunTriggerWatcher,
  runAppInTerminal,
  stopAppRun,
};

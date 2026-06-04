const path = require("path");
const http = require("http");
const config = require("./config");
const { abortTask, markTaskCancelled } = require("./jobCancel");
const { disposeAllControllers } = require("./agentPool");
const { formatError } = require("./formatError");
const { runJob } = require("./run");

const PORT = config.runner.port;
const CALLBACK_URL = config.callback.url;
const CALLBACK_TOKEN = config.callback.token;

const queue = [];
let busy = false;
let currentJob = null;
let shuttingDown = false;

function verifyToken(request) {
  return request.headers["x-runner-token"] === CALLBACK_TOKEN;
}

function readJsonBody(request) {
  return new Promise((resolve, reject) => {
    let raw = "";
    request.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 1_000_000) {
        reject(new Error("Request body too large"));
        request.destroy();
      }
    });
    request.on("end", () => {
      if (!raw) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error("Invalid JSON body"));
      }
    });
    request.on("error", reject);
  });
}

// Map a workspace path from the backend to the agent-runner's mount point.
// The backend may send a relative path (./storage/appforge/...) which needs
// to be resolved to /data/appforge/... inside the agent-runner container.
function resolveWorkspaceDir(raw) {
  if (raw.startsWith("./storage/appforge")) {
    return "/data/appforge" + raw.slice("./storage/appforge".length);
  }
  return path.resolve(raw);
}

async function processQueue() {
  if (busy || !queue.length) return;
  busy = true;
  const job = queue.shift();
  currentJob = job;

  const savedEnv = {
    JOB_TYPE: process.env.JOB_TYPE,
    TASK_ID: process.env.TASK_ID,
    WORKSPACE_DIR: process.env.WORKSPACE_DIR,
  };

  try {
    process.env.JOB_TYPE = job.jobType;
    process.env.TASK_ID = job.taskId;
    process.env.WORKSPACE_DIR = resolveWorkspaceDir(job.workspaceDir);
    await runJob();
  } catch (error) {
    process.stderr.write(`[agent-runner] job ${job.taskId} failed: ${error.message}\n`);
  } finally {
    currentJob = null;
    process.env.JOB_TYPE = savedEnv.JOB_TYPE;
    process.env.TASK_ID = savedEnv.TASK_ID;
    process.env.WORKSPACE_DIR = savedEnv.WORKSPACE_DIR;
    busy = false;
    processQueue();
  }
}

function enqueueJob(job) {
  if (shuttingDown) return false;
  queue.push(job);
  processQueue();
  return true;
}

const server = http.createServer(async (request, response) => {
  try {
    if (shuttingDown && request.method !== "GET") {
      response.writeHead(503, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ error: "Agent runner is shutting down" }));
      return;
    }

    if (request.method === "GET" && request.url === "/health") {
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ busy, ok: true, queued: queue.length }));
      return;
    }

    if (request.method === "POST" && request.url === "/run") {
      if (!verifyToken(request)) {
        response.writeHead(401, { "Content-Type": "application/json" });
        response.end(JSON.stringify({ error: "Unauthorized" }));
        return;
      }

      const body = await readJsonBody(request);
      const { jobType, taskId, workspaceDir } = body;
      if (!taskId || !jobType || !workspaceDir) {
        response.writeHead(400, { "Content-Type": "application/json" });
        response.end(JSON.stringify({ error: "taskId, jobType and workspaceDir are required" }));
        return;
      }

      // Resolve workspace path for container filesystem
      const resolvedDir = resolveWorkspaceDir(workspaceDir);

      enqueueJob({ jobType, taskId, workspaceDir: resolvedDir });
      response.writeHead(202, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ ok: true, queued: queue.length }));
      return;
    }

    if (request.method === "POST" && request.url === "/cancel") {
      if (!verifyToken(request)) {
        response.writeHead(401, { "Content-Type": "application/json" });
        response.end(JSON.stringify({ error: "Unauthorized" }));
        return;
      }

      const body = await readJsonBody(request);
      const { taskId } = body;
      if (!taskId) {
        response.writeHead(400, { "Content-Type": "application/json" });
        response.end(JSON.stringify({ error: "taskId is required" }));
        return;
      }

      const queuedIndex = queue.findIndex((item) => item.taskId === taskId);
      if (queuedIndex >= 0) {
        queue.splice(queuedIndex, 1);
        markTaskCancelled(taskId);
        response.writeHead(200, { "Content-Type": "application/json" });
        response.end(JSON.stringify({ ok: true, removedFromQueue: true }));
        return;
      }

      if (busy && currentJob?.taskId === taskId) {
        await abortTask(taskId);
        response.writeHead(200, { "Content-Type": "application/json" });
        response.end(JSON.stringify({ ok: true, aborted: true }));
        return;
      }

      markTaskCancelled(taskId);
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ ok: true, alreadyStopped: true }));
      return;
    }

    if (request.method === "POST" && request.url === "/agent/close") {
      if (!verifyToken(request)) {
        response.writeHead(401, { "Content-Type": "application/json" });
        response.end(JSON.stringify({ error: "Unauthorized" }));
        return;
      }

      const body = await readJsonBody(request);
      const { appId, workspaceDir } = body;
      if (!appId && !workspaceDir) {
        response.writeHead(400, { "Content-Type": "application/json" });
        response.end(JSON.stringify({ error: "appId or workspaceDir is required" }));
        return;
      }

      const targetWorkspace = workspaceDir ? path.resolve(workspaceDir) : "";
      if (
        busy &&
        currentJob?.taskId &&
        targetWorkspace &&
        path.resolve(currentJob.workspaceDir) === targetWorkspace
      ) {
        await abortTask(currentJob.taskId);
      }

      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ ok: true }));
      return;
    }

    response.writeHead(404, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ error: "Not found" }));
  } catch (error) {
    response.writeHead(500, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ error: error.message || "Internal error" }));
  }
});

process.on("unhandledRejection", (reason) => {
  process.stderr.write(`[agent-runner] unhandled rejection: ${formatError(reason)}\n`);
});

process.on("uncaughtException", (error) => {
  process.stderr.write(`[agent-runner] uncaught exception: ${formatError(error)}\n`);
});

let shutdownStarted = false;
let forceExitTimer = null;

async function shutdown(signal) {
  if (shutdownStarted) return;
  shutdownStarted = true;
  shuttingDown = true;

  process.stderr.write(`[agent-runner] ${signal} received, shutting down...\n`);
  queue.length = 0;

  forceExitTimer = setTimeout(() => {
    process.stderr.write("[agent-runner] shutdown timeout, forcing exit\n");
    process.exit(0);
  }, 4000);
  forceExitTimer.unref();

  if (busy && currentJob?.taskId) {
    await abortTask(currentJob.taskId);
  }

  disposeAllControllers();

  await new Promise((resolve) => {
    server.close(() => resolve());
  });

  if (forceExitTimer) clearTimeout(forceExitTimer);
  process.exit(0);
}

process.on("SIGTERM", () => {
  void shutdown("SIGTERM");
});

process.on("SIGINT", () => {
  void shutdown("SIGINT");
});

server.listen(PORT, "0.0.0.0", () => {
  process.stdout.write(`[agent-runner] worker listening on :${PORT}\n`);
});

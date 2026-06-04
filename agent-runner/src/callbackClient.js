const config = require("./config");

function getCallbackConfig() {
  const callbackUrl = process.env.CALLBACK_URL || config.callback.url;
  const taskId = process.env.TASK_ID;
  const token = process.env.CALLBACK_TOKEN || config.callback.token;

  if (!callbackUrl || !taskId) {
    throw new Error("CALLBACK_URL and TASK_ID are required for agent runner");
  }

  return { callbackUrl: callbackUrl.replace(/\/$/, ""), taskId, token: token || "" };
}

async function emitEvent(type, payload) {
  const { callbackUrl, taskId, token } = getCallbackConfig();

  const response = await fetch(`${callbackUrl}/api/internal/runner/events`, {
    body: JSON.stringify({ payload, taskId, type }),
    headers: {
      "Content-Type": "application/json",
      "X-Runner-Token": token,
    },
    method: "POST",
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Runner callback failed (${response.status}): ${body || response.statusText}`);
  }
}

async function emitFinished(result) {
  const { callbackUrl, taskId, token } = getCallbackConfig();

  const response = await fetch(`${callbackUrl}/api/internal/runner/finished`, {
    body: JSON.stringify({ result, taskId }),
    headers: {
      "Content-Type": "application/json",
      "X-Runner-Token": token,
    },
    method: "POST",
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Runner finish callback failed (${response.status}): ${body || response.statusText}`);
  }
}

module.exports = {
  emitEvent,
  emitFinished,
};

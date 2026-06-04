const config = require("./config");

function getCallbackConfig() {
  const callbackUrl = process.env.CALLBACK_URL || config.callback.url;
  const taskId = process.env.TASK_ID;
  const token = process.env.CALLBACK_TOKEN || config.callback.token;

  if (!callbackUrl || !taskId) {
    throw new Error("CALLBACK_URL and TASK_ID are required for agent runner");
  }

  return {
    callbackUrl: callbackUrl.replace(/\/$/, ""),
    taskId,
    token: token || "",
  };
}

async function loadJobSpec() {
  const { callbackUrl, taskId, token } = getCallbackConfig();

  const response = await fetch(`${callbackUrl}/api/internal/runner/tasks/${encodeURIComponent(taskId)}`, {
    headers: {
      "X-Runner-Token": token,
    },
    method: "GET",
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Failed to load task spec (${response.status}): ${body || response.statusText}`);
  }

  return response.json();
}

module.exports = {
  loadJobSpec,
};

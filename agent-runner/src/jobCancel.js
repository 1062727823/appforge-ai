const { getController, removeController } = require("./agentPool");

const cancelledTasks = new Set();

function markTaskCancelled(taskId) {
  if (taskId) cancelledTasks.add(taskId);
}

function isTaskCancelled(taskId) {
  return Boolean(taskId && cancelledTasks.has(taskId));
}

function registerActiveRun(taskId, run) {
  // run object has { abort: () => {} } for Claude SDK AbortController
}

function clearActiveRun(taskId) {
  if (taskId) {
    cancelledTasks.delete(taskId);
  }
}

async function abortTask(taskId) {
  if (!taskId) return false;
  markTaskCancelled(taskId);

  const controller = getController(taskId);
  if (controller) {
    controller.abort();
    removeController(taskId);
    return true;
  }
  return false;
}

module.exports = {
  abortTask,
  clearActiveRun,
  isTaskCancelled,
  markTaskCancelled,
  registerActiveRun,
};

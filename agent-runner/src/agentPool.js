const config = require("./config");

const MAX_CONCURRENT = config.runner.maxConcurrent;

let activeCount = 0;
const waitQueue = [];

function acquireSlot() {
  if (activeCount < MAX_CONCURRENT) {
    activeCount += 1;
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    waitQueue.push(resolve);
  });
}

function releaseSlot() {
  activeCount -= 1;
  const next = waitQueue.shift();
  if (next) {
    activeCount += 1;
    next();
  }
}

// AbortController registry for task cancellation
const controllers = new Map();

function registerController(taskId, controller) {
  controllers.set(taskId, controller);
}

function getController(taskId) {
  return controllers.get(taskId);
}

function removeController(taskId) {
  controllers.delete(taskId);
}

function disposeAllControllers() {
  for (const ctrl of controllers.values()) {
    ctrl.abort();
  }
  controllers.clear();
}

module.exports = {
  acquireSlot,
  disposeAllControllers,
  getController,
  registerController,
  releaseSlot,
  removeController,
};

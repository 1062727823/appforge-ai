import { startWorkspaceSync } from "./api.js";

export function waitForTaskSilently(taskId) {
  if (!taskId || !window.EventSource) return Promise.resolve();

  return new Promise((resolve, reject) => {
    const source = new EventSource(`/api/tasks/${encodeURIComponent(taskId)}/events`);
    const close = () => source.close();

    source.addEventListener("task_completed", () => {
      close();
      resolve();
    });

    source.addEventListener("task_failed", (event) => {
      close();
      try {
        const data = JSON.parse(event.data);
        reject(new Error(data.payload?.message || "Task failed"));
      } catch {
        reject(new Error("Task failed"));
      }
    });

    source.onerror = () => {
      if (source.readyState === EventSource.CLOSED) return;
      close();
      reject(new Error("任务连接中断"));
    };
  });
}

export async function bootstrapEditorWorkspace(appId, taskId = null) {
  if (taskId) {
    await waitForTaskSilently(taskId);
    return;
  }

  const sync = await startWorkspaceSync(appId);
  if (sync.taskId) {
    await waitForTaskSilently(sync.taskId);
  }
}

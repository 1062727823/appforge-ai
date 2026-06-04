export function slugify(value) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

export function statusText(status) {
  return (
    {
      creating: "生成中",
      ready: "可用",
      running: "运行中",
      stopped: "已停止",
    }[status] || status || "未知"
  );
}

export function statusClass(status) {
  if (status === "ready" || status === "running") return "deployed";
  if (status === "stopped") return "idle";
  return "preview";
}

export function deployStatusLabel(status) {
  if (status?.deploying) return { text: "部署中", className: "preview" };
  if (status?.running) return { text: "运行中", className: "deployed" };
  return { text: "已停止", className: "idle" };
}

export function actionLabel(action) {
  return (
    {
      deploy: "部署",
      stop: "停止",
      restart: "重启",
    }[action] || action
  );
}

export function historyStatusTone(entry) {
  if (entry.status === "failed") return { text: "失败", className: "idle" };
  if (entry.status === "running") return { text: "进行中", className: "preview" };
  return { text: "成功", className: "deployed" };
}

export const VIEW_TITLES = {
  create: "创建应用",
  dashboard: "应用管理",
  deploy: "部署管理",
  editor: "应用编辑器",
  settings: "平台设置",
  versions: "版本历史",
};

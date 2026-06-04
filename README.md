# AppForge AI

AI 驱动的低代码平台 —— 通过 Claude 智能体创建、编辑、部署和管理应用。

## 架构

```
浏览器 ──→ nginx(:4173) ──┬── /api/* ──────────→ Spring Boot API (Java 17)
                          └── /ide/* ──────────→ code-server (Web IDE)
                                                    │
                          Spring Boot ──HTTP──→ Agent Runner (Node.js)
                           │                        │
                     H2 数据库                 Claude Agent SDK
                                                    │
                                              Anthropic API

应用预览：后端通过 docker port 获取容器映射端口，直连 http://127.0.0.1:{port}
```

## 项目结构

```
appforge-ai/
├── backend/                   # Spring Boot 3.4 API (Java 17)
│   ├── pom.xml
│   └── src/main/java/com/appforge/
│       ├── config/            # AppForgeProperties, WebConfig
│       ├── controller/        # App, Task, Run, Deploy, Settings
│       ├── model/             # DTO 和状态模型
│       ├── service/           # 业务逻辑（14 个服务）
│       └── store/             # H2 嵌入式数据库持久化
├── frontend/                  # React 19 + Vite
├── agent-runner/              # Node.js worker（Claude Agent SDK）
│   └── src/
│       ├── worker.js          # HTTP 服务 + 任务队列
│       ├── run.js             # 任务调度
│       └── jobs/              # claudeAgentJob, gitSyncJob
├── shared/                    # 共享 JS 工具（GitLab 地址校验）
├── docker/                    # Dockerfiles + nginx 配置
│   ├── nginx/                 # nginx 反向代理配置
├── docker-compose.yml         # 完整部署（5 个服务）
├── docker-compose.dev.yml     # 开发模式（仅基础设施 + nginx）
└── .env.example               # 环境变量模板
```

## 环境要求

| 依赖 | 版本 | 用途 |
|------|------|------|
| Docker Desktop | 最新 | 完整部署或基础设施服务 |
| Java | 17+ | 后端开发 |
| Maven | 3.8+ | 后端构建 |
| Node.js | 22+ | 前端和 agent-runner 开发 |

> **Windows 用户：** 需安装 Docker Desktop with WSL2。步骤：
> ```powershell
> wsl --install                     # 安装 WSL2 + Ubuntu
> # 然后从 docker.com 下载安装 Docker Desktop
> # Docker Desktop → Settings → Resources → File Sharing，确保 D:\ 在共享列表中
> ```

---

## 启动方式

### 方式一：完整 Docker（推荐，一键启动）

4 个服务全部在 Docker 容器中运行，无需安装 Java/Node.js。

```bash
# 1. 配置环境变量
cp .env.example .env
# 编辑 .env，填入：
#   ANTHROPIC_API_KEY=sk-xxx
#   （其他变量保持默认即可）

# 2. 构建并启动
docker compose build
docker compose up -d

# 3. 验证
docker ps
# 应看到 4 个容器：nginx, api, agent-runner, code-server
```

访问地址：**`http://127.0.0.1:4173`**

| 服务 | 端口 | 说明 |
|------|------|------|
| nginx | 4173 | 统一入口，反向代理到 API / IDE |
| API | 4173（内部） | Spring Boot 后端 + 前端 SPA |
| Agent Runner | 8080（内部） | AI 任务执行器 |
| code-server | 8080（内部） | Web IDE（浏览器版 VS Code） |

---

### 方式二：混合开发（IDE 调前后端 + Docker 跑基础设施）

前端和后端在 IDEA 中运行方便调试，agent-runner、code-server 在 Docker 中运行。

```bash
# 1. 配置 API Key（在 backend/src/main/resources/application.yml 中已配置）
#    deepseek-api-key: sk-xxx

# 2. 创建工作区目录
mkdir -p storage/appforge/workspaces

# 3. 构建并启动基础设施容器
docker compose -f docker-compose.dev.yml build
docker compose -f docker-compose.dev.yml up -d

# 4. 验证
docker ps
# 应看到 3 个容器：nginx, agent-runner, code-server
```

**启动后端**（IDEA）：直接运行 `AppForgeApplication`，无需额外 VM 参数。

**启动前端：**
```bash
cd frontend
npm install
npm run dev
```

访问地址：**`http://127.0.0.1:5173`**

| 服务 | 运行位置 | 端口 |
|------|----------|------|
| nginx | Docker | 4173（统一入口） |
| 前端（Vite） | Windows | 5173 |
| 后端（Spring Boot） | IDEA | 8181 |
| Agent Runner | Docker | 8080 |
| code-server | Docker | 8080（通过 nginx /ide/ 代理） |

---

### 方式三：最小化（无 Docker，仅代码生成）

不需要 Docker，仅使用 AI 生成代码功能。生成的代码在 `storage/appforge/workspaces/` 目录下，可用本地 VS Code 打开。

```bash
# 终端 1：Agent Runner
cd agent-runner
npm install
$env:CALLBACK_URL="http://127.0.0.1:4173"
$env:CALLBACK_TOKEN="dev-runner-token"
$env:RUNNER_PORT="8080"
node --inspect src/worker.js

# 终端 2：前端
cd frontend
npm install
npm run dev
```

**启动后端**（IDEA）：添加 VM 参数 `-Danthropic-api-key=sk-xxx`

访问地址：**`http://127.0.0.1:5173`**

| 功能 | 可用 |
|------|:--:|
| 应用管理（增删改查） | 是 |
| AI 生成代码 | 是 |
| Web IDE（code-server 内嵌） | 否 |
| 运行 / 预览应用 | 否 |
| 生产部署 | 否 |

---

## Docker 常用命令

```bash
# === 完整部署 ===
docker compose build                # 构建全部 4 个镜像
docker compose up -d                # 后台启动全部服务
docker compose down                 # 停止全部服务
docker compose logs -f              # 查看全部日志
docker compose logs -f api          # 查看指定服务日志
docker compose restart api          # 重启指定服务
docker compose down -v              # 停止并删除数据卷

# === 开发基础设施 ===
docker compose -f docker-compose.dev.yml build               # 构建基础设施镜像
docker compose -f docker-compose.dev.yml up -d               # 启动基础设施
docker compose -f docker-compose.dev.yml down                # 停止基础设施
docker compose -f docker-compose.dev.yml logs -f agent-runner # agent-runner 日志
docker compose -f docker-compose.dev.yml logs -f code-server  # code-server 日志
docker compose -f docker-compose.dev.yml restart code-server  # 重启 code-server
docker compose -f docker-compose.dev.yml build --no-cache    # 无缓存完整重建

# === 故障排查 ===
docker ps                          # 查看运行中的容器
docker ps -a                       # 查看所有容器（含已停止）
docker images | grep appforge      # 查看 appforge 镜像
docker logs <容器名>                # 查看容器日志
docker exec -it <容器名> sh        # 进入容器 shell
docker system prune -a             # 清理未使用的镜像和容器
```

---

## Docker 镜像加速（国内用户必配）

Docker Desktop → Settings → Docker Engine，添加：

```json
{
  "registry-mirrors": [
    "https://docker.m.daocloud.io",
    "https://dockerhub.timeweb.cloud",
    "https://docker.1ms.run"
  ]
}
```

点击 **Apply & restart** 重启 Docker，然后重试构建。

---

## 常见构建问题

| 现象 | 原因 | 解决方案 |
|------|------|------|
| 构建时 `EBADPLATFORM` 报错 | `package.json` 含平台专用包 | 删除 `agent-runner/package.json` 中的 `@anthropic-ai/claude-agent-sdk-win32-arm64` |
| `no such file or directory`（entrypoint.sh） | Windows CRLF 换行符导致 shell 脚本无法执行 | Dockerfile 已修复（`sed -i 's/\r$//'`） |
| `connectex` 无法拉取镜像 | Docker Hub 被墙 | 配置镜像加速（见上节） |
| code-server 无限重启 | entrypoint 脚本换行符问题 | 加 `--no-cache` 完整重建 |
| Agent 提交提示词后无响应 | 多个可能原因，见下方排查步骤 | 逐项检查 |
| `Claude Code native binary exists but failed to launch` | 见「Agent 不执行排查」 | 逐项检查 |

---

## Agent 不执行排查

如果页面提交提示词后 Agent 无响应或立即失败，按以下顺序排查。

### 1. 确认请求链路

```bash
# 创建测试任务，确认后端能正常创建 task
curl -s -X POST http://127.0.0.1:4173/api/apps/{appId}/agent-runs \
  -H "Content-Type: application/json" \
  -d '{"prompt": "say hello", "activeFile": ""}'

# 检查 agent-runner 日志是否有 job 处理记录
docker logs appforge-ai-agent-runner-1 2>&1 | tail -10
```

如果 agent-runner 日志无任何 job 处理记录，说明后端无法连接到 agent-runner，检查步骤 2。

如果日志中出现 `exists but failed to launch`，跳到步骤 3。

### 2. 后端无法连接 agent-runner

**原因**：`.env` 中 `AGENT_RUNNER_URL` 使用了 Docker 内部地址 `http://agent-runner:8080`，但后端在宿主机运行无法解析。

**修复**：确保 `.env` 是文件而非目录，并且 URL 设置为宿主机可访问的地址：

```bash
# 检查 .env 是否为文件（不能是目录）
ls -la .env

# 如果是目录，删除并创建文件
rmdir .env
cat > .env << 'EOF'
DEEPSEEK_API_KEY=sk-your-key
AGENT_RUNNER_URL=http://127.0.0.1:8080
RUNNER_CALLBACK_TOKEN=dev-runner-token
# ...其他配置
EOF
```

> **注意**：`docker-compose.dev.yml`（混合开发模式）中 agent-runner 的 `CALLBACK_URL` 需要设为 `http://host.docker.internal:4173`，确保容器内能回连宿主机的后端。

### 3. workspace 路径不匹配

**现象**：agent-runner 日志出现 `Claude Code native binary exists but failed to launch`，且 `cwd` 指向 `/app/storage/...`（不存在的路径）。

**原因**：后端发送给 agent-runner 的 `workspaceDir` 是相对路径 `./storage/appforge/workspaces/...`，agent-runner 在容器内解析为 `/app/storage/...`，但实际数据挂载在 `/data/appforge/...`，导致 claude 二进制启动时 cwd 不存在而立即退出。

**修复**：已在 `agent-runner/src/worker.js` 中添加 `resolveWorkspaceDir()` 函数，自动将 `./storage/appforge` 映射为 `/data/appforge`。

### 4. onEvent 回调格式错误

**现象**：agent-runner 日志出现 `Runner callback failed (500)`。

**原因**：`claudeAgentJob.js` 中 `onEvent(type, payload)` 函数期望两个参数，但所有调用方传的是 `onEvent({type, payload})`（一个对象）。导致回调发送给后端时 `type` 字段为对象而非字符串，后端 ClassCastException 返回 500。

**修复**：已将函数签名改为 `onEvent({ type, payload })` 解构参数。

### 5. SDK 缺少 --print 参数

**现象**：SDK spawn claude 二进制后立即退出（无输出）。

**原因**：`@anthropic-ai/claude-agent-sdk` 内部 spawn 二进制时未传递 `--print` 参数，而 `--input-format stream-json` 需要 `--print` 模式。二进制以交互模式启动，在无 TTY 的容器中失败。

**修复**：已在 `claudeAgentJob.js` 的 `query()` 调用中添加 `extraArgs: { print: null }`。

### 6. config.js 未读取环境变量

**现象**：agent-runner 回调请求发送到错误地址（如 `http://api:4173` 在 dev 模式下不可达）。

**原因**：`agent-runner/src/config.js` 只从 `config.json` 读取配置，忽略了 `docker-compose` 设置的环境变量如 `CALLBACK_URL`、`CALLBACK_TOKEN`。

**修复**：已在 `config.js` 中添加环境变量覆盖逻辑，优先使用 `process.env` 中的值。

### 7. SSE 事件解析错误（页面看不到 AI 回复）

**现象**：后端和 agent-runner 都正常执行，数据库中有 `agent_message` 事件且包含 AI 回复文本，但 code-server 扩展的聊天面板不显示回复内容。

**原因**：`extension.js` 中 SSE 事件解析器写的是 `payload.payload.text`，多取了一层 `payload`。实际后端发送的 SSE 格式是 `data:{"text":"回复内容"}`，应该直接读 `payload.text`。导致 AI 回复文本永远为空，页面看起来无响应。

**修复**：将 `const body = payload.payload || {};` 改为 `const body = payload || {};`。

---

## API 接口

| 方法 | 路径 | 用途 |
|------|------|------|
| GET/POST/DELETE | `/api/apps` | 应用增删查 |
| PUT | `/api/apps/:id` | 更新应用 |
| GET/PUT | `/api/settings` | 平台设置 |
| GET | `/api/create-options` | 创建选项 |
| POST | `/api/apps/:id/workspace-sync` | Git 工作区同步 |
| POST | `/api/apps/:id/agent-runs` | 启动 AI 智能体 |
| POST | `/api/apps/:id/agent-runs/:taskId/stop` | 停止智能体 |
| GET | `/api/tasks/:taskId/events` | SSE 事件流 |
| GET/POST | `/api/apps/:id/run/*` | 预览运行管理 |
| GET/POST | `/api/apps/:id/deploy/*` | 生产部署管理 |
| GET | `/api/apps/:id/ide` | 获取 IDE URL |

---

## 各模块调试方式

| 模块 | 语言 | 调试方式 |
|------|------|------|
| 前端（Vite） | JSX | Vite HMR + 浏览器 React DevTools |
| 后端（Spring Boot） | Java | IDEA Debug 断点 |
| Agent Runner | Node.js | `--inspect` + Chrome DevTools / VS Code attach |
| code-server 扩展 | JS | 浏览器 F12 + 容器日志 `docker logs -f code-server` |
| nginx | C | 容器日志 `docker logs -f appforge-ai-nginx-1` |

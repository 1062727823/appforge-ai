const fsp = require("fs/promises");
const path = require("path");
const { spawn } = require("child_process");
const { emitEvent } = require("../callbackClient");
const { loadJobSpec } = require("../jobSpec");

const DEFAULT_BRANCHES = ["main", "master"];

async function pathExists(target) {
  try {
    await fsp.access(target);
    return true;
  } catch {
    return false;
  }
}

async function isGitRepository(cwd) {
  return pathExists(path.join(cwd, ".git"));
}

async function listContentEntries(cwd) {
  const entries = await fsp.readdir(cwd).catch(() => []);
  return entries.filter((entry) => entry !== ".git");
}

async function isWorkspaceEmpty(cwd) {
  return (await listContentEntries(cwd)).length === 0;
}

function runGit(cwd, args) {
  return new Promise((resolve, reject) => {
    const child = spawn("git", args, { cwd, env: process.env, shell: false });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (exitCode) => {
      const result = {
        command: `git ${args.join(" ")}`,
        exitCode,
        stderr: stderr.trim(),
        stdout: stdout.trim(),
      };
      if (exitCode === 0) resolve(result);
      else reject(new Error(result.stderr || result.stdout || result.command));
    });
  });
}

async function emitCommand(result) {
  const output = [result.stdout, result.stderr].filter(Boolean).join("\n").trim() || "completed";
  await emitEvent("command_output", { command: result.command, output });
}

async function remoteBranchExists(cwd, branch) {
  try {
    await runGit(cwd, ["rev-parse", "--verify", `origin/${branch}`]);
    return true;
  } catch {
    return false;
  }
}

async function resolveRemoteBranch(cwd) {
  for (const branch of DEFAULT_BRANCHES) {
    if (await remoteBranchExists(cwd, branch)) return branch;
  }

  try {
    const result = await runGit(cwd, ["ls-remote", "--symref", "origin", "HEAD"]);
    const match = result.stdout.match(/ref:\s+refs\/heads\/(\S+)/);
    if (match?.[1] && (await remoteBranchExists(cwd, match[1]))) {
      return match[1];
    }
  } catch {
    // ignore
  }

  return null;
}

async function checkoutRemoteBranch(cwd) {
  const branch = await resolveRemoteBranch(cwd);
  if (!branch) return null;
  const checkout = await runGit(cwd, ["checkout", "-B", branch, `origin/${branch}`]);
  await emitCommand(checkout);
  return branch;
}

async function pullLatest(cwd) {
  try {
    const result = await runGit(cwd, ["pull", "--ff-only"]);
    await emitCommand(result);
    return true;
  } catch {
    await runGit(cwd, ["fetch", "origin"]);
    const branch = await resolveRemoteBranch(cwd);
    if (!branch) return false;
    const result = await runGit(cwd, ["pull", "--ff-only", "origin", branch]);
    await emitCommand(result);
    return true;
  }
}

async function attachRemoteAndPull(cwd, repoUrl) {
  const init = await runGit(cwd, ["init"]);
  await emitCommand(init);
  const remote = await runGit(cwd, ["remote", "add", "origin", repoUrl]);
  await emitCommand(remote);
  await runGit(cwd, ["fetch", "origin"]);
  return checkoutRemoteBranch(cwd);
}

async function run() {
  const spec = await loadJobSpec();
  const cwd = path.resolve(process.env.WORKSPACE_DIR || "/workspace");
  const repoUrl = String(spec.repoUrl || process.env.REPO_URL || "").trim();
  await fsp.mkdir(cwd, { recursive: true });

  let hasGit = await isGitRepository(cwd);
  const empty = await isWorkspaceEmpty(cwd);

  if (repoUrl) {
    if (hasGit) {
      const pulled = await pullLatest(cwd);
      return {
        action: "pull",
        summary: pulled ? "已拉取远程仓库最新代码" : "已连接远程仓库，远程暂无提交",
      };
    }

    if (empty) {
      try {
        const result = await runGit(cwd, ["clone", repoUrl, "."]);
        await emitCommand(result);
        return { action: "clone", summary: "已从远程仓库克隆最新代码" };
      } catch (error) {
        if (!String(error.message).includes("already exists")) throw error;
        hasGit = await isGitRepository(cwd);
        if (!hasGit) throw error;
      }
    }

    const branch = await attachRemoteAndPull(cwd, repoUrl);
    if (!branch) {
      return { action: "attach_remote", summary: "已连接远程仓库，远程暂无提交" };
    }
    return { action: "attach_pull", summary: "已初始化 Git 并同步远程仓库最新代码" };
  }

  if (!hasGit) {
    const result = await runGit(cwd, ["init"]);
    await emitCommand(result);
    return { action: "init", summary: "已初始化本地 Git 仓库" };
  }

  return { action: "noop", summary: "Git 工作区已就绪" };
}

module.exports = {
  run,
};

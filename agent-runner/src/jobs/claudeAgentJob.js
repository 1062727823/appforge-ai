const path = require("path");
const config = require("../config");
const { acquireSlot, registerController, removeController, releaseSlot } = require("../agentPool");
const { emitEvent } = require("../callbackClient");
const { formatError } = require("../formatError");
const { loadJobSpec } = require("../jobSpec");
const { clearActiveRun, isTaskCancelled, registerActiveRun } = require("../jobCancel");

const WORKSPACE_DIR = process.env.WORKSPACE_DIR || "/workspace";
const TASK_ID = process.env.TASK_ID || "";
const DEFAULT_MODEL = config.deepseek.model;

function normalizePath(value) {
  if (!value || typeof value !== "string") return "";
  return value.replace(/\\/g, "/").replace(/^\.?\//, "");
}

function isLikelyWorkspacePath(value) {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length < 260 &&
    !/^https?:\/\//i.test(value) &&
    !/[\r\n]/.test(value) &&
    (value.includes("/") || value.includes("\\") || /\.[a-z0-9]+$/i.test(value))
  );
}

function collectPathHints(value, result = new Set()) {
  if (!value) return result;
  if (typeof value === "string") {
    if (isLikelyWorkspacePath(value)) result.add(normalizePath(value));
    return result;
  }
  if (Array.isArray(value)) {
    value.forEach((item) => collectPathHints(item, result));
    return result;
  }
  if (typeof value === "object") {
    Object.entries(value).forEach(([key, item]) => {
      if (/^(path|file|filename|target|targetPath|absolutePath|relativePath)$/i.test(key)) {
        collectPathHints(item, result);
      } else if (Array.isArray(item) || (item && typeof item === "object")) {
        collectPathHints(item, result);
      }
    });
  }
  return result;
}

function extractAssistantText(message) {
  const content = message?.message?.content;
  if (!Array.isArray(content)) return "";
  return content
    .filter((block) => block?.type === "text")
    .map((block) => block.text || "")
    .join("")
    .trim();
}

function extractToolCallBlocks(content) {
  if (!Array.isArray(content)) return [];
  return content.filter((block) => block?.type === "tool_use");
}

function stringifyCompact(value, maxLength = 900) {
  if (value === undefined || value === null) return "";
  const text = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
}

function describeToolBlock(block) {
  const name = block?.name || "tool";
  const input = block?.input || {};
  const pathHints = [...collectPathHints(input)].slice(0, 2);
  if (pathHints.length) return `${name}: ${pathHints.join(", ")}`;
  const args = stringifyCompact(input, 120);
  return args ? `${name}: ${args}` : name;
}

function extractCommandOutput(block) {
  if (!block?.name || !/^(shell|bash|terminal|command|Bash)$/i.test(block.name)) return null;
  const input = block.input || {};
  const command = input.command || input.cmd || block.name;
  return {
    command,
    output: "running in workspace",
  };
}

async function onEvent({ type, payload }) {
  await emitEvent(type, payload);
}

async function handleStreamEvent(event, changedFiles, streamedText) {
  if (!event || !event.event) return;

  const inner = event.event;

  // Content block: tool_use starts
  if (inner.type === "content_block_start") {
    if (inner.content_block?.type === "tool_use") {
      const block = inner.content_block;
      collectPathHints(block.input, changedFiles);

      await onEvent({
        payload: {
          message: describeToolBlock(block),
          paths: [...collectPathHints(block.input)],
          step: block.name || "tool_call",
        },
        type: "step_started",
      });
    }

    if (inner.content_block?.type === "thinking") {
      await onEvent({
        payload: { message: inner.content_block.thinking || "", step: "thinking" },
        type: "step_started",
      });
    }
  }

  // Content block: tool_use stops
  if (inner.type === "content_block_stop") {
    // Tool completed - handled via tool_result in assistant message
  }

  // Content delta: streaming text
  if (inner.type === "content_block_delta") {
    if (inner.delta?.type === "text_delta") {
      streamedText.current += inner.delta.text || "";
      await onEvent({ payload: { text: inner.delta.text || "" }, type: "agent_message" });
    }
    if (inner.delta?.type === "input_json_delta") {
      // partial tool input streaming, could emit if needed
    }
  }

  // Check for errors
  if (inner.type === "error") {
    await onEvent({
      payload: { message: `Claude API error: ${stringifyCompact(inner.error, 300)}` },
      type: "task_failed",
    });
  }
}

async function handleAssistantMessage(message, changedFiles, streamedText) {
  const content = message.message?.content;
  if (!Array.isArray(content)) return;

  // Process tool_use blocks (completed tools)
  const toolBlocks = extractToolCallBlocks(content);
  for (const block of toolBlocks) {
    collectPathHints(block.input, changedFiles);
    const cmdOutput = extractCommandOutput(block);
    if (cmdOutput) {
      await onEvent({ payload: cmdOutput, type: "command_output" });
    }
  }

  // Check for tool_result blocks (from content blocks)
  for (const block of content) {
    if (block?.type === "tool_result") {
      collectPathHints(block.content, changedFiles);
    }
  }
}

async function handleSystemMessage(message) {
  const subtype = message.subtype || "";

  if (subtype === "init") {
    const model = message.model || "claude";
    await onEvent({
      payload: {
        message: `Claude Agent SDK session started (model: ${model})`,
        step: "claude_sdk",
      },
      type: "step_started",
    });
  }

  if (subtype === "result") {
    // Final result with usage/cost stats
    const cost = message.cost_usd ? `$${message.cost_usd.toFixed(4)}` : "unknown";
    const turns = message.num_turns || 0;
    await onEvent({
      payload: {
        message: `Claude run finished: ${turns} turns, cost ${cost}`,
        step: "claude_sdk",
      },
      type: "step_started",
    });
  }
}

async function run() {
  const spec = await loadJobSpec();
  const prompt = spec.prompt || "";
  const appName = spec.appName || "AppForge Agent";
  const cwd = path.resolve(process.env.WORKSPACE_DIR || "/workspace");
  const model = spec.deepseekModel || DEFAULT_MODEL;
  const apiKey = (spec.deepseekApiKey || "").trim();

  if (!apiKey) {
    throw new Error(
      "DEEPSEEK_API_KEY not configured. Set deepseekApiKey in config.json or configure it in the API service.",
    );
  }

  process.env.ANTHROPIC_API_KEY = apiKey;
  process.env.ANTHROPIC_BASE_URL = config.deepseek.baseUrl;
  process.env.CLAUDE_CODE_SIMPLE = "1";

  await acquireSlot();

  const changedFiles = new Set();
  const streamedText = { current: "" };
  let hasFailureEvent = false;
  let failureMessage = "";

  try {
    // Dynamically import ESM-only SDK from CommonJS
    const { query } = await import("@anthropic-ai/claude-agent-sdk");

    const abortController = new AbortController();
    registerController(TASK_ID, abortController);
    registerActiveRun(TASK_ID, { abort: () => abortController.abort() });

    try {
      for await (const message of query({
        prompt,
        options: {
          cwd,
          model,
          maxTurns: 50,
          allowedTools: ["Read", "Write", "Edit", "Glob", "Grep", "Bash", "WebSearch", "WebFetch"],
          permissionMode: "bypassPermissions",
          extraArgs: { print: null },
        },
      })) {
        if (isTaskCancelled(TASK_ID)) {
          abortController.abort();
          throw new Error("Task cancelled by user");
        }

        if (message.type === "assistant") {
          await handleAssistantMessage(message, changedFiles, streamedText);
        }

        if (message.type === "stream_event") {
          await handleStreamEvent(message, changedFiles, streamedText);
        }

        if (message.type === "system") {
          await handleSystemMessage(message);
        }

        if (message.type === "result") {
          // Final result message
          const resultText = message.result || "";
          if (resultText && !streamedText.current.includes(resultText)) {
            await onEvent({ payload: { text: resultText }, type: "agent_message" });
          }
        }
      }
    } finally {
      removeController(TASK_ID);
      clearActiveRun(TASK_ID);
    }

    return {
      changedFiles: [...changedFiles],
      failureMessage: hasFailureEvent ? failureMessage : undefined,
      hasFailureEvent,
      status: hasFailureEvent ? "failed" : "finished",
    };
  } catch (error) {
    if (isTaskCancelled(TASK_ID)) {
      return {
        changedFiles: [],
        failureMessage: "Task cancelled",
        hasFailureEvent: true,
        status: "cancelled",
      };
    }
    throw error;
  } finally {
    releaseSlot();
  }
}

module.exports = {
  run,
};

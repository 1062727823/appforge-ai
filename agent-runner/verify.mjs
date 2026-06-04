#!/usr/bin/env node
/**
 * Verification script for @anthropic-ai/claude-agent-sdk with DeepSeek.
 *
 * Usage:
 *   node verify.mjs <DEEPSEEK_API_KEY>
 *   DEEPSEEK_API_KEY=sk-xxx node verify.mjs
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const config = JSON.parse(fs.readFileSync(path.resolve(__dirname, "config.json"), "utf-8"));

const apiKey =
  process.argv[2] ||
  process.env.DEEPSEEK_API_KEY ||
  "";

if (!apiKey) {
  console.error("ERROR: No DeepSeek API key provided.");
  console.error("Usage: node verify.mjs <DEEPSEEK_API_KEY>");
  console.error("   or: DEEPSEEK_API_KEY=sk-xxx node verify.mjs");
  process.exit(1);
}

const BASE_URL = config.deepseek.baseUrl;
const MODEL = config.deepseek.model;

console.log("=== AppForge Agent Runner — SDK Verification ===\n");
console.log(`Base URL: ${BASE_URL}`);
console.log(`Model:    ${MODEL}`);
console.log(`API Key:  ${apiKey.slice(0, 10)}...\n`);

async function main() {
  console.log("1. Dynamically importing @anthropic-ai/claude-agent-sdk...");
  const { query } = await import("@anthropic-ai/claude-agent-sdk");
  console.log("   OK — query function imported.\n");

  process.env.ANTHROPIC_API_KEY = apiKey;
  process.env.ANTHROPIC_BASE_URL = BASE_URL;

  console.log("2. Sending test prompt to DeepSeek...\n");
  console.log("-".repeat(60));

  const stream = query({
    prompt: 'Reply with exactly: "OK — DeepSeek connection works." No other text.',
    options: {
      model: MODEL,
      maxTurns: 1,
      permissionMode: "bypassPermissions",
      allowedTools: [],
    },
  });

  let textOutput = "";

  for await (const msg of stream) {
    switch (msg.type) {
      case "system":
        if (msg.subtype === "init") {
          console.log(`[system] Session started — model: ${msg.model}`);
        }
        if (msg.subtype === "result") {
          console.log(
            `[system] Finished — turns: ${msg.num_turns}, cost: $${(msg.cost_usd || 0).toFixed(4)}`,
          );
        }
        break;

      case "assistant":
        for (const block of msg.message?.content || []) {
          if (block.type === "text") {
            textOutput += block.text;
            process.stdout.write(block.text);
          }
          if (block.type === "tool_use") {
            console.log(`\n[tool] ${block.name}(${JSON.stringify(block.input)})`);
          }
        }
        console.log();
        break;

      case "stream_event": {
        const inner = msg.event;
        if (inner?.type === "content_block_delta" && inner.delta?.type === "text_delta") {
          process.stdout.write(inner.delta.text);
        }
        break;
      }

      case "result":
        if (msg.result && !textOutput) {
          console.log(msg.result);
        }
        break;
    }
  }

  console.log("\n" + "-".repeat(60));
  console.log("\n3. Verification complete.");

  if (textOutput.trim()) {
    console.log("   SUCCESS: Got response from DeepSeek via Claude Agent SDK.");
  } else {
    console.log("   WARNING: No text response received. Check model name and API key.");
  }
}

main().catch((err) => {
  console.error("\nVERIFICATION FAILED:", err.message);
  if (err.cause) console.error("  Cause:", err.cause);
  process.exit(1);
});

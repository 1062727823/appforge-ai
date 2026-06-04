const path = require("path");
const fs = require("fs");

const configPath = path.resolve(__dirname, "..", "config.json");

let config;

try {
  const raw = fs.readFileSync(configPath, "utf-8");
  config = JSON.parse(raw);
} catch (err) {
  process.stderr.write(`[agent-runner] Failed to load config.json: ${err.message}\n`);
  config = {
    deepseek: { baseUrl: "https://api.deepseek.com/anthropic", model: "deepseek-v4-pro" },
    runner: { port: 8080, maxConcurrent: 3 },
    callback: { url: "http://api:4173", token: "dev-runner-token" },
  };
}

// Environment variable overrides take precedence over config.json
if (process.env.DEEPSEEK_MODEL) {
  config.deepseek.model = process.env.DEEPSEEK_MODEL;
}
if (process.env.DEEPSEEK_BASE_URL) {
  config.deepseek.baseUrl = process.env.DEEPSEEK_BASE_URL;
}
if (process.env.CALLBACK_URL) {
  config.callback.url = process.env.CALLBACK_URL;
}
if (process.env.CALLBACK_TOKEN) {
  config.callback.token = process.env.CALLBACK_TOKEN;
}
if (process.env.RUNNER_PORT) {
  config.runner.port = parseInt(process.env.RUNNER_PORT, 10) || config.runner.port;
}
if (process.env.AGENT_POOL_MAX_CONCURRENT) {
  config.runner.maxConcurrent = parseInt(process.env.AGENT_POOL_MAX_CONCURRENT, 10) || config.runner.maxConcurrent;
}

module.exports = config;

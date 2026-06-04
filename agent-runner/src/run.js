const { emitEvent, emitFinished } = require("./callbackClient");
const { formatError } = require("./formatError");

async function executeJob() {
  const jobType = process.env.JOB_TYPE;
  if (!jobType) {
    throw new Error("JOB_TYPE is required");
  }

  let result;
  if (jobType === "claude_agent" || jobType === "cursor_agent") {
    result = await require("./jobs/claudeAgentJob").run();
  } else if (jobType === "git_sync") {
    result = await require("./jobs/gitSyncJob").run();
  } else {
    throw new Error(`Unknown JOB_TYPE: ${jobType}`);
  }

  const failed =
    result?.hasFailureEvent || result?.status === "failed" || result?.status === "error";
  const errorMessage =
    result?.failureMessage ||
    (typeof result?.result?.result === "string" ? result.result.result : "") ||
    "Agent run failed";

  await emitFinished({
    ...result,
    error: failed ? errorMessage : undefined,
    failureMessage: result?.failureMessage,
    ok: !failed,
  });

  return result;
}

async function handleJobFailure(error) {
  const message = formatError(error);
  process.stderr.write(`${message}\n`);
  if (error?.stack) process.stderr.write(`${error.stack}\n`);
  try {
    await emitEvent("task_failed", { message });
    await emitFinished({ error: message, ok: false });
  } catch (callbackError) {
    process.stderr.write(`${formatError(callbackError)}\n`);
  }
}

async function runJob() {
  try {
    return await executeJob();
  } catch (error) {
    await handleJobFailure(error);
    throw error;
  }
}

if (require.main === module) {
  runJob().catch(() => process.exit(1));
}

module.exports = {
  executeJob,
  runJob,
};

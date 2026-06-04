function isAuthError(err) {
  if (!err) return false;
  if (err.status === 401) return true;
  if (err.code === "unauthenticated") return true;
  if (err.name === "AuthenticationError") return true;
  if (/authentication/i.test(err.message || "")) return true;
  return isAuthError(err.cause);
}

function isNetworkError(err) {
  if (!err) return false;
  if (err.code === "unavailable" || err.code === "ECONNRESET" || err.code === "ETIMEDOUT") return true;
  if (err.isRetryable === true) return true;
  const message = String(err.message || err.rawMessage || "");
  if (/fetch failed|network|ConnectError/i.test(message)) return true;
  return isNetworkError(err.cause);
}

function formatError(err) {
  if (!err) return "Unknown error";
  if (typeof err === "string") return err;

  if (isAuthError(err)) {
    return "DEEPSEEK_API_KEY authentication failed. Check that deepseekApiKey is correctly configured in config.json or the API service settings.";
  }

  if (isNetworkError(err)) {
    return "Unable to connect to DeepSeek API. Check Docker container network, proxy, or firewall settings and retry";
  }

  const root = err.cause && typeof err.cause === "object" ? err.cause : err;
  const parts = [
    root.message,
    root.code,
    root.status ? `HTTP ${root.status}` : "",
  ].filter((part) => part && part !== "Error");

  if (parts.length) return parts.join(" | ");

  if (err.rawMessage && err.rawMessage !== "Error") return String(err.rawMessage);
  if (err.message && err.message !== "Error") return err.message;

  return "Agent runner failed";
}

module.exports = {
  formatError,
  isAuthError,
  isNetworkError,
};

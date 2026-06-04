export const GITLAB_REPO_URL_ERROR = "请输入有效的 GitLab 仓库地址";

/**
 * Validate a GitLab repository URL against allowed hosts.
 * Accepts URLs like:
 *   https://gitlab.com/owner/repo
 *   https://gitlab.example.com/group/subgroup/repo
 *   git@gitlab.com:owner/repo.git
 */
export function isValidGitLabRepoUrl(url, { baseUrl, hosts } = {}) {
  if (!url || typeof url !== "string") return false;

  const trimmed = url.trim();

  // SSH format: git@host:path
  const sshMatch = trimmed.match(/^git@([^:]+):(.+)$/);
  if (sshMatch) {
    const host = sshMatch[1];
    const path = sshMatch[2].replace(/\.git$/, "");
    return hasValidHost(host, hosts, baseUrl) && path.split("/").length >= 2;
  }

  // HTTPS format: https://host/path
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return false;
    const path = parsed.pathname.replace(/\.git$/, "").replace(/\/$/, "");
    return hasValidHost(parsed.hostname, hosts, baseUrl) && path.split("/").filter(Boolean).length >= 2;
  } catch {
    return false;
  }
}

function hasValidHost(host, hosts, baseUrl) {
  if (hosts && Array.isArray(hosts) && hosts.length > 0) {
    return hosts.some((h) => {
      try {
        return new URL(h).hostname === host;
      } catch {
        return h === host;
      }
    });
  }
  if (baseUrl) {
    try {
      return new URL(baseUrl).hostname === host;
    } catch {
      return baseUrl === host;
    }
  }
  // No host restriction configured — accept common GitLab hosts
  return host === "gitlab.com" || host.endsWith(".gitlab.com");
}
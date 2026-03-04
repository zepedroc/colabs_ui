function isPrivateOrLoopbackHost(hostname: string) {
  const lower = hostname.toLowerCase();

  if (
    lower === "localhost" ||
    lower === "127.0.0.1" ||
    lower === "0.0.0.0" ||
    lower === "::1"
  ) {
    return true;
  }

  if (lower.startsWith("127.")) {
    return true;
  }

  // RFC1918 private IPv4 ranges.
  if (lower.startsWith("10.") || lower.startsWith("192.168.")) {
    return true;
  }
  if (lower.startsWith("172.")) {
    const secondOctet = Number.parseInt(lower.split(".")[1] || "", 10);
    if (!Number.isNaN(secondOctet) && secondOctet >= 16 && secondOctet <= 31) {
      return true;
    }
  }

  return false;
}

export function getFastApiBaseUrl() {
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;
  const configuredUrl = env?.FASTAPI_URL?.trim();

  if (!configuredUrl) {
    throw new Error(
      [
        "Missing FASTAPI_URL in Convex environment.",
        "Convex actions run in Convex cloud and cannot call your local FastAPI at localhost/127.0.0.1.",
        "Set FASTAPI_URL to a publicly reachable URL (for example, your deployed API URL or a tunnel URL).",
      ].join(" "),
    );
  }

  let parsed: URL;
  try {
    parsed = new URL(configuredUrl);
  } catch {
    throw new Error("FASTAPI_URL is invalid. Provide a full URL like https://your-api.example.com");
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("FASTAPI_URL must start with http:// or https://");
  }

  if (isPrivateOrLoopbackHost(parsed.hostname)) {
    throw new Error(
      [
        `FASTAPI_URL points to a private/loopback address (${parsed.hostname}), which Convex cannot reach.`,
        "Use a publicly reachable URL instead (deployment URL or tunnel URL).",
      ].join(" "),
    );
  }

  return configuredUrl.replace(/\/+$/, "");
}

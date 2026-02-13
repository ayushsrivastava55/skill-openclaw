import { createServer, IncomingMessage, ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";

type DeployPayload = {
  deploymentId: string;
  provider?: string;
  model: string;
  modelApiKey: string;
  channel: "telegram" | "discord" | "slack";
  channelPrimaryToken: string;
  channelSecondaryToken?: string;
  gatewayToken?: string;
  runtimeImage?: string;
  callbackUrl?: string;
  callbackToken?: string;
  brandConfig?: {
    skillContent: string;
    skillFileName: string;
    heartbeatContent: string;
    heartbeatFileName: string;
  };
};

type ChatPayload = {
  deploymentId: string;
  channel: "telegram" | "discord" | "slack";
  sessionId: string;
  message: string;
};

const port = Number(process.env.PORT ?? "8088");
const token = process.env.CONTROLLER_TOKEN;
const defaultImage = process.env.DEFAULT_RUNTIME_IMAGE ?? "ghcr.io/openclaw/openclaw:latest";
const warmPoolSize = Number(process.env.CONTROLLER_WARM_POOL_SIZE ?? "2");

if (!token) {
  // eslint-disable-next-line no-console
  console.error("CONTROLLER_TOKEN is required");
  process.exit(1);
}

function json(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => {
      data += chunk.toString("utf8");
    });
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

function run(command: string, args: string[]) {
  return new Promise<{ stdout: string; stderr: string; code: number }>((resolve) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString("utf8");
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString("utf8");
    });

    child.on("close", (code) => {
      resolve({ stdout, stderr, code: code ?? 1 });
    });
  });
}

function sanitizeContainerName(deploymentId: string) {
  const safe = deploymentId.replace(/[^a-zA-Z0-9_.-]/g, "").slice(0, 45);
  return `claw-${safe || "runtime"}`;
}

async function listWarmContainers() {
  const result = await run("docker", [
    "ps",
    "-a",
    "--filter",
    "name=^claw-warm-",
    "--format",
    "{{.Names}}"
  ]);
  if (result.code !== 0) {
    return [];
  }
  return result.stdout
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean)
    .sort();
}

async function ensureWarmContainer(containerName: string, image: string) {
  await run("docker", ["rm", "-f", containerName]);
  return run("docker", [
    "run",
    "-d",
    "--name",
    containerName,
    "--restart",
    "unless-stopped",
    "--label",
    "simpleclaw.role=warm",
    "--entrypoint",
    "sh",
    image,
    "-lc",
    "sleep infinity"
  ]);
}

async function reconcileWarmPool() {
  if (!Number.isFinite(warmPoolSize) || warmPoolSize <= 0) {
    return;
  }

  const image = defaultImage;
  const existing = await listWarmContainers();

  // Remove overflow warm containers first.
  if (existing.length > warmPoolSize) {
    for (const name of existing.slice(warmPoolSize)) {
      await run("docker", ["rm", "-f", name]);
    }
  }

  for (let i = 1; i <= warmPoolSize; i += 1) {
    const name = `claw-warm-${i}`;
    const check = await run("docker", ["ps", "--filter", `name=^${name}$`, "--format", "{{.Names}}"]);
    if (check.code === 0 && check.stdout.trim() === name) {
      continue;
    }
    const created = await ensureWarmContainer(name, image);
    if (created.code !== 0) {
      // eslint-disable-next-line no-console
      console.error(`[runtime-controller] warm pool failed for ${name}: ${created.stderr}`);
    }
  }
}

function resolveGatewayToken(payload: DeployPayload) {
  const fromPayload = payload.gatewayToken?.trim();
  if (fromPayload) {
    return fromPayload;
  }
  return randomUUID().replace(/-/g, "");
}

async function postStatus(payload: DeployPayload, status: string, message: string) {
  if (!payload.callbackUrl || !payload.callbackToken) {
    return;
  }
  await fetch(payload.callbackUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${payload.callbackToken}`
    },
    body: JSON.stringify({
      deploymentId: payload.deploymentId,
      status,
      message
    })
  }).catch(() => {
    // best effort
  });
}

async function handleDeploy(payload: DeployPayload) {
  const required = [
    payload.deploymentId,
    payload.provider ?? "openrouter",
    payload.model,
    payload.modelApiKey,
    payload.channel,
    payload.channelPrimaryToken
  ];
  if (required.some((value) => !value || value.trim().length === 0)) {
    return { ok: false, error: "Missing required deployment fields" };
  }
  if (payload.channel === "slack" && !payload.channelSecondaryToken?.trim()) {
    return { ok: false, error: "Missing required deployment fields: channelSecondaryToken" };
  }

  const image = payload.runtimeImage?.trim() || defaultImage;
  const containerName = sanitizeContainerName(payload.deploymentId);
  const gatewayToken = resolveGatewayToken(payload);

  await postStatus(payload, "setup_started", "Remote controller received deploy request.");

  await run("docker", ["rm", "-f", containerName]);

  const dockerArgs = [
    "run",
    "-d",
    "--name",
    containerName,
    "--restart",
    "unless-stopped",
    "-e",
    `OPENCLAW_PROVIDER=${payload.provider ?? "openrouter"}`,
    "-e",
    `OPENCLAW_MODEL=${payload.model}`,
    "-e",
    `OPENCLAW_API_KEY=${payload.modelApiKey}`,
    "-e",
    `OPENCLAW_CHANNEL=${payload.channel}`,
    "-e",
    `OPENCLAW_CHANNEL_PRIMARY_TOKEN=${payload.channelPrimaryToken}`,
    "-e",
    `OPENCLAW_CHANNEL_SECONDARY_TOKEN=${payload.channelSecondaryToken ?? ""}`,
    "-e",
    "OPENCLAW_DM_POLICY=open",
    "-e",
    `DEPLOYMENT_ID=${payload.deploymentId}`,
    "-e",
    `RUNTIME_CALLBACK_URL=${payload.callbackUrl ?? ""}`,
    "-e",
    `RUNTIME_CALLBACK_TOKEN=${payload.callbackToken ?? ""}`,
    "-e",
    `OPENCLAW_GATEWAY_TOKEN=${gatewayToken}`,
  ];

  let tempDir = "";
  if (payload.brandConfig) {
    try {
      tempDir = join("/tmp", `brand-deploy-${payload.deploymentId}-${randomUUID().slice(0, 8)}`);
      mkdirSync(tempDir, { recursive: true });

      const skillPath = join(tempDir, "skills", payload.brandConfig.skillFileName);
      mkdirSync(join(tempDir, "skills"), { recursive: true });
      writeFileSync(skillPath, payload.brandConfig.skillContent);

      const heartbeatPath = join(tempDir, payload.brandConfig.heartbeatFileName);
      writeFileSync(heartbeatPath, payload.brandConfig.heartbeatContent);

      dockerArgs.push("-v", `${tempDir}/skills:/home/node/openclaw/workspace/skills:ro`);
      dockerArgs.push("-v", `${tempDir}/${payload.brandConfig.heartbeatFileName}:/home/node/openclaw/workspace/HEARTBEAT.md:ro`);
    } catch (err) {
      console.error("[runtime-controller] Failed to create brand config files:", err);
    }
  }

  dockerArgs.push(image);

  const runResult = await run("docker", dockerArgs);

  if (tempDir) {
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch {}
  }

  if (runResult.code !== 0) {
    await postStatus(payload, "setup_error", `Failed to run runtime container: ${runResult.stderr}`);
    return { ok: false, error: "Docker run failed", details: runResult.stderr };
  }

  const jobId = randomUUID();
  return { ok: true, jobId, containerName, containerId: runResult.stdout.trim() };
}

function parseAgentJson(stdout: string) {
  const start = stdout.indexOf("{");
  const end = stdout.lastIndexOf("}");
  if (start < 0 || end <= start) {
    return null;
  }
  try {
    return JSON.parse(stdout.slice(start, end + 1)) as {
      result?: {
        payloads?: Array<{ text?: string | null }>;
      };
    };
  } catch {
    return null;
  }
}

async function handleChat(payload: ChatPayload) {
  if (!payload.deploymentId?.trim() || !payload.sessionId?.trim() || !payload.message?.trim()) {
    return { ok: false, error: "Missing required chat fields" };
  }

  const containerName = sanitizeContainerName(payload.deploymentId);
  const execResult = await run("docker", [
    "exec",
    "-e",
    "OPENCLAW_CONFIG_PATH=/tmp/openclaw/openclaw.json",
    "-e",
    "OPENCLAW_STATE_DIR=/tmp/openclaw",
    containerName,
    "openclaw",
    "agent",
    "--message",
    payload.message.trim(),
    "--session-id",
    payload.sessionId.trim(),
    "--channel",
    payload.channel,
    "--json"
  ]);

  if (execResult.code !== 0) {
    return { ok: false, error: "Runtime chat execution failed", details: execResult.stderr };
  }

  const parsed = parseAgentJson(execResult.stdout);
  if (!parsed) {
    return { ok: false, error: "Runtime returned invalid chat payload" };
  }

  const text = (parsed.result?.payloads ?? [])
    .map((payloadItem) => payloadItem.text?.trim() ?? "")
    .filter(Boolean)
    .join("\n\n");

  return {
    ok: true,
    reply: text || "No response returned.",
    sessionId: payload.sessionId.trim()
  };
}

async function handleStop(deploymentId: string) {
  if (!deploymentId?.trim()) {
    return { ok: false, error: "Missing deploymentId" };
  }
  const containerName = sanitizeContainerName(deploymentId);
  const result = await run("docker", ["rm", "-f", containerName]);
  if (result.code !== 0) {
    return { ok: false, error: result.stderr || "Failed to stop container" };
  }
  return { ok: true };
}

const server = createServer(async (req, res) => {
  if (req.method === "POST" && req.url === "/deploy") {
    const auth = req.headers.authorization;
    if (auth !== `Bearer ${token}`) {
      return json(res, 401, { error: "Unauthorized" });
    }

    try {
      const body = await readBody(req);
      const payload = JSON.parse(body) as DeployPayload;
      const result = await handleDeploy(payload);
      if (!result.ok) {
        return json(res, 400, result);
      }
      return json(res, 200, result);
    } catch (error) {
      return json(res, 500, {
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  }

  if (req.method === "GET" && req.url === "/health") {
    return json(res, 200, { ok: true });
  }

  if (req.method === "POST" && req.url === "/chat") {
    const auth = req.headers.authorization;
    if (auth !== `Bearer ${token}`) {
      return json(res, 401, { error: "Unauthorized" });
    }

    try {
      const body = await readBody(req);
      const payload = JSON.parse(body) as ChatPayload;
      const result = await handleChat(payload);
      if (!result.ok) {
        return json(res, 400, result);
      }
      return json(res, 200, result);
    } catch (error) {
      return json(res, 500, {
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  }

  if (req.method === "POST" && req.url === "/stop") {
    const auth = req.headers.authorization;
    if (auth !== `Bearer ${token}`) {
      return json(res, 401, { error: "Unauthorized" });
    }

    try {
      const body = await readBody(req);
      const payload = JSON.parse(body) as { deploymentId?: string };
      const result = await handleStop(payload.deploymentId ?? "");
      if (!result.ok) {
        return json(res, 400, result);
      }
      return json(res, 200, result);
    } catch (error) {
      return json(res, 500, {
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  }

  return json(res, 404, { error: "Not found" });
});

server.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`[runtime-controller] listening on :${port}`);
  void reconcileWarmPool().catch((error) => {
    // eslint-disable-next-line no-console
    console.error(
      `[runtime-controller] warm pool init failed: ${error instanceof Error ? error.message : "unknown"}`
    );
  });

  setInterval(() => {
    void reconcileWarmPool().catch(() => {});
  }, 30_000);
});

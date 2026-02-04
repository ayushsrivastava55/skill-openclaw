import { createServer, IncomingMessage, ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";

type DeployPayload = {
  deploymentId: string;
  model: string;
  modelApiKey: string;
  telegramToken: string;
  runtimeImage?: string;
  callbackUrl?: string;
  callbackToken?: string;
};

const port = Number(process.env.PORT ?? "8088");
const token = process.env.CONTROLLER_TOKEN;
const defaultImage = process.env.DEFAULT_RUNTIME_IMAGE ?? "ghcr.io/openclaw/openclaw:latest";

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
  const required = [payload.deploymentId, payload.model, payload.modelApiKey, payload.telegramToken];
  if (required.some((value) => !value || value.trim().length === 0)) {
    return { ok: false, error: "Missing required deployment fields" };
  }

  const image = payload.runtimeImage?.trim() || defaultImage;
  const containerName = sanitizeContainerName(payload.deploymentId);

  await postStatus(payload, "setup_started", "Remote controller received deploy request.");

  await run("docker", ["rm", "-f", containerName]);

  const runResult = await run("docker", [
    "run",
    "-d",
    "--name",
    containerName,
    "--restart",
    "unless-stopped",
    "-e",
    `OPENCLAW_MODEL=${payload.model}`,
    "-e",
    `OPENCLAW_API_KEY=${payload.modelApiKey}`,
    "-e",
    `TELEGRAM_BOT_TOKEN=${payload.telegramToken}`,
    "-e",
    "OPENCLAW_DM_POLICY=pairing",
    "-e",
    `DEPLOYMENT_ID=${payload.deploymentId}`,
    "-e",
    `RUNTIME_CALLBACK_URL=${payload.callbackUrl ?? ""}`,
    "-e",
    `RUNTIME_CALLBACK_TOKEN=${payload.callbackToken ?? ""}`,
    image
  ]);

  if (runResult.code !== 0) {
    await postStatus(payload, "setup_error", `Failed to run runtime container: ${runResult.stderr}`);
    return { ok: false, error: "Docker run failed", details: runResult.stderr };
  }

  const jobId = randomUUID();
  return { ok: true, jobId, containerName, containerId: runResult.stdout.trim() };
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

  return json(res, 404, { error: "Not found" });
});

server.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`[runtime-controller] listening on :${port}`);
});

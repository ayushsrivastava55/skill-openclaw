import { popNextJob } from "../lib/store";
import { processDeploymentJob } from "../lib/provisioning";

const POLL_MS = 1000;

async function tick() {
  const job = await popNextJob();
  if (!job) {
    return;
  }
  try {
    await processDeploymentJob(job.deploymentId);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown worker error";
    console.error(`[worker] failed job ${job.id}: ${message}`);
  }
}

async function run() {
  console.log("[worker] control-plane started");
  // eslint-disable-next-line no-constant-condition
  while (true) {
    await tick();
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
  }
}

void run();

import { getDeploymentById, getLatestPersistedEvent, subscribeDeployment } from "@/lib/store";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const rowId = searchParams.get("rowId");

  if (!rowId) {
    return new Response("rowId is required", { status: 400 });
  }

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const send = (data: unknown) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      let lastSentKey = "";

      const sendEvent = (event: { status?: string; message?: string; createdAt?: string; id?: string }) => {
        const key = `${event.id ?? ""}:${event.status ?? ""}:${event.createdAt ?? ""}:${event.message ?? ""}`;
        if (key && key === lastSentKey) {
          return;
        }
        if (key) {
          lastSentKey = key;
        }
        send({
          deployment_status: event.status,
          message: event.message,
          createdAt: event.createdAt
        });
      };

      // Best-effort initial snapshot from persisted deployment + event state in DB.
      try {
        const deployment = await getDeploymentById(rowId);
        if (deployment) {
          const deploymentMs = Date.parse(deployment.updatedAt ?? deployment.createdAt);
          // Always emit the current deployment doc status first (source of truth).
          sendEvent({ id: deployment.id, status: deployment.status, createdAt: deployment.updatedAt ?? deployment.createdAt });

          // Then, if the latest event matches that status, emit its message for richer UX.
          const latestDb = await getLatestPersistedEvent(rowId);
          if (latestDb && latestDb.status === deployment.status) {
            const eventMs = Date.parse(latestDb.createdAt);
            // Avoid showing stale messages from a previous run.
            if (Number.isFinite(deploymentMs) && Number.isFinite(eventMs) && eventMs >= deploymentMs - 10_000) {
              sendEvent({ id: latestDb.id, status: latestDb.status, message: latestDb.message, createdAt: latestDb.createdAt });
            }
          }
        }
      } catch {
        // ignore initial snapshot errors; subscription and poll can recover.
      }

      const unsubscribe = subscribeDeployment(rowId, (event) => {
        sendEvent({ id: event.id, status: event.status, message: event.message, createdAt: event.createdAt });
      });

      // Poll latest status snapshot to keep SSE clients in sync.
      const poll = setInterval(async () => {
        try {
          const deployment = await getDeploymentById(rowId);
          if (deployment) {
            const deploymentMs = Date.parse(deployment.updatedAt ?? deployment.createdAt);
            sendEvent({ id: deployment.id, status: deployment.status, createdAt: deployment.updatedAt ?? deployment.createdAt });

            const latestDb = await getLatestPersistedEvent(rowId);
            if (latestDb && latestDb.status === deployment.status) {
              const eventMs = Date.parse(latestDb.createdAt);
              if (Number.isFinite(deploymentMs) && Number.isFinite(eventMs) && eventMs >= deploymentMs - 10_000) {
                sendEvent({ id: latestDb.id, status: latestDb.status, message: latestDb.message, createdAt: latestDb.createdAt });
              }
            }
            return;
          }
        } catch {
          // ignore
        }
      }, 2000);

      const heartbeat = setInterval(() => {
        controller.enqueue(encoder.encode(": heartbeat\n\n"));
      }, 15000);

      request.signal.addEventListener("abort", () => {
        clearInterval(poll);
        clearInterval(heartbeat);
        unsubscribe();
        controller.close();
      });
    }
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive"
    }
  });
}

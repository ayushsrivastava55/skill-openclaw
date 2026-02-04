import { getLatestEvent, subscribeDeployment } from "@/lib/store";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const rowId = searchParams.get("rowId");

  if (!rowId) {
    return new Response("rowId is required", { status: 400 });
  }

  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();
      const send = (data: unknown) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      const latest = getLatestEvent(rowId);
      if (latest) {
        send({
          deployment_status: latest.status,
          message: latest.message,
          createdAt: latest.createdAt
        });
      }

      const unsubscribe = subscribeDeployment(rowId, (event) => {
        send({
          deployment_status: event.status,
          message: event.message,
          createdAt: event.createdAt
        });
      });

      const heartbeat = setInterval(() => {
        controller.enqueue(encoder.encode(": heartbeat\n\n"));
      }, 15000);

      request.signal.addEventListener("abort", () => {
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

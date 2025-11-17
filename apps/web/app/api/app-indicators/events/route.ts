import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import {
  subscribeToDockIndicatorEvents,
  type DockIndicatorEvent,
} from "@/lib/server-events";

const encoder = new TextEncoder();
const HEARTBEAT_INTERVAL = 25_000;

const formatEvent = (event: string, payload: object) =>
  `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;

export async function GET(request: Request) {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;
  let cleanup: (() => void) | null = null;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const pushEvent = (event: string, payload: object) => {
        controller.enqueue(encoder.encode(formatEvent(event, payload)));
      };

      let keepAlive: ReturnType<typeof setInterval> | null = null;
      let unsubscribe: (() => void) | null = null;
      let closed = false;

      const close = () => {
        if (closed) return;
        closed = true;
        if (keepAlive) {
          clearInterval(keepAlive);
          keepAlive = null;
        }
        unsubscribe?.();
        unsubscribe = null;
        controller.close();
      };

      cleanup = close;
      request.signal.addEventListener("abort", close, { once: true });

      keepAlive = setInterval(() => {
        try {
          pushEvent("ping", {});
        } catch {
          close();
        }
      }, HEARTBEAT_INTERVAL);

      unsubscribe = subscribeToDockIndicatorEvents(userId, (event) => {
        try {
          pushEvent("indicator", event as DockIndicatorEvent);
        } catch {
          close();
        }
      });

      pushEvent("ready", {});
    },
    cancel() {
      cleanup?.();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      Connection: "keep-alive",
      "Cache-Control": "no-cache, no-transform",
    },
  });
}

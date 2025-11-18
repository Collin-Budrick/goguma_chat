import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";

import { ensureConversationParticipant } from "@/db/conversations";
import { auth } from "@/lib/auth";

const TOKEN_TTL_MS = 10 * 60 * 1000;
const HEARTBEAT_INTERVAL = 25_000;

const encoder = new TextEncoder();

type PeerSignalingRole = "host" | "guest";
type PeerSignalingKind = "offer" | "answer";

type PendingToken = {
  id: string;
  conversationId: string;
  kind: PeerSignalingKind;
  token: string;
  fromRole: PeerSignalingRole;
  toRole: PeerSignalingRole;
  sessionId: string;
  viewerId: string;
  createdAt: number;
};

type TokenSubscriber = {
  role: PeerSignalingRole;
  notify: (token: PendingToken) => void;
};

type TokenStore = {
  tokens: PendingToken[];
  subscribers: Map<string, TokenSubscriber>;
};

const stores = new Map<string, TokenStore>();

const logPeerSignalingServer = (message: string, meta?: Record<string, unknown>) => {
  const payload = meta ? JSON.stringify(meta) : "";
  console.info(`[peer-signaling:server] ${message}${payload ? ` ${payload}` : ""}`);
};

const getStore = (conversationId: string): TokenStore => {
  if (!stores.has(conversationId)) {
    stores.set(conversationId, { tokens: [], subscribers: new Map() });
  }
  return stores.get(conversationId)!;
};

const pruneExpiredTokens = (conversationId: string) => {
  const store = stores.get(conversationId);
  if (!store) return;
  const cutoff = Date.now() - TOKEN_TTL_MS;
  store.tokens = store.tokens.filter((token) => token.createdAt > cutoff);
  if (!store.tokens.length && store.subscribers.size === 0) {
    stores.delete(conversationId);
  }
};

const enqueueToken = (token: PendingToken) => {
  const store = getStore(token.conversationId);
  store.tokens.push(token);
  logPeerSignalingServer("enqueued token", {
    conversationId: token.conversationId,
    id: token.id,
    kind: token.kind,
    fromRole: token.fromRole,
    toRole: token.toRole,
    viewerId: token.viewerId,
  });
  deliverPendingTokens(token.conversationId, token.toRole);
};

const consumeToken = (conversationId: string, tokenId: string) => {
  const store = stores.get(conversationId);
  if (!store) return;
  store.tokens = store.tokens.filter((entry) => entry.id !== tokenId);
};

const deliverPendingTokens = (conversationId: string, role: PeerSignalingRole) => {
  pruneExpiredTokens(conversationId);
  const store = stores.get(conversationId);
  if (!store) return;
  const pending = store.tokens.filter((token) => token.toRole === role);
  logPeerSignalingServer("attempting delivery", {
    conversationId,
    role,
    pendingCount: pending.length,
    subscriberCount: store.subscribers.size,
  });
  if (!pending.length) return;

  for (const token of pending) {
    for (const subscriber of store.subscribers.values()) {
      if (subscriber.role !== role) continue;
      logPeerSignalingServer("delivering token to subscriber", {
        conversationId,
        role,
        tokenId: token.id,
      });
      subscriber.notify(token);
    }
    consumeToken(conversationId, token.id);
  }
};

const subscribeToTokens = (
  conversationId: string,
  subscriptionKey: string,
  subscriber: TokenSubscriber,
): (() => void) => {
  const store = getStore(conversationId);
  const existing = store.subscribers.get(subscriptionKey);
  if (existing) {
    store.subscribers.delete(subscriptionKey);
    logPeerSignalingServer("existing subscriber replaced", {
      conversationId,
      role: existing.role,
      subscriberCount: store.subscribers.size,
    });
  }
  store.subscribers.set(subscriptionKey, subscriber);
  logPeerSignalingServer("subscriber added", {
    conversationId,
    role: subscriber.role,
    subscriberCount: store.subscribers.size,
  });
  return () => {
    const nextStore = stores.get(conversationId);
    const current = nextStore?.subscribers.get(subscriptionKey);
    if (current === subscriber) {
      nextStore?.subscribers.delete(subscriptionKey);
    }
    logPeerSignalingServer("subscriber removed", {
      conversationId,
      role: subscriber.role,
      subscriberCount: nextStore?.subscribers.size ?? 0,
    });
    pruneExpiredTokens(conversationId);
  };
};

const validateRole = (value: string | null): PeerSignalingRole | null => {
  if (value === "host" || value === "guest") {
    return value;
  }
  return null;
};

const validateKind = (value: string | null): PeerSignalingKind | null => {
  if (value === "offer" || value === "answer") {
    return value;
  }
  return null;
};

const toRole = (role: PeerSignalingRole): PeerSignalingRole =>
  role === "host" ? "guest" : "host";

const writeEvent = (writer: WritableStreamDefaultWriter<Uint8Array>, payload: string) =>
  writer.write(encoder.encode(payload)).catch(() => undefined);

export async function POST(
  request: Request,
  { params }: { params: Promise<{ conversationId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as
    | {
        viewerId?: string;
        sessionId?: string;
        role?: string;
        kind?: string;
        token?: string;
      }
    | null;
  if (!body) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const viewerId = typeof body.viewerId === "string" ? body.viewerId : null;
  const sessionId = typeof body.sessionId === "string" ? body.sessionId : null;
  const role = validateRole(typeof body.role === "string" ? body.role : null);
  const kind = validateKind(typeof body.kind === "string" ? body.kind : null);
  const token = typeof body.token === "string" ? body.token.trim() : null;

  if (!viewerId || !sessionId || !role || !kind || !token) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  if (viewerId !== session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { conversationId } = await params;

  try {
    await ensureConversationParticipant(conversationId, viewerId);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Forbidden";
    return NextResponse.json({ error: message }, { status: 403 });
  }

  if ((role === "host" && kind !== "offer") || (role === "guest" && kind !== "answer")) {
    return NextResponse.json({ error: "Unexpected token kind for role" }, { status: 400 });
  }

  const entry: PendingToken = {
    id: randomUUID(),
    conversationId,
    kind,
    token,
    fromRole: role,
    toRole: toRole(role),
    sessionId,
    viewerId,
    createdAt: Date.now(),
  };
  enqueueToken(entry);
  logPeerSignalingServer("token published", {
    conversationId,
    id: entry.id,
    kind: entry.kind,
    fromRole: entry.fromRole,
    toRole: entry.toRole,
  });

  return NextResponse.json({ ok: true });
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ conversationId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { conversationId } = await params;
  const url = new URL(request.url);
  const role = validateRole(url.searchParams.get("role"));
  const viewerId = url.searchParams.get("viewerId");
  const mode = url.searchParams.get("mode");

  if (!role || !viewerId) {
    return NextResponse.json({ error: "Missing role or viewer" }, { status: 400 });
  }

  if (viewerId !== session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    await ensureConversationParticipant(conversationId, viewerId);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Forbidden";
    return NextResponse.json({ error: message }, { status: 403 });
  }

  if (mode === "poll") {
    const tokens = consumePendingForRole(conversationId, role).map(formatTokenPayload);
    return NextResponse.json({ tokens });
  }

  const stream = new TransformStream();
  const writer = stream.writable.getWriter();

  const subscriber: TokenSubscriber = {
    role,
    notify: (token) => {
      logPeerSignalingServer("emitting token to stream", {
        conversationId,
        role,
        tokenId: token.id,
      });
      writeEvent(writer, formatTokenEvent(token));
    },
  };

  const subscriptionKey = `${viewerId}:${role}`;
  const unsubscribe = subscribeToTokens(conversationId, subscriptionKey, subscriber);
  deliverPendingTokens(conversationId, role);
  writeEvent(writer, "event: ready\ndata: {}\n\n");

  const heartbeat = setInterval(() => {
    writeEvent(writer, "event: ping\ndata: {}\n\n");
  }, HEARTBEAT_INTERVAL);

  const close = () => {
    logPeerSignalingServer("closing SSE stream", { conversationId, role });
    unsubscribe();
    clearInterval(heartbeat);
    writer.close().catch(() => undefined);
  };

  request.signal.addEventListener("abort", close, { once: true });

  return new Response(stream.readable, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

const consumePendingForRole = (
  conversationId: string,
  role: PeerSignalingRole,
): PendingToken[] => {
  pruneExpiredTokens(conversationId);
  const store = stores.get(conversationId);
  if (!store) return [];
  const pending = store.tokens.filter((token) => token.toRole === role);
  store.tokens = store.tokens.filter((token) => token.toRole !== role);
  return pending;
};

const formatTokenPayload = (token: PendingToken) => ({
  token: token.token,
  kind: token.kind,
  fromRole: token.fromRole,
  sessionId: token.sessionId,
  createdAt: token.createdAt,
});

const formatTokenEvent = (token: PendingToken) =>
  `event: token\ndata: ${JSON.stringify(formatTokenPayload(token))}\n\n`;

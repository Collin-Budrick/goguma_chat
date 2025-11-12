import { NextResponse } from "next/server";

import { createMessage, serializeMessage } from "@/db/conversations";
import { auth } from "@/lib/auth";
import { emitConversationEvent } from "@/lib/server-events";

type SendMessagePayload = {
  conversationId?: string;
  body?: string;
  clientMessageId?: string;
};

export async function POST(request: Request) {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: SendMessagePayload;

  try {
    body = (await request.json()) as SendMessagePayload;
  } catch (error) {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.conversationId || typeof body.conversationId !== "string") {
    return NextResponse.json({ error: "conversationId is required" }, { status: 400 });
  }

  if (!body.body || typeof body.body !== "string") {
    return NextResponse.json({ error: "Message body is required" }, { status: 400 });
  }

  try {
    const message = await createMessage(
      body.conversationId,
      session.user.id,
      body.body,
    );

    const serialized = serializeMessage(message);

    emitConversationEvent({
      type: "message",
      conversationId: body.conversationId,
      message: serialized,
      clientMessageId:
        typeof body.clientMessageId === "string" ? body.clientMessageId : undefined,
    });

    return NextResponse.json({ message: serialized });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to send message";

    if (message.includes("conversation participant")) {
      return NextResponse.json({ error: message }, { status: 403 });
    }

    if (message.includes("required")) {
      return NextResponse.json({ error: message }, { status: 400 });
    }

    return NextResponse.json({ error: message }, { status: 500 });
  }
}

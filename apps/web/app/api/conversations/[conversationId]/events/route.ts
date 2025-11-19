import { NextResponse } from "next/server";

import { ensureConversationParticipant } from "@/db/conversations";
import { auth } from "@/lib/auth";
import {
	type ConversationEvent,
	subscribeToConversationEvents,
} from "@/lib/server-events";

const encoder = new TextEncoder();
const HEARTBEAT_INTERVAL = 25_000;

function formatEvent(event: ConversationEvent) {
	if (event.type === "message") {
		return `event: message\ndata: ${JSON.stringify({
			message: event.message,
			clientMessageId: event.clientMessageId ?? null,
		})}\n\n`;
	}

	if (event.type === "typing") {
		return `event: typing\ndata: ${JSON.stringify(event.typing)}\n\n`;
	}

	return "";
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

	try {
		await ensureConversationParticipant(conversationId, session.user.id);
	} catch (error) {
		const message = error instanceof Error ? error.message : "Forbidden";
		return NextResponse.json({ error: message }, { status: 403 });
	}

	const stream = new TransformStream();
	const writer = stream.writable.getWriter();

	let cleanupCalled = false;
	let unsubscribe: () => void = () => {};

	const ignoreAbortError = (error: unknown) => {
		if (error instanceof Error && error.name === "AbortError") {
			return;
		}

		console.error(error);
	};

	const cleanup = () => {
		if (cleanupCalled) return;
		cleanupCalled = true;

		clearInterval(keepAlive);
		unsubscribe();

		writer.close().catch(ignoreAbortError);
		writer.abort?.().catch(ignoreAbortError);
	};

	const keepAlive = setInterval(() => {
		if (request.signal.aborted) {
			cleanup();
			return;
		}

		writer.write(encoder.encode("event: ping\ndata: {}\n\n")).catch(() => {
			cleanup();
		});
	}, HEARTBEAT_INTERVAL);

	unsubscribe = subscribeToConversationEvents(conversationId, (event) => {
		if (request.signal.aborted) {
			cleanup();
			return;
		}

		const payload = formatEvent(event);
		if (!payload) return;
		writer.write(encoder.encode(payload)).catch(() => {
			cleanup();
		});
	});

	request.signal.addEventListener("abort", cleanup);

	if (!request.signal.aborted) {
		writer.write(encoder.encode("event: ready\ndata: {}\n\n")).catch(() => {
			cleanup();
		});
	}

	return new Response(stream.readable, {
		headers: {
			"Content-Type": "text/event-stream",
			"Cache-Control": "no-cache",
			Connection: "keep-alive",
		},
	});
}

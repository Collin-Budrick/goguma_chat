import { createHash } from "node:crypto";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getFriendState } from "@/db/friends";
import { auth } from "@/lib/auth";
import type { ChatMessage, SendMessageResponse } from "@/lib/chat/types";
import {
        buildConversationId,
        createAutoReply,
        resolveProfileName,
} from "../helpers";

const bodySchema = z
        .object({
                friendId: z.string().min(1),
                content: z.string().min(1),
                nonce: z.string().min(1).max(128).optional(),
        })
        .strict();

const nonceBodyRegistry = new Map<string, string>();
const conversationReplySchedule = new Map<string, number>();

const normalizeBody = (body: string) => body.trim();

function hashBody(body: string) {
        return createHash("sha256").update(body).digest("hex");
}

export async function POST(request: NextRequest) {
        const session = await auth();

        if (!session?.user?.id) {
                return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        let json: unknown;
        try {
                json = await request.json();
        } catch {
                return NextResponse.json({ error: "Invalid request" }, { status: 400 });
        }

        const parsed = bodySchema.safeParse(json);
        if (!parsed.success) {
                return NextResponse.json(
                        { error: "Invalid request", details: parsed.error.flatten() },
                        { status: 400 },
                );
        }

        const { friendId, content, nonce } = parsed.data;
        const normalizedBody = normalizeBody(content);
        const bodyHash = hashBody(normalizedBody);
        const state = await getFriendState(session.user.id);
        const friend = state.friends.find((entry) => entry.friendId === friendId);

        if (!friend) {
                return NextResponse.json({ error: "Not found" }, { status: 404 });
        }

        const conversationId = buildConversationId(session.user.id, friendId);
        if (nonce) {
                const nonceKey = `${conversationId}:${nonce}`;
                const previousHash = nonceBodyRegistry.get(nonceKey);

                if (previousHash && previousHash !== bodyHash) {
                        return NextResponse.json(
                                { error: "Nonce already used with different body" },
                                { status: 409 },
                        );
                }

                nonceBodyRegistry.set(nonceKey, bodyHash);
        }

        const deterministicSeed = nonce ?? bodyHash;
        const idBase = `${conversationId}:${deterministicSeed}`;
        const sentAt = new Date();
        const viewerMessage: ChatMessage = {
                id: idBase,
                authorId: session.user.id,
                body: content,
                sentAt: sentAt.toISOString(),
        };

        const friendName = resolveProfileName({
                firstName: friend.firstName,
                lastName: friend.lastName,
                email: friend.email,
                fallback: friendId,
        });
        const viewerName = resolveProfileName({
                firstName: session.user.firstName,
                lastName: session.user.lastName,
                email: session.user.email ?? null,
                fallback: "friend",
        });

        const jitteredDelayMs = calculateReplyDelay(conversationId);
        const reply: ChatMessage = {
                id: `${idBase}:reply`,
                authorId: friendId,
                body: createAutoReply(viewerName, friendName, content),
                sentAt: new Date(sentAt.getTime() + jitteredDelayMs).toISOString(),
        };

        const payload: SendMessageResponse = {
                conversationId,
                message: viewerMessage,
                replies: [reply],
        };

        return NextResponse.json(payload);
}

function calculateReplyDelay(conversationId: string) {
        const baseDelayMs = 1000 * 5;
        const jitterMs = Math.floor(Math.random() * 2000) - 1000; // -1s to +1s
        const minimumDelayMs = 1000 * 3.5;

        const lastScheduled = conversationReplySchedule.get(conversationId) ?? 0;
        const now = Date.now();

        let delay = Math.max(minimumDelayMs, baseDelayMs + jitterMs);
        const earliestAllowed = lastScheduled + minimumDelayMs;
        if (now + delay < earliestAllowed) {
                delay = earliestAllowed - now;
        }

        conversationReplySchedule.set(conversationId, now + delay);
        return delay;
}

import type { ChatMessage } from "../../../../lib/chat/types";

type HistoryOptions = {
        conversationId: string;
        friendId: string;
        viewerId: string;
        friendName: string;
        viewerName: string;
        startedAt?: Date | null;
};

export function validateDate(value?: Date | null): Date | null {
        if (!value) return null;

        const date = new Date(value);
        return Number.isNaN(date.getTime()) ? null : date;
}

export function createMockHistory({
        conversationId,
        friendId,
        viewerId,
        friendName,
        viewerName,
        startedAt,
}: HistoryOptions): ChatMessage[] {
        const base = validateDate(startedAt) ?? new Date();

        const timeline = [
                new Date(base.getTime() - 1000 * 60 * 42),
                new Date(base.getTime() - 1000 * 60 * 39),
                new Date(base.getTime() - 1000 * 60 * 35),
                new Date(base.getTime() - 1000 * 60 * 31),
        ];

        return [
                {
                        id: `${conversationId}:intro`,
                        authorId: friendId,
                        body: `Hey ${viewerName || "there"}! I just found a new spot for tonight's hangout. Want to check it out?`,
                        sentAt: timeline[0].toISOString(),
                },
                {
                        id: `${conversationId}:reply`,
                        authorId: viewerId,
                        body: `That sounds perfect, ${friendName}! I'm free after 7 — should I bring anything?`,
                        sentAt: timeline[1].toISOString(),
                },
                {
                        id: `${conversationId}:details`,
                        authorId: friendId,
                        body: `Maybe just your favorite playlist. I'll grab us a table and text the invite to everyone else.`,
                        sentAt: timeline[2].toISOString(),
                },
                {
                        id: `${conversationId}:wrap`,
                        authorId: viewerId,
                        body: `Deal. I'll queue up something cozy and head over a little early.`,
                        sentAt: timeline[3].toISOString(),
                },
        ];
}

export type { HistoryOptions };

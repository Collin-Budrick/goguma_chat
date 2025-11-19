import { describe, expect, it } from "bun:test";

import { createMockHistory } from "./utils";

type BaseOptions = {
        conversationId: string;
        friendId: string;
        viewerId: string;
        friendName: string;
        viewerName: string;
};

const baseOptions: BaseOptions = {
        conversationId: "friend:view",
        friendId: "friend-1",
        viewerId: "viewer-1",
        friendName: "Friend",
        viewerName: "Viewer",
};

function expectValidIsoString(value: string) {
        const parsed = new Date(value);

        expect(Number.isNaN(parsed.getTime())).toBe(false);
        expect(value).toBe(parsed.toISOString());
}

describe("createMockHistory", () => {
        it("emits ISO timestamps for all messages", () => {
                const messages = createMockHistory({
                        ...baseOptions,
                        startedAt: new Date("2024-01-01T00:00:00.000Z"),
                });

                messages.forEach((message) => expectValidIsoString(message.sentAt));
        });

        it("falls back to a valid date when given an invalid start", () => {
                const messages = createMockHistory({
                        ...baseOptions,
                        startedAt: new Date("invalid"),
                });

                messages.forEach((message) => expectValidIsoString(message.sentAt));
        });
});

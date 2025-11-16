export type MessagingMode = "udp" | "progressive" | "websocket" | "push";

export const DEFAULT_MESSAGING_MODE: MessagingMode = "progressive";

export function isMessagingMode(value: unknown): value is MessagingMode {
  return (
    value === "udp" ||
    value === "progressive" ||
    value === "websocket" ||
    value === "push"
  );
}

export type MessagingMode = "udp" | "progressive";

export const DEFAULT_MESSAGING_MODE: MessagingMode = "progressive";

export function isMessagingMode(value: unknown): value is MessagingMode {
  return value === "udp" || value === "progressive";
}

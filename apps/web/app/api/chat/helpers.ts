export type DisplayNameOptions = {
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  fallback: string;
};

export function resolveProfileName({
  firstName,
  lastName,
  email,
  fallback,
}: DisplayNameOptions) {
  const first = firstName?.trim();
  const last = lastName?.trim();
  const combined = [first, last].filter(Boolean).join(" ");
  if (combined) {
    return combined;
  }
  if (email) {
    return email;
  }
  return fallback;
}

export function buildConversationId(viewerId: string, friendId: string) {
  return [viewerId, friendId].sort().join(":");
}

export function summarizeContent(value: string, maxLength = 80) {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return null;
  }
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, maxLength - 1)}…`;
}

export function createAutoReply(
  viewerName: string,
  friendName: string,
  content: string,
) {
  const audience = viewerName || "friend";
  const summary = summarizeContent(content, 72);
  if (!summary) {
    return `Sounds good, ${audience}! I\'ll keep you posted. – ${friendName}`;
  }
  return `Love it, ${audience}! I\'ll remember “${summary}”. – ${friendName}`;
}

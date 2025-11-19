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

type RedactionResult = {
	summary: string | null;
	hadSensitiveMatch: boolean;
	wasTruncated: boolean;
};

function redactContent(value: string, maxLength: number): RedactionResult {
	const condensed = value.replace(/\s+/g, " ").trim();
	if (!condensed) {
		return { summary: null, hadSensitiveMatch: false, wasTruncated: false };
	}

	const emailPattern = /[\w.-]+@[\w.-]+\.[A-Za-z]{2,}/g;
	const urlPattern =
		/(https?:\/\/|www\.)[\w.-]+(?:\.[A-Za-z]{2,})(?:[\w\-._~:/?#[\]@!$&'()*+,;=]*)?/gi;
	const phonePattern = /\+?\d[\d\s().-]{6,}\d/g;

	let hadSensitiveMatch = false;
	let redacted = condensed
		.replace(urlPattern, () => {
			hadSensitiveMatch = true;
			return "[link]";
		})
		.replace(emailPattern, () => {
			hadSensitiveMatch = true;
			return "[email]";
		})
		.replace(phonePattern, () => {
			hadSensitiveMatch = true;
			return "[number]";
		});

	const wasTruncated = redacted.length > maxLength;
	if (wasTruncated) {
		redacted = `${redacted.slice(0, maxLength - 1)}…`;
	}

	return { summary: redacted, hadSensitiveMatch, wasTruncated };
}

export type AutoReplyOptions = {
	allowEcho?: boolean;
	maxEchoLength?: number;
};

export function createAutoReply(
	viewerName: string,
	friendName: string,
	content: string,
	options: AutoReplyOptions = {},
) {
	const audience = viewerName || "friend";
	const { allowEcho = true, maxEchoLength = 64 } = options;
	const fallback = `Thanks for the update, ${audience}. I'll keep it in mind. – ${friendName}`;

	const { summary, hadSensitiveMatch } = redactContent(content, maxEchoLength);

	if (!summary || !allowEcho || hadSensitiveMatch) {
		return fallback;
	}

	return `Love it, ${audience}! I'll remember “${summary}”. – ${friendName}`;
}

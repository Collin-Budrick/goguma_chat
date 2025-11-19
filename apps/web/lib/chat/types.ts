export type ChatMessage = {
	id: string;
	authorId: string;
	body: string;
	sentAt: string;
};

export type ChatHistory = {
	conversationId: string;
	friendId: string;
	messages: ChatMessage[];
};

export type SendMessageRequest = {
	friendId: string;
	content: string;
	nonce?: string;
};

export type SendMessageResponse = {
	conversationId: string;
	message: ChatMessage;
	replies?: ChatMessage[];
};

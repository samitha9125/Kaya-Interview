// FR-WEB-02: 20 chat requests per IP per minute.
export const CHAT_RATE_LIMIT = { limit: 20, windowMs: 60_000 } as const;

export const MAX_MESSAGE_LENGTH = 1_000;

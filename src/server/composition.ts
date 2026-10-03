import "server-only";

// The composition root: the only file that knows which adapters implement
// which ports (ARCHITECTURE §5). Each port is wired here when it gets its
// first adapter.
export {};

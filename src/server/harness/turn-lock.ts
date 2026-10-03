export type TurnLock = { acquire: (conversationId: string) => (() => void) | null };

// FR-WEB-03: one turn at a time per conversation. In memory, because the
// app is one instance (ARCHITECTURE §12); a restart drops the locks along
// with the turns they guarded.
export function createTurnLock(): TurnLock {
  const running = new Set<string>();
  return {
    acquire(conversationId) {
      if (running.has(conversationId)) return null;
      running.add(conversationId);
      let released = false;
      return () => {
        if (released) return;
        released = true;
        running.delete(conversationId);
      };
    },
  };
}

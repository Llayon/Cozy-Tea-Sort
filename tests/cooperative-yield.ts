/**
 * Infrastructure-only cooperative yield for very long seeded stress loops.
 *
 * Vitest's worker RPC (`onTaskUpdate`) needs the worker event loop to
 * breathe between tasks. Pure synchronous 60–100 seed loops can block it
 * for >10s and deterministically trip the known worker timeout even though
 * every assertion passed. Yielding every few seeds changes NO assertions,
 * seed counts, ordering or coverage — only scheduling.
 */
export function yieldToHost(): Promise<void> {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, 0);
  });
}

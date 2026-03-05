// Track active participation loops per lobby (shared across admin routes)
const participationCleanups = new Map<string, () => void>();

export function getCleanup(lobbyId: string): (() => void) | undefined {
  return participationCleanups.get(lobbyId);
}

export function setCleanup(lobbyId: string, cleanup: () => void): void {
  participationCleanups.set(lobbyId, cleanup);
}

export function removeCleanup(lobbyId: string): void {
  const cleanup = participationCleanups.get(lobbyId);
  if (cleanup) {
    cleanup();
    participationCleanups.delete(lobbyId);
  }
}

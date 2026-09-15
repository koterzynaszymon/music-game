export function getOrCreateClientId() {
  const existing = localStorage.getItem("music-game-client-id");
  if (existing) {
    return existing;
  }
  const newId = crypto.randomUUID();
  localStorage.setItem("music-game-client-id", newId);
  return newId;
}

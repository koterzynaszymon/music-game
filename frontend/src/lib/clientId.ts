export function getOrCreateClientId() {
  const existing = localStorage.getItem("music-game-client-id");
  if (existing) {
    return existing;
  }
  const newId = crypto.randomUUID();
  localStorage.setItem("music-game-client-id", newId);
  return newId;
}

export function saveClientNicknameToStorage(nickname: string) {
  localStorage.setItem("music-game-client-nickname", nickname);
}

export function getClientNicknameFromStorage() {
  return localStorage.getItem("music-game-client-nickname");
}
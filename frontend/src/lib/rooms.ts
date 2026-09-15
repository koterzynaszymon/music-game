export async function createRoom(id: string, nickname: string) {
  const response = await fetch(`${import.meta.env.VITE_API_URL}/api/v1/rooms`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ id, nickname }),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || "Failed to create room");
  }

  return data;
}

import { useState } from "react";
import { getOrCreateClientId } from "./lib/clientId.ts";
import { createRoom } from "./lib/rooms.ts";

function App() {
  const [nickname, setNickname] = useState("");
  const [error, setError] = useState<string | null>(null);
  async function handleCreateRoom() {
    const clientId = getOrCreateClientId();
    try {
      const room = await createRoom(clientId, nickname);
      console.log(room);
    } catch (error) {
      if (error instanceof Error) {
        setError(error.message);
      } else {
        setError('An unknown error occurred');
      }
    }
  }
  return (
    <section className="flex flex-col items-center h-screen">
      <h1 className="text-4xl font-bold ">Music Game</h1>
      <div className="flex flex-col justify-center gap-4">
        <input
          type="text"
          placeholder="Enter your nickname"
          className="border-2 border-gray-300 rounded-md p-2 text-white"
          onChange={(e) => setNickname(e.target.value)}
          value={nickname}
        />
        <button
          className="bg-blue-500 text-white rounded-md p-2 hover:cursor-pointer hover:bg-blue-600 transition-all duration-300"
          onClick={handleCreateRoom}
        >
          Create Room
        </button>
        {error && <p className="text-red-500">{error}</p>}
      </div>
    </section>
  );
}

export default App;

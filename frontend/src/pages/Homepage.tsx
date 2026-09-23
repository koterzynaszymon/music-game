import { useState } from "react";
import {
  getOrCreateClientId,
  saveClientNicknameToStorage,
} from "../lib/clientId.ts";
import { checkIfRoomExists, createRoom } from "../lib/rooms.ts";
import { useNavigate } from "react-router-dom";

export default function Homepage() {
  const [nickname, setNickname] = useState("");
  const navigate = useNavigate();

  const [roomCode, setRoomCode] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function handleCreateRoom() {
    const clientId = getOrCreateClientId();
    if (nickname) {
      saveClientNicknameToStorage(nickname);
    } else {
      setError("Nickname is required to create a room");
      return;
    }
    try {
      const room = await createRoom(clientId, nickname);
      console.log(room);
      navigate(`/room/${room.code}`);
    } catch (error) {
      if (error instanceof Error) {
        setError(error.message);
      } else {
        setError("An unknown error occurred");
      }
    }
  }

  async function handleJoinRoom() {
    const clientId = getOrCreateClientId();
    if (nickname) {
      saveClientNicknameToStorage(nickname);
    } else {
      setError("Nickname is required to join a room");
      return;
    }
    if(!roomCode) {
      setError("Room code is required to join a room");
      return;
    }
    try {
      const exists = await checkIfRoomExists(roomCode);
      if (!exists) {
        setError("Room not found");
        return;
      }
    } catch {
      setError("Failed to check if room exists");
      return;
    }
    navigate(`/room/${roomCode}`);
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

        <input
          type="text"
          placeholder="Enter room code"
          className="border-2 border-gray-300 rounded-md p-2 text-white"
          onChange={(e) => setRoomCode(e.target.value)}
          value={roomCode}
        />
        <button
          className="bg-blue-500 text-white rounded-md p-2 hover:cursor-pointer hover:bg-blue-600 transition-all duration-300"
          onClick={handleJoinRoom}
        >
          Join Room
        </button>
        {error && <p className="text-red-500">{error}</p>}
      </div>
    </section>
  );
}

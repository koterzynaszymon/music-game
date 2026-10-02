import { useParams } from "react-router-dom";
import { useState, useEffect } from "react";
import { Socket } from "socket.io-client";
import io from "socket.io-client";
import { getOrCreateClientId } from "../lib/clientId.ts";
import { getClientNicknameFromStorage } from "../lib/clientId.ts";

function ShowUserReadyButton({ code, player, socket }: { code: string, player: any, socket: Socket }) {
  function handleChangePlayerReadyStatus() {
    socket.emit("changePlayerReadyStatus", {
      code: code,
      id: player.id,
    })
  }
  return (
    <button
      className={`${player.isReady ? "bg-green-500" : "bg-red-500"} text-white p-2 rounded-md text-sm hover:bg-${player.isReady ? "green-600" : "red-600"} hover:cursor-pointer`}
      onClick={() => handleChangePlayerReadyStatus()}
    >
      {player.isReady ? "Ready" : "Not Ready"}
    </button>
  );
}

export default function RoomPage() {
  const { code } = useParams<{ code: string }>();
  const [socket, setSocket] = useState<Socket | null>(null);
  const [room, setRoom] = useState<any | null>(null);

  function estabilishConnection() {
    const newSocket = io(import.meta.env.VITE_API_URL, {
      reconnection: true,
    });
    newSocket.on("roomJoined", (data: any) => {
      setRoom(data.room);
    });
    newSocket.on("roomUpdated", (updatedRoom) => {
      console.log("roomUpdated", updatedRoom);
      setRoom(updatedRoom);
    });
    newSocket.on("error", (error: any) => {
      console.error(error);
    });

    newSocket.emit("joinRoom", {
      code: code,
      id: getOrCreateClientId(),
      nickname: getClientNicknameFromStorage(),
    });

    setSocket(newSocket);
    return newSocket;
  }
  const userId = getOrCreateClientId();

  useEffect(() => {
    const newSocket = estabilishConnection();
    return () => {
      newSocket.disconnect();
      setSocket(null);
      setRoom(null);
    };
  }, [code]);

  return (
    <section className="flex flex-col items-center h-screen">
      <h1 className="text-4xl font-bold ">Room</h1>
      <p>Room Code: {code}</p>
      <p className="text-white">Room song limit: {room?.songsPerPlayer}</p>
      <ul>
        {Object.values(room?.players || {}).map((player: any) => {
          return (
            <li key={player.id} className="flex items-center gap-2">
              {player.nickname} - {player.isReady ? "Ready" : "Not Ready"}
              {player.id === userId ? <ShowUserReadyButton code={code} player={player} socket={socket} /> : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

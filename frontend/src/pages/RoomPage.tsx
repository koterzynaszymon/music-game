import { useParams } from "react-router-dom";
import { useState, useEffect } from "react";
import { Socket } from "socket.io-client";
import io from "socket.io-client";
import { getOrCreateClientId } from "../lib/clientId.ts";
import { getClientNicknameFromStorage } from "../lib/clientId.ts";

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
      <ul>
        {Object.values(room?.players || {}).map((player: any) => {
          return <li key={player.id}>{player.nickname} - {player.isReady ? "Ready" : "Not Ready"}</li>
        })}
      </ul>
    </section>
  );
}

import { useNavigate, useParams } from "react-router-dom";
import { useState, useEffect } from "react";
import { Socket } from "socket.io-client";
import io from "socket.io-client";
import { getOrCreateClientId } from "../lib/clientId.ts";
import { getClientNicknameFromStorage } from "../lib/clientId.ts";
import type { Notice } from "../components/NoticeDialog.tsx";
import type { Room } from "../types/room.ts";
import CopyCodeButton from "../components/room/CopyCodeButton.tsx";
import PlayerList from "../components/room/PlayerList.tsx";
import ReadyToggleButton from "../components/room/ReadyToggleButton.tsx";
import SongsPerPlayerSetting from "../components/room/SongsPerPlayerSetting.tsx";
import SongSubmissionPanel from "../components/room/SongSubmissionPanel.tsx";
import type { NewSong } from "../components/room/SongPicker.tsx";

export default function RoomPage() {
  const { code } = useParams<{ code: string }>();
  const [socket, setSocket] = useState<Socket | null>(null);
  const [room, setRoom] = useState<Room | null>(null);
  const navigate = useNavigate();
  function estabilishConnection() {
    const newSocket = io(import.meta.env.VITE_API_URL, {
      reconnection: true,
    });
    newSocket.on("roomJoined", (data: { room: Room }) => {
      setRoom(data.room);
    });
    newSocket.on("roomUpdated", (updatedRoom: Room) => {
      console.log("roomUpdated", updatedRoom);
      setRoom(updatedRoom);
    });
    newSocket.on("error", (error: { message: string }) => {
      console.error(error);
    });
    newSocket.on("joinRejected", (error: { message: string }) => {
      const notice: Notice = {
        title: "Couldn't join the room",
        message: error.message,
      };
      navigate("/", { state: { notice } });
    });
    newSocket.on("kicked", () => {
      const notice: Notice = {
        title: "Removed from room",
        message: "The host removed you from the room. Join another room with a new code.",
      };
      navigate("/", { state: { notice } });
    });
    newSocket.on("roomClosed", () => {
      const notice: Notice = {
        title: "Room closed",
        message: "The host closed the room. Create a new one or join with another code.",
      };
      navigate("/", { state: { notice } });
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

  const userId = getOrCreateClientId();
  const me = room?.players[userId];
  const isHost = room?.owner === userId;

  function handleKickPlayer(targetId: string) {
    socket?.emit("kickPlayer", {
      code: code,
      requesterId: userId,
      targetId: targetId,
    });
  }

  function handleLeaveRoom() {
    // The host can't just leave: leaving as host closes the room for everyone
    socket?.emit(isHost ? "closeRoom" : "leaveRoom", {
      code: code,
      id: userId,
    });
    navigate("/");
  }

  function handleToggleReady() {
    socket?.emit("changePlayerReadyStatus", {
      code: code,
      id: userId,
    });
  }

  function handleSubmitSongsPerPlayer(songsPerPlayer: number) {
    // server broadcasts roomUpdated to everyone (us included)
    socket?.emit("setSongsPerPlayer", {
      code: code,
      requesterId: userId,
      songsPerPlayer: songsPerPlayer,
    });
  }

  function handleSubmitSong(song: NewSong) {
    socket?.emit("submitSong", {
      code: code,
      id: userId,
      song: song,
    });
  }

  return (
    <section className="flex flex-col w-full min-h-screen px-4 py-6 text-left">
      <header className="flex items-center justify-between gap-4 mb-8">
        <button
          onClick={handleLeaveRoom}
          className="rounded-lg px-3 py-1.5 -ml-3 hover:bg-(--social-bg) hover:text-(--text-h) cursor-pointer focus-visible:outline-2 focus-visible:outline-(--text-h)"
        >
          {isHost ? "← Close room" : "← Leave room"}
        </button>
        {code && <CopyCodeButton code={code} />}
      </header>

      <div className="grid grid-cols-1 md:grid-cols-[20rem_1fr] gap-8 items-start">
        <aside>
          {room && (
            <PlayerList room={room} userId={userId} onKick={handleKickPlayer} />
          )}

          {room?.status === "configuring" && (
            <div className="mt-4">
              {isHost ? (
                <SongsPerPlayerSetting
                  initialValue={room.songsPerPlayer}
                  onSubmit={handleSubmitSongsPerPlayer}
                />
              ) : (
                <p className="text-sm">The host is choosing how many songs each player adds.</p>
              )}
            </div>
          )}

          <div className="mt-4">
            {me && room?.status === "submitting" && (
              <ReadyToggleButton
                isReady={me.isReady}
                onToggle={handleToggleReady}
              />
            )}
          </div>
        </aside>

        {/* Game area: song submission now, the player/guess UI once the round starts */}
        {me && room?.status === "submitting" ? (
          <main>
            <SongSubmissionPanel
              songs={me.songs}
              songsPerPlayer={room.songsPerPlayer}
              onSubmitSong={handleSubmitSong}
            />
          </main>
        ) : (
          <main className="flex items-center justify-center min-h-64 rounded-2xl border-2 border-dashed border-(--border) p-8 text-center">
            <p>The game starts when everyone is ready.</p>
          </main>
        )}
      </div>
    </section>
  );
}

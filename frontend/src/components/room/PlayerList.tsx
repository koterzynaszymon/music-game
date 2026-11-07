import type { Room } from "../../types/room.ts";
import PlayerRow from "./PlayerRow.tsx";

type PlayerListProps = {
  room: Room;
  userId: string;
  onKick: (playerId: string) => void;
};

export default function PlayerList({ room, userId, onKick }: PlayerListProps) {
  const players = Object.values(room.players);
  const readyCount = players.filter((player) => player.isReady).length;
  const isHost = room.owner === userId;

  return (
    <>
      <div className="flex items-baseline justify-between mb-3">
        <h2 className="m-0">Players</h2>
        <p className="text-sm">
          {readyCount} of {players.length} ready
          {room.songsPerPlayer ? ` · ${room.songsPerPlayer} songs each` : ""}
        </p>
      </div>

      <ul className="flex flex-col rounded-2xl border-2 border-(--border) bg-(--bg) overflow-hidden">
        {players.map((player) => {
          const isOwner = player.id === room.owner;
          return (
            <PlayerRow
              key={player.id}
              player={player}
              isMe={player.id === userId}
              isOwner={isOwner}
              canKick={isHost && !isOwner}
              onKick={onKick}
            />
          );
        })}
      </ul>
    </>
  );
}

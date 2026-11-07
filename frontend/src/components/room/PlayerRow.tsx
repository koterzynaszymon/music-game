import type { Player } from "../../types/room.ts";
import ReadyStatus from "./ReadyStatus.tsx";

type PlayerRowProps = {
  player: Player;
  isMe: boolean;
  isOwner: boolean;
  canKick: boolean;
  onKick: (playerId: string) => void;
};

export default function PlayerRow({ player, isMe, isOwner, canKick, onKick }: PlayerRowProps) {
  return (
    <li
      className={`grid grid-cols-[1fr_auto_3.5rem] items-center gap-3 px-4 py-2.5 border-b-2 border-(--border) last:border-b-0 ${isMe ? "bg-(--accent-bg)" : ""}`}
    >
      <span className="flex items-center gap-2 min-w-0">
        {isOwner && (
          <span aria-label="Host" title="Host" className="text-amber-300">
            ♛
          </span>
        )}
        <span className="truncate text-(--text-h) font-medium">
          {player.nickname}
        </span>
        {isMe && <span className="text-sm text-(--accent)">(you)</span>}
      </span>

      <ReadyStatus isReady={player.isReady} />

      <span className="text-right">
        {canKick && (
          <button
            onClick={() => onKick(player.id)}
            className="text-sm text-red-400 rounded-md px-2 py-1 hover:bg-red-500/15 cursor-pointer focus-visible:outline-2 focus-visible:outline-red-400"
          >
            Kick
          </button>
        )}
      </span>
    </li>
  );
}

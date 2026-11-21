import type { Player } from "../../types/room.ts";

type LeaderboardProps = {
  players: Player[];
  userId: string;
};

export default function Leaderboard({ players, userId }: LeaderboardProps) {
  // Golf scoring: lowest first. [...players] copies the array, because
  // sort() changes the array it's called on and props must not be changed.
  const sorted = [...players].sort((a, b) => a.score - b.score);

  // Players with the same score share a place: 1, 1, 3 (not 1, 2, 3)
  function placeOf(player: Player): number {
    return 1 + sorted.filter((other) => other.score < player.score).length;
  }

  return (
    <div className="flex flex-col gap-4">
      <h2 className="m-0">🏆 Final results</h2>
      <ol className="flex flex-col rounded-2xl border-2 border-(--border) bg-(--bg) overflow-hidden">
        {sorted.map((player) => (
          <li
            key={player.id}
            className={`grid grid-cols-[2.5rem_1fr_auto] items-center gap-3 px-4 py-3 border-b-2 border-(--border) last:border-b-0 ${player.id === userId ? "bg-(--accent-bg)" : ""}`}
          >
            <span className="font-mono text-lg">{placeOf(player)}.</span>
            <span className="truncate text-(--text-h) font-medium">
              {player.nickname}
              {player.id === userId && <span className="text-sm text-(--accent)"> (you)</span>}
            </span>
            <span className="font-mono text-(--text-h)">{player.score} pts</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

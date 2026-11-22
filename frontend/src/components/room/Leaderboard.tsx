import type { Player } from "../../types/room.ts";

// Index = place - 1. Places 4+ have no medal and show their number instead.
const MEDALS = ["🥇", "🥈", "🥉"];

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
        {sorted.map((player) => {
          const place = placeOf(player);
          const medal = MEDALS[place - 1]; // undefined from 4th place on
          return (
          <li
            key={player.id}
            className={`grid grid-cols-[2.5rem_1fr_auto] items-center gap-3 px-4 py-3 border-b-2 border-(--border) last:border-b-0 ${player.id === userId ? "bg-(--accent-bg)" : ""}`}
          >
            {medal ? (
              <span className="text-2xl" role="img" aria-label={`Place ${place}`}>
                {medal}
              </span>
            ) : (
              <span className="font-mono text-lg">{place}.</span>
            )}
            <span className="truncate text-(--text-h) font-medium">
              {player.nickname}
              {player.id === userId && <span className="text-sm text-(--accent)"> (you)</span>}
            </span>
            <span className="font-mono text-(--text-h)">{player.score} pts</span>
          </li>
          );
        })}
      </ol>
    </div>
  );
}

type SongTimerBarProps = {
  // waiting: still loading, bar is full and still
  // running: the song is playing, bar empties over durationSeconds
  // ended:   time's up, bar is empty
  phase: "waiting" | "running" | "ended";
  durationSeconds: number;
  elapsedSeconds?: number;
};

export default function SongTimerBar({ phase, durationSeconds, elapsedSeconds = 0 }: SongTimerBarProps) {
  return (
    <div aria-hidden="true" className="h-3 w-full overflow-hidden rounded-full bg-(--social-bg)">
      {phase !== "ended" && (
        <div
          className="h-full w-full rounded-full bg-(--accent) origin-left"
          style={
            phase === "running"
              ? { animation: `song-timer-shrink ${durationSeconds}s linear ${-elapsedSeconds}s forwards` }
              : undefined
          }
        />
      )}
    </div>
  );
}

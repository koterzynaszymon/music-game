import { useState } from "react";

// Keep in sync with MIN/MAX_SONGS_PER_PLAYER in backend/src/rooms/room.model.ts
export const MIN_SONGS_PER_PLAYER = 1;
export const MAX_SONGS_PER_PLAYER = 5;

type SongsPerPlayerSettingProps = {
  initialValue: number;
  onSubmit: (value: number) => void;
};

export default function SongsPerPlayerSetting({
  initialValue,
  onSubmit,
}: SongsPerPlayerSettingProps) {
  // Local "draft": the host can click -/+ freely, nothing is sent to the server
  // until they press Submit
  const [value, setValue] = useState(initialValue);

  const canDecrease = value > MIN_SONGS_PER_PLAYER;
  const canIncrease = value < MAX_SONGS_PER_PLAYER;

  const stepButton =
    "size-9 rounded-lg text-xl font-semibold leading-none text-(--text-h) bg-(--social-bg) hover:bg-(--accent-bg) cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-(--text-h)";

  return (
    <div className="flex flex-col gap-3 rounded-2xl border-2 border-(--border) bg-(--bg) px-4 py-3">
      <div className="flex items-center justify-between gap-4">
        <span id="songs-per-player-label" className="text-sm">
          Songs per player
        </span>

        <div
          role="group"
          aria-labelledby="songs-per-player-label"
          className="flex items-center gap-3"
        >
          <button
            type="button"
            className={stepButton}
            onClick={() => setValue(value - 1)}
            disabled={!canDecrease}
            aria-label="Fewer songs per player"
          >
            −
          </button>
          <span
            className="w-6 text-center text-xl font-semibold text-(--text-h)"
            aria-live="polite"
          >
            {value}
          </span>
          <button
            type="button"
            className={stepButton}
            onClick={() => setValue(value + 1)}
            disabled={!canIncrease}
            aria-label="More songs per player"
          >
            +
          </button>
        </div>
      </div>

      <button
        type="button"
        onClick={() => onSubmit(value)}
        className="w-full rounded-xl py-2.5 font-semibold cursor-pointer bg-green-500 hover:bg-green-400 text-green-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--text-h)"
      >
        Submit
      </button>
      <p className="m-0 text-xs">
        Can't be changed later. After submitting, players add songs and no one new can join.
      </p>
    </div>
  );
}

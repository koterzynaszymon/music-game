import { useState } from "react";

// Keep in sync with the MIN/MAX constants in backend/src/rooms/room.model.ts
export const MIN_SONGS_PER_PLAYER = 1;
export const MAX_SONGS_PER_PLAYER = 5;
export const MIN_SONG_DURATION = 10;
export const MAX_SONG_DURATION = 15;

type StepperProps = {
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  unit?: string; // e.g. "s" -> shows "10s"
  onChange: (value: number) => void;
};

// One "label   −  value  +" row. Used twice below, so it's its own component.
function Stepper({ id, label, value, min, max, unit = "", onChange }: StepperProps) {
  const stepButton =
    "size-9 rounded-lg text-xl font-semibold leading-none text-(--text-h) bg-(--social-bg) hover:bg-(--accent-bg) cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-(--text-h)";

  return (
    <div className="flex items-center justify-between gap-4">
      <span id={id} className="text-sm">
        {label}
      </span>

      <div role="group" aria-labelledby={id} className="flex items-center gap-3">
        <button
          type="button"
          className={stepButton}
          onClick={() => onChange(value - 1)}
          disabled={value <= min}
          aria-label={`Decrease ${label.toLowerCase()}`}
        >
          −
        </button>
        <span
          className="w-10 text-center text-xl font-semibold text-(--text-h)"
          aria-live="polite"
        >
          {value}
          {unit}
        </span>
        <button
          type="button"
          className={stepButton}
          onClick={() => onChange(value + 1)}
          disabled={value >= max}
          aria-label={`Increase ${label.toLowerCase()}`}
        >
          +
        </button>
      </div>
    </div>
  );
}

type SongsPerPlayerSettingProps = {
  initialSongsPerPlayer: number;
  initialSongDuration: number;
  onSubmit: (songsPerPlayer: number, songDuration: number) => void;
};

export default function SongsPerPlayerSetting({
  initialSongsPerPlayer,
  initialSongDuration,
  onSubmit,
}: SongsPerPlayerSettingProps) {
  // Local "drafts": the host can click -/+ freely, nothing is sent to the server
  // until they press Submit
  const [songsPerPlayer, setSongsPerPlayer] = useState(initialSongsPerPlayer);
  const [songDuration, setSongDuration] = useState(initialSongDuration);

  return (
    <div className="flex flex-col gap-3 rounded-2xl border-2 border-(--border) bg-(--bg) px-4 py-3">
      <Stepper
        id="songs-per-player-label"
        label="Songs per player"
        value={songsPerPlayer}
        min={MIN_SONGS_PER_PLAYER}
        max={MAX_SONGS_PER_PLAYER}
        onChange={setSongsPerPlayer}
      />
      <Stepper
        id="song-duration-label"
        label="Time per song"
        value={songDuration}
        min={MIN_SONG_DURATION}
        max={MAX_SONG_DURATION}
        unit="s"
        onChange={setSongDuration}
      />

      <button
        type="button"
        onClick={() => onSubmit(songsPerPlayer, songDuration)}
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

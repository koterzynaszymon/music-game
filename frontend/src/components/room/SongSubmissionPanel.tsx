import type { Song } from "../../types/room.ts";
import { formatTimestamp, youtubeThumbnailUrl } from "../../lib/youtube.ts";
import SongPicker, { type NewSong } from "./SongPicker.tsx";

type SongSubmissionPanelProps = {
  songs: Song[];
  songsPerPlayer: number;
  onSubmitSong: (song: NewSong) => void;
};

export default function SongSubmissionPanel({
  songs,
  songsPerPlayer,
  onSubmitSong,
}: SongSubmissionPanelProps) {
  const remaining = songsPerPlayer - songs.length;
  const emptySlots = Array.from({ length: Math.max(0, remaining) }, (_, i) => songs.length + i + 1);

  return (
    <div className="flex w-full flex-col gap-5 text-left">
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="m-0">Your songs</h2>
        <span className="text-sm">
          {songs.length} / {songsPerPlayer}
        </span>
      </div>

      <ol className="m-0 flex list-none flex-col gap-2 p-0">
        {songs.map((song, index) => (
          <li
            key={`${song.youtubeId}-${index}`}
            className="flex items-center gap-3 rounded-xl border-2 border-(--border) bg-(--bg) p-2"
          >
            <img
              src={youtubeThumbnailUrl(song.youtubeId)}
              alt=""
              className="h-12 w-20 shrink-0 rounded-lg object-cover"
            />
            <div className="min-w-0">
              <p className="truncate font-medium text-(--text-h)">
                {song.title ?? song.youtubeId}
              </p>
              <p className="text-sm">starts at {formatTimestamp(song.startTimestamp)}</p>
            </div>
          </li>
        ))}
        {emptySlots.map((n) => (
          <li
            key={`empty-${n}`}
            className="flex h-16 items-center rounded-xl border-2 border-dashed border-(--border) px-4 text-sm"
          >
            Song {n}
          </li>
        ))}
      </ol>

      {remaining > 0 ? (
        <SongPicker onSubmit={onSubmitSong} />
      ) : (
        <p className="rounded-xl bg-(--accent-bg) px-4 py-3 text-(--text-h)">
          All your songs are in. Press <strong>I'm ready</strong> when you're happy with them.
        </p>
      )}
    </div>
  );
}

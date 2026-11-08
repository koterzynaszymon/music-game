import { useRef, useState } from "react";
import YouTubePreview from "./YouTubePreview.tsx";
import {
  describeYoutubeError,
  formatTimestamp,
  parseTimestamp,
  parseYoutubeUrl,
  type YouTubePlayer,
} from "../../lib/youtube.ts";

export type NewSong = {
  youtubeId: string;
  startTimestamp: number; // seconds
  title: string;
};

type SongPickerProps = {
  onSubmit: (song: NewSong) => void;
};

export default function SongPicker({ onSubmit }: SongPickerProps) {
  const [urlText, setUrlText] = useState("");
  const [startText, setStartText] = useState("0:00");
  const [title, setTitle] = useState("");
  const [playerError, setPlayerError] = useState<string | null>(null);
  const [duration, setDuration] = useState<number | null>(null);

  const playerRef = useRef<YouTubePlayer | null>(null);
  const [isPlayerReady, setIsPlayerReady] = useState(false);

  const parsed = parseYoutubeUrl(urlText);
  const videoId = parsed?.videoId ?? null;
  const start = parseTimestamp(startText);
  const startTooLate = start !== null && duration !== null && start >= duration;

  const startError =
    start === null
      ? "Use m:ss, e.g. 1:23"
      : startTooLate
        ? `The video is only ${formatTimestamp(duration!)} long`
        : null;

  const canSubmit =
    videoId !== null && !playerError && startError === null && title.trim() !== "";

  function handleUrlChange(text: string) {
    const next = parseYoutubeUrl(text);
    if (next?.videoId !== videoId) {
      // New video: forget everything we knew about the old one
      setPlayerError(null);
      setDuration(null);
    }
    // Links copied with "Share at 1:23" already contain the start time
    if (next?.start != null) setStartText(formatTimestamp(next.start));
    setUrlText(text);
  }

  function handlePlayerChange(player: YouTubePlayer | null) {
    playerRef.current = player;
    setIsPlayerReady(player !== null);
    if (player) setDuration(player.getDuration() || null);
  }

  function useCurrentTime() {
    const player = playerRef.current;
    if (player) setStartText(formatTimestamp(player.getCurrentTime()));
  }

  function previewFromStart() {
    const player = playerRef.current;
    if (!player || start === null) return;
    player.seekTo(start, true);
    player.playVideo();
  }

  function handleSubmit(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit || videoId === null || start === null) return;
    onSubmit({ youtubeId: videoId, startTimestamp: start, title: title.trim() });
    setUrlText("");
    setStartText("0:00");
    setTitle("");
    setDuration(null);
  }

  const input =
    "w-full rounded-xl border-2 border-(--border) bg-(--code-bg) px-3 py-2 text-(--text-h) placeholder:text-(--text)/60 focus:outline-none focus:border-(--accent-border)";
  const secondaryButton =
    "rounded-lg px-3 py-2 text-sm font-medium text-(--text-h) bg-(--social-bg) hover:bg-(--accent-bg) cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-(--text-h)";

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-4 rounded-2xl border-2 border-(--border) bg-(--bg) p-4"
    >
      <label className="flex flex-col gap-1.5">
        <span className="text-sm">YouTube link</span>
        <input
          type="text"
          inputMode="url"
          value={urlText}
          onChange={(e) => handleUrlChange(e.target.value)}
          placeholder="https://www.youtube.com/watch?v=…"
          className={input}
          autoComplete="off"
        />
        {urlText.trim() !== "" && videoId === null && (
          <span className="text-sm text-red-400">That doesn't look like a YouTube link.</span>
        )}
      </label>

      {videoId && (
        <>
          <YouTubePreview
            key={videoId}
            videoId={videoId}
            onPlayerChange={handlePlayerChange}
            onError={(code) => setPlayerError(describeYoutubeError(code))}
          />
          {playerError && <p className="text-sm text-red-400">{playerError}</p>}

          <div className="flex flex-col gap-1.5">
            <label htmlFor="song-start" className="text-sm">
              Start at — play the video and grab the moment, or type it
            </label>
            <div className="flex flex-wrap items-center gap-2">
              <input
                id="song-start"
                type="text"
                inputMode="numeric"
                value={startText}
                onChange={(e) => setStartText(e.target.value)}
                className={`${input} w-24! text-center font-mono`}
                aria-invalid={startError !== null}
                aria-describedby="song-start-error"
              />
              <button
                type="button"
                onClick={useCurrentTime}
                disabled={!isPlayerReady}
                className={secondaryButton}
              >
                Use current time
              </button>
              <button
                type="button"
                onClick={previewFromStart}
                disabled={!isPlayerReady || start === null}
                className={secondaryButton}
              >
                ▶ Preview from here
              </button>
            </div>
            {startError && (
              <span id="song-start-error" className="text-sm text-red-400">
                {startError}
              </span>
            )}
          </div>

          <label className="flex flex-col gap-1.5">
            <span className="text-sm">Song title — what the others have to guess</span>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Bohemian Rhapsody"
              className={input}
              autoComplete="off"
            />
          </label>
        </>
      )}

      <button type="submit" disabled={!canSubmit} className="btn-primary self-end">
        Add song
      </button>
    </form>
  );
}

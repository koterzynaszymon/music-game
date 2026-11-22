import { useEffect, useRef } from "react";
import { loadYoutubeIframeApi, type YouTubePlayer } from "../../lib/youtube.ts";
import { useVolume } from "../../lib/volume.ts";

type YouTubePreviewProps = {
  videoId: string;
  // Second of the video where playback begins (optional, defaults to the beginning)
  start?: number;
  // Called with the player once it's ready, and with null when it goes away
  onPlayerChange: (player: YouTubePlayer | null) => void;
  onError: (code: number) => void;
};

// Mount with key={videoId} so a new video gets a fresh player.
export default function YouTubePreview({ videoId, start = 0, onPlayerChange, onError }: YouTubePreviewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  // The app-wide volume (VolumeProvider). Every player created here follows it.
  const { volume } = useVolume();
  // This component's player once it's ready, so the volume effect below can reach it
  const playerRef = useRef<YouTubePlayer | null>(null);

  const onPlayerChangeRef = useRef(onPlayerChange);
  const onErrorRef = useRef(onError);
  // Same "latest value" trick for the volume: onReady runs later, inside an
  // effect that only re-runs for a new video, so it must read the CURRENT volume
  const volumeRef = useRef(volume);
  useEffect(() => {
    onPlayerChangeRef.current = onPlayerChange;
    onErrorRef.current = onError;
    volumeRef.current = volume;
  });

  // Moment 2: the volume changed. Apply it to the player that's already running.
  useEffect(() => {
    playerRef.current?.setVolume(volume);
  }, [volume]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const host = document.createElement("div");
    container.appendChild(host);

    let cancelled = false;
    let player: YouTubePlayer | null = null;

    loadYoutubeIframeApi()
      .then((YT) => {
        if (cancelled) return; 
        player = new YT.Player(host, {
          videoId,
          width: "100%",
          height: "100%",
          playerVars: { playsinline: 1, rel: 0, start },
          events: {
            onReady: (event) => {
              // Moment 1: a new player starts at YouTube's default volume, not ours
              event.target.setVolume(volumeRef.current);
              playerRef.current = event.target;
              onPlayerChangeRef.current(event.target);
            },
            onError: (event) => onErrorRef.current(event.data),
          },
        });
      })
      .catch(() => {
        if (!cancelled) onErrorRef.current(-1);
      });

    return () => {
      cancelled = true;
      playerRef.current = null;
      player?.destroy();
      onPlayerChangeRef.current(null);
      container.replaceChildren();
    };
  }, [videoId, start]);

  return (
    <div
      ref={containerRef}
      className="aspect-video w-full overflow-hidden rounded-xl bg-black"
    />
  );
}

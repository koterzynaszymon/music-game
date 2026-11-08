import { useEffect, useRef } from "react";
import { loadYoutubeIframeApi, type YouTubePlayer } from "../../lib/youtube.ts";

type YouTubePreviewProps = {
  videoId: string;
  // Called with the player once it's ready, and with null when it goes away
  onPlayerChange: (player: YouTubePlayer | null) => void;
  onError: (code: number) => void;
};

// Mount with key={videoId} so a new video gets a fresh player.
export default function YouTubePreview({ videoId, onPlayerChange, onError }: YouTubePreviewProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  const onPlayerChangeRef = useRef(onPlayerChange);
  const onErrorRef = useRef(onError);
  useEffect(() => {
    onPlayerChangeRef.current = onPlayerChange;
    onErrorRef.current = onError;
  });

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
          playerVars: { playsinline: 1, rel: 0 },
          events: {
            onReady: (event) => onPlayerChangeRef.current(event.target),
            onError: (event) => onErrorRef.current(event.data),
          },
        });
      })
      .catch(() => {
        if (!cancelled) onErrorRef.current(-1);
      });

    return () => {
      cancelled = true;
      player?.destroy();
      onPlayerChangeRef.current(null);
      container.replaceChildren();
    };
  }, [videoId]);

  return (
    <div
      ref={containerRef}
      className="aspect-video w-full overflow-hidden rounded-xl bg-black"
    />
  );
}

// Helpers for YouTube: parsing links/timestamps (pure functions, easy to unit test) and loading the IFrame Player API script (side effect, done once per page).

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

export type ParsedYoutubeUrl = {
  videoId: string;
  // Start from a `t=` param in the link (e.g. youtu.be/abc?t=83), if present
  start: number | null;
};

// Accepts watch / youtu.be / shorts / embed / music.youtube.com links, or a bare video ID.
export function parseYoutubeUrl(input: string): ParsedYoutubeUrl | null {
  const text = input.trim();
  if (VIDEO_ID.test(text)) return { videoId: text, start: null };

  let url: URL;
  try {
    url = new URL(/^https?:\/\//.test(text) ? text : `https://${text}`);
  } catch {
    return null;
  }

  const host = url.hostname.replace(/^(www\.|m\.|music\.)/, "");
  let candidate: string | null = null;

  if (host === "youtu.be") {
    candidate = url.pathname.split("/")[1] ?? null;
  } else if (host === "youtube.com" || host === "youtube-nocookie.com") {
    if (url.pathname === "/watch") {
      candidate = url.searchParams.get("v");
    } else {
      const match = url.pathname.match(/^\/(?:shorts|embed|live|v)\/([^/]+)/);
      candidate = match?.[1] ?? null;
    }
  }

  if (!candidate || !VIDEO_ID.test(candidate)) return null;

  const t = url.searchParams.get("t") ?? url.searchParams.get("start");
  return { videoId: candidate, start: t ? parseYoutubeTimeParam(t) : null };
}

// YouTube's `t` param: "83", "83s", "1m23s", "1h2m3s"
function parseYoutubeTimeParam(t: string): number | null {
  const match = t.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s?)?$/);
  if (!match || match[0] === "") return null;
  const [, h = "0", m = "0", s = "0"] = match;
  return Number(h) * 3600 + Number(m) * 60 + Number(s);
}

// What the user types: "83", "1:23", "1:02:03" -> seconds. Returns null if invalid.
export function parseTimestamp(text: string): number | null {
  const parts = text.trim().split(":");
  if (parts.length > 3 || parts.some((part) => !/^\d+$/.test(part))) return null;
  const numbers = parts.map(Number);
  // Only the leading part may be >= 60 ("90" is fine, "1:90" is not)
  if (numbers.slice(1).some((n) => n >= 60)) return null;
  return numbers.reduce((total, n) => total * 60 + n, 0);
}

// seconds -> "m:ss" (or "h:mm:ss")
export function formatTimestamp(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const ss = String(total % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}

export function youtubeThumbnailUrl(videoId: string): string {
  return `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`;
}

// --- IFrame Player API ---------------------------------------------------

export interface YouTubePlayer {
  getCurrentTime(): number;
  getDuration(): number;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  playVideo(): void;
  pauseVideo(): void;
  destroy(): void;
}

type PlayerOptions = {
  videoId: string;
  width?: string | number;
  height?: string | number;
  playerVars?: Record<string, string | number>;
  events?: {
    onReady?: (event: { target: YouTubePlayer }) => void;
    onError?: (event: { data: number }) => void;
  };
};

type YouTubeNamespace = {
  Player: new (element: HTMLElement, options: PlayerOptions) => YouTubePlayer;
};

declare global {
  interface Window {
    YT?: YouTubeNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

// Error codes from the player's onError event
export function describeYoutubeError(code: number): string {
  switch (code) {
    case 101:
    case 150:
      return "The owner doesn't allow this video to be played outside YouTube. Pick another upload.";
    case 100:
      return "This video doesn't exist or is private.";
    case 2:
      return "That doesn't look like a valid video.";
    default:
      return "This video can't be played here.";
  }
}

// The script is loaded once; every caller shares the same promise.
let apiPromise: Promise<YouTubeNamespace> | null = null;

export function loadYoutubeIframeApi(): Promise<YouTubeNamespace> {
  if (apiPromise) return apiPromise;

  apiPromise = new Promise((resolve, reject) => {
    if (window.YT?.Player) {
      resolve(window.YT);
      return;
    }
    // YouTube calls this global function when the script is ready
    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previous?.();
      resolve(window.YT!);
    };

    const script = document.createElement("script");
    script.src = "https://www.youtube.com/iframe_api";
    script.async = true;
    script.onerror = () => {
      apiPromise = null; // allow a retry later
      reject(new Error("Couldn't load the YouTube player."));
    };
    document.head.appendChild(script);
  });

  return apiPromise;
}

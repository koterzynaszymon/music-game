// Mirrors PublicRoom in backend/src/rooms/room.model.ts (what the server sends over the socket)

// Only ever your OWN songs (sent privately in roomJoined / songSubmitted)
export type Song = {
  youtubeId: string;
  startTimestamp: number;
  submittedBy: string;
  title?: string;
};

// Mirrors PublicPlayer: other players' songs are hidden, only the count is public
export type Player = {
  id: string;
  nickname: string;
  score: number;
  isReady: boolean;
  songsSubmitted: number;
};

// Payload of the "loadSong" event (see loadSongPayload in rooms.gateway.ts).
// No title on purpose: it's the answer.
export type CurrentSong = {
  youtubeId: string;
  startTimestamp: number;
  index: number; // 0-based position in the playlist
  total: number;
};

export type RoomStatus ="configuring" | "submitting" | "playing" | "finished";

export type Room = {
  code: string;
  owner: string;
  players: Record<string, Player>;
  status: RoomStatus;
  songsPerPlayer: number;
};

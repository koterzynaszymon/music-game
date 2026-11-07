// Mirrors PublicRoom in backend/src/rooms/room.model.ts (what the server sends over the socket)

export type Song = {
  youtubeId: string;
  startTimestamp: number;
  submittedBy: string;
};

export type Player = {
  id: string;
  nickname: string;
  score: number;
  isReady: boolean;
  songs: Song[];
};

export type RoomStatus = "configuring" | "submitting" | "playing" | "finished";

export type Room = {
  code: string;
  owner: string;
  players: Record<string, Player>;
  status: RoomStatus;
  songsPerPlayer: number;
};

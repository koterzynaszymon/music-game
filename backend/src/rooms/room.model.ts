export const MIN_SONGS_PER_PLAYER = 1;
export const MAX_SONGS_PER_PLAYER = 5;

// Room lifecycle:
//   configuring -> host picks songs per player, new players may join
//   submitting  -> players add their songs and press ready, no new players
//   playing     -> the round is running
//   finished    -> leaderboard
export type RoomStatus = "configuring" | "submitting" | "playing" | "finished";

export interface Song {
    youtubeId: string;
    startTimestamp: number;
    submittedBy: string;
    title: string;
}

export interface Player {
    id: string;
    nickname: string;
    score: number;
    isReady: boolean;
    songs: Song[];
}

export interface Room {
    code: string;
    owner: string;
    players: Map<string, Player>;
    status: RoomStatus;
    songsPerPlayer: number;
}

export interface PublicRoom {
    code: string;
    owner: string;
    players: Record<string, Player>;
    status: RoomStatus;
    songsPerPlayer: number;
}

export function toPublicRoom(room: Room): PublicRoom {
    return {
        ...room,
        players: Object.fromEntries(room.players),
    };
}
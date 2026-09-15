export interface Song {
    youtubeId: string;
    startTimestamp: number;
    submittedBy: string;
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
    status: "waiting" | "playing" | "finished";
    songsPerPlayer: number;
}

export interface PublicRoom {
    code: string;
    owner: string;
    players: Record<string, Player>;
    status: "waiting" | "playing" | "finished";
    songsPerPlayer: number;
}

export function toPublicRoom(room: Room): PublicRoom {
    return {
        ...room,
        players: Object.fromEntries(room.players),
    };
}
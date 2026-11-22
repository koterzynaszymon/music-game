export const MIN_SONGS_PER_PLAYER = 1;
export const MAX_SONGS_PER_PLAYER = 5;

// Seconds each song plays before the answer is revealed
export const MIN_SONG_DURATION = 10;
export const MAX_SONG_DURATION = 15;
export const DEFAULT_SONG_DURATION = 10;

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

// A song as a player sends it: the server adds submittedBy itself
// (never trust the client to say who submitted it).
export type NewSong = Omit<Song, 'submittedBy'>;

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
    songDuration: number;
    playlist: Song[];
    currentSongIndex: number;
    currentSongStartTime: number | null;
    songRevealed: boolean;
    guessedBy: Set<string>;
    songLoadedBy: Set<string>;
}

// What OTHER players may see about a player: no songs, because song titles are answers.
export interface PublicPlayer {
    id: string;
    nickname: string;
    score: number;
    isReady: boolean;
    songsSubmitted: number;
}

// What every client in the room receives.
export interface PublicRoom {
    code: string;
    owner: string;
    players: Record<string, PublicPlayer>;
    status: RoomStatus;
    songsPerPlayer: number;
    songDuration: number;
    songRevealed: boolean;
}

function toPublicPlayer(player: Player): PublicPlayer {
    return {
        id: player.id,
        nickname: player.nickname,
        score: player.score,
        isReady: player.isReady,
        songsSubmitted: player.songs.length,
    };
}

export function toPublicRoom(room: Room): PublicRoom {
    const players: Record<string, PublicPlayer> = {};
    for (const [id, player] of room.players) {
        players[id] = toPublicPlayer(player);
    }
    return {
        code: room.code,
        owner: room.owner,
        players,
        status: room.status,
        songsPerPlayer: room.songsPerPlayer,
        songDuration: room.songDuration,
        songRevealed: room.songRevealed,
    };
}
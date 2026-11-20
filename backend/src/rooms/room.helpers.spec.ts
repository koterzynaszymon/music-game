import { Player, Room, Song } from "./room.model.js";
import { createPlayer, currentSongOf, haveAllPlayersGuessed } from "./room.helpers.js";

// These helpers are pure functions: room in, answer out. So the tests don't need
// RoomsService at all. We build a Room object by hand with exactly the state we want.

function song(title: string, submittedBy: string): Song {
    return { youtubeId: "aaaaaaaaaaa", startTimestamp: 0, title, submittedBy };
}

function playingRoom(playerIds: string[], playlist: Song[], overrides: Partial<Room> = {}): Room {
    const players = new Map<string, Player>();
    for (const id of playerIds) {
        players.set(id, createPlayer(id, `nick-${id}`));
    }
    return {
        code: "room",
        owner: playerIds[0],
        players,
        status: "playing",
        songsPerPlayer: 1,
        playlist,
        currentSongIndex: 0,
        currentSongStartTime: 0,
        guessedBy: new Set(),
        ...overrides,
    };
}

describe("currentSongOf", () => {
    const playlist = [song("alpha", "A"), song("bravo", "B")];

    it("returns the song at currentSongIndex", () => {
        const room = playingRoom(["A", "B"], playlist);
        expect(currentSongOf(room)).toBe(playlist[0]);
    })
    it("follows currentSongIndex when it moves", () => {
        const room = playingRoom(["A", "B"], playlist, { currentSongIndex: 1 });
        expect(currentSongOf(room)).toBe(playlist[1]);
    })
    it("returns undefined when the index is past the end of the playlist", () => {
        const room = playingRoom(["A", "B"], playlist, { currentSongIndex: 2 });
        expect(currentSongOf(room)).toBeUndefined();
    })
    it("returns undefined when the playlist is empty (game not started)", () => {
        const room = playingRoom(["A", "B"], [], { status: "submitting" });
        expect(currentSongOf(room)).toBeUndefined();
    })
})

describe("haveAllPlayersGuessed", () => {
    // Current song is submitted by A, so only B and C need to guess it.
    const playlist = [song("alpha", "A")];

    it("is false when nobody has guessed", () => {
        const room = playingRoom(["A", "B", "C"], playlist);
        expect(haveAllPlayersGuessed(room)).toBe(false);
    })
    it("is false when only some players have guessed", () => {
        const room = playingRoom(["A", "B", "C"], playlist, { guessedBy: new Set(["B"]) });
        expect(haveAllPlayersGuessed(room)).toBe(false);
    })
    it("is true when every player except the submitter has guessed", () => {
        // A never guesses (A can't score on their own song) - that must not block the song
        const room = playingRoom(["A", "B", "C"], playlist, { guessedBy: new Set(["B", "C"]) });
        expect(haveAllPlayersGuessed(room)).toBe(true);
    })
    it("uses the submitter of the CURRENT song, not the first one", () => {
        const twoSongs = [song("alpha", "A"), song("bravo", "B")];
        // Song 1 is B's, so A and C must guess. Only C has -> not done yet.
        const room = playingRoom(["A", "B", "C"], twoSongs, {
            currentSongIndex: 1,
            guessedBy: new Set(["C"]),
        });
        expect(haveAllPlayersGuessed(room)).toBe(false);
    })

    it.todo("what if the submitter has left the room? (still works - they're just not in players)");
    it.todo("what if there is no current song (empty playlist / finished)? false? throw?");
})

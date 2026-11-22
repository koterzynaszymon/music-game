import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from "@nestjs/common";
import { RoomsService } from "./rooms.service.js";

// Test helper: a room where the host has already submitted songs per player,
// so it is in the "submitting" phase. Keeps setup out of the tests that need it.
function createSubmittingRoomWithTwoPlayers(service: RoomsService, songDuration = 10) {
    const room = service.createRoom({ id: "1234567890", nickname: "test" });
    service.joinRoom(room.code, "1234567891", "test2");
    service.setSongsPerPlayer(room.code, "1234567890", 2, songDuration);
    return room;
}

const HOST = "1234567890";
const PLAYER = "1234567891";

// Test helper: submitting room, both players added 2 songs and pressed ready.
// Titles are chosen so that alphabetical order differs from submission order.
function createRoomReadyToStart(service: RoomsService, songDuration = 10) {
    const room = createSubmittingRoomWithTwoPlayers(service, songDuration); // songsPerPlayer = 2
    service.submitSong(room.code, HOST, { youtubeId: "aaaaaaaaaaa", startTimestamp: 0, title: "delta" });
    service.submitSong(room.code, HOST, { youtubeId: "bbbbbbbbbbb", startTimestamp: 0, title: "bravo" });
    service.submitSong(room.code, PLAYER, { youtubeId: "ccccccccccc", startTimestamp: 0, title: "charlie" });
    service.submitSong(room.code, PLAYER, { youtubeId: "ddddddddddd", startTimestamp: 0, title: "alpha" });
    service.changePlayerReadyStatus(room.code, HOST);
    service.changePlayerReadyStatus(room.code, PLAYER);
    return room;
}

// A test double (a "stub"): instead of a random order, it always returns the
// songs sorted by title. That makes the expected playlist order predictable,
// and proves the service really uses the shuffler it was given.
const sortByTitleShuffler = {
    shuffle: <T extends { title: string }>(items: T[]) =>
        [...items].sort((a, b) => a.title.localeCompare(b.title)),
};

// A test double (a "fake"): a clock the test controls by hand.
// The real Clock will return Date.now(); this one only moves when we say so,
// so "guessed 3 seconds after the song started" is exact, not flaky.
function createFakeClock(startMs = 1_000_000) {
    let nowMs = startMs;
    return {
        now: () => nowMs,
        advanceSeconds: (seconds: number) => { nowMs += seconds * 1000; },
    };
}

// Test helper: every player reports that the current song has loaded,
// so the song actually starts playing (and its timer starts) right now.
function loadSongForEveryone(service: RoomsService, code: string) {
    service.markSongLoaded(code, HOST);
    service.markSongLoaded(code, PLAYER);
}

// Test helper: a game that has started but whose first song is still LOADING
// (nobody has reported songLoaded yet, so the timer has not started).
function createLoadingRoom(songDuration = 10) {
    const clock = createFakeClock();
    const service = new RoomsService(sortByTitleShuffler, clock);
    const room = createRoomReadyToStart(service, songDuration);
    service.startGame(room.code, HOST);
    return { service, room, clock };
}

// Test helper: a game that is running, with the first song loaded and playing.
// Predictable playlist:
//   index 0: "alpha"   (submitted by PLAYER)
//   index 1: "bravo"   (submitted by HOST)
//   index 2: "charlie" (submitted by PLAYER)
//   index 3: "delta"   (submitted by HOST)
function createPlayingRoom(songDuration = 10) {
    const { service, room, clock } = createLoadingRoom(songDuration);
    loadSongForEveryone(service, room.code);
    return { service, room, clock };
}

// Test helper: play the current song to its end, the way a real game does it:
// (load it if needed) -> time runs out (endCurrentSong) -> host presses Next.
function endSongAndNext(service: RoomsService, code: string) {
    if (service.findRoomByCode(code).currentSongStartTime === null) {
        loadSongForEveryone(service, code);
    }
    service.endCurrentSong(code);
    return service.nextSong(code, HOST);
}

// Test helper: a game that has FINISHED, where HOST scored 3 points on "alpha".
// Everything a reset must undo is "dirty" here: scores, ready flags, songs, playlist.
function createFinishedRoom() {
    const { service, room, clock } = createPlayingRoom();
    clock.advanceSeconds(3);
    service.submitGuess(room.code, HOST, "alpha");
    for (let i = 0; i < 4; i++) endSongAndNext(service, room.code); // past the last song
    return { service, room, clock };
}

describe('RoomsService', () => {
    it("should create a new room", () => {
        const service = new RoomsService();

        const room = service.createRoom({ id: "1234567890", nickname: "test" });

        expect(room).toBeDefined();
        expect(room.code).toBeDefined();
        expect(room.owner).toBeTruthy();
        expect(room.players.size).toBe(1);
        expect(room.players.get("1234567890")).toBeDefined();
    })
    it("a new room starts in the configuring phase", () => {
        const service = new RoomsService();
        const room = service.createRoom({ id: "1234567890", nickname: "test" });
        expect(room.status).toBe("configuring");
    })
    it("find a room by code", () => {
        const service = new RoomsService();
        const room = service.createRoom({ id: "1234567890", nickname: "test" });
        const foundRoom = service.findRoom(room.code);
        expect(foundRoom).toBeDefined();
        expect(foundRoom?.code).toBe(room.code);
    })
    it("should join a new player to a room", () => {
        const service = new RoomsService();
        const room = service.createRoom({ id: '1234567890', nickname: 'test' });
        const result = service.joinRoom(room.code, '1234567891', 'test2');
        expect(result.isNewPlayer).toBe(true);
        expect(result.room.players.size).toBe(2);
        expect(result.room.players.get('1234567891')).toBeDefined();
        expect(result.room.players.get('1234567891')?.nickname).toBe('test2');
    })
    it("should throw an error if the nickname is already taken", () => {
        const service = new RoomsService();
        const room = service.createRoom({ id: "1234567890", nickname: "test" });
        expect(() => service.joinRoom(room.code, "1234567891", "test")).toThrow(ConflictException);
    })
    it("should reattach an existing player instead of throwing", () => {
        const service = new RoomsService();
        const room = service.createRoom({ id: "1234567890", nickname: "test" });
        const result = service.joinRoom(room.code, "1234567890", "test");
        expect(result.isNewPlayer).toBe(false);
        expect(result.room.players.size).toBe(1);
        expect(result.room.players.get("1234567890")?.nickname).toBe("test");
    })
    it("a new player cannot join once the room left the configuring phase", () => {
        const service = new RoomsService();
        const room = createSubmittingRoomWithTwoPlayers(service);
        expect(() => service.joinRoom(room.code, "1234567892", "latecomer")).toThrow(ForbiddenException);
        expect(room.players.size).toBe(2);
    })
    it("an existing player can still reattach after the configuring phase (e.g. page refresh)", () => {
        const service = new RoomsService();
        const room = createSubmittingRoomWithTwoPlayers(service);
        const result = service.joinRoom(room.code, "1234567891", "test2");
        expect(result.isNewPlayer).toBe(false);
        expect(result.room.players.size).toBe(2);
    })
    it("should set a player as ready", () => {
        const service = new RoomsService();
        const room = createSubmittingRoomWithTwoPlayers(service);
        service.changePlayerReadyStatus(room.code, "1234567891");
        expect(room.players.get("1234567891")?.isReady).toBe(true);
    })
    it("should set a player as not ready", () => {
        const service = new RoomsService();
        const room = createSubmittingRoomWithTwoPlayers(service);
        service.changePlayerReadyStatus(room.code, "1234567891");
        service.changePlayerReadyStatus(room.code, "1234567891");
        expect(room.players.get("1234567891")?.isReady).toBe(false);
    })
    it("a player cannot be ready while the host is still configuring", () => {
        const service = new RoomsService();
        const room = service.createRoom({ id: "1234567890", nickname: "test" });
        service.joinRoom(room.code, "1234567891", "test2");
        expect(() => service.changePlayerReadyStatus(room.code, "1234567891")).toThrow(BadRequestException);
        expect(room.players.get("1234567891")?.isReady).toBe(false);
    })
    it("should kick a player from a room", () => {
        const service = new RoomsService();
        const room = service.createRoom({ id: "1234567890", nickname: "test" });
        const result = service.joinRoom(room.code, "1234567891", "test2");
        service.kickPlayer(room.code, "1234567890", "1234567891");
        expect(result.room.players.size).toBe(1);
        expect(result.room.players.get("1234567891")?.nickname).toBe(undefined);
    })
    it("player cannot kick himself", () => {
        const service = new RoomsService();
        const room = service.createRoom({ id: "1234567890", nickname: "test" });
        const result = service.joinRoom(room.code, "1234567891", "test2");
        expect(() => service.kickPlayer(room.code, "1234567890", "1234567890")).toThrow(BadRequestException);
    })
    it("error should appear if player tries to kick a non-existent player", () => {
        const service = new RoomsService();
        const room = service.createRoom({ id: "1234567890", nickname: "test" });
        const result = service.joinRoom(room.code, "1234567891", "test2");
        expect(() => service.kickPlayer(room.code, "1234567890", "1234567892")).toThrow(NotFoundException);
    })
    it("player leaves a room", () => {
        const service = new RoomsService();
        const room = service.createRoom({ id: "1234567890", nickname: "test" });
        const result = service.joinRoom(room.code, "1234567891", "test2");
        service.leaveRoom(room.code, "1234567891");
        expect(result.room.players.size).toBe(1);
        expect(result.room.players.get("1234567891")?.nickname).toBe(undefined);
    })
    it("error should appear if player tries to leave a non-existent room", () => {
        const service = new RoomsService();
        expect(() => service.leaveRoom("1234567890", "1234567891")).toThrow(NotFoundException);
    })
    it("error should appear if player tries to leave a room he is not in", () => {
        const service = new RoomsService();
        const room = service.createRoom({ id: "1234567890", nickname: "test" });
        const result = service.joinRoom(room.code, "1234567891", "test2");
        expect(() => service.leaveRoom(room.code, "1234567892")).toThrow(NotFoundException);
    })
    it("when admin leaves a room, the room is deleted", () => {
        const service = new RoomsService();
        const room = service.createRoom({ id: "1234567890", nickname: "test" });
        const result = service.joinRoom(room.code, "1234567891", "test2");
        service.closeRoom(room.code, "1234567890");
        expect(service.findRoom(room.code)).toBeUndefined();
    })

    describe("setSongsPerPlayer", () => {
        it("owner submitting sets the value and moves the room to the submitting phase", () => {
            const service = new RoomsService();
            const room = service.createRoom({ id: "1234567890", nickname: "test" });
            service.setSongsPerPlayer(room.code, "1234567890", 4);
            expect(room.songsPerPlayer).toBe(4);
            expect(room.status).toBe("submitting");
        })
        it("a player who is not the owner cannot submit it", () => {
            const service = new RoomsService();
            const room = service.createRoom({ id: "1234567890", nickname: "test" });
            service.joinRoom(room.code, "1234567891", "test2");
            expect(() => service.setSongsPerPlayer(room.code, "1234567891", 4)).toThrow(ForbiddenException);
            expect(room.songsPerPlayer).toBe(2);
            expect(room.status).toBe("configuring");
        })
        it.each([0, 6, -1, 2.5])("rejects %s (must be a whole number from 1 to 5) and stays configuring", (value) => {
            const service = new RoomsService();
            const room = service.createRoom({ id: "1234567890", nickname: "test" });
            expect(() => service.setSongsPerPlayer(room.code, "1234567890", value)).toThrow(BadRequestException);
            expect(room.status).toBe("configuring");
        })
        it.each([1, 5])("accepts the boundary value %s", (value) => {
            const service = new RoomsService();
            const room = service.createRoom({ id: "1234567890", nickname: "test" });
            service.setSongsPerPlayer(room.code, "1234567890", value);
            expect(room.songsPerPlayer).toBe(value);
        })
        it("cannot be submitted a second time", () => {
            const service = new RoomsService();
            const room = createSubmittingRoomWithTwoPlayers(service);
            expect(() => service.setSongsPerPlayer(room.code, "1234567890", 3)).toThrow(BadRequestException);
            expect(room.songsPerPlayer).toBe(2);
        })
        it("throws if the room does not exist", () => {
            const service = new RoomsService();
            expect(() => service.setSongsPerPlayer("nope", "1234567890", 3)).toThrow(NotFoundException);
        })

        // --- song duration: how many seconds each song plays before the answer is shown ---
        it("a new room plays each song for 10 seconds by default", () => {
            const service = new RoomsService();
            const room = service.createRoom({ id: HOST, nickname: "test" });
            expect(room.songDuration).toBe(10);
        })
        it("the owner sets the song duration together with songs per player", () => {
            const service = new RoomsService();
            const room = service.createRoom({ id: HOST, nickname: "test" });
            service.setSongsPerPlayer(room.code, HOST, 3, 15);
            expect(room.songDuration).toBe(15);
            expect(room.songsPerPlayer).toBe(3);
        })
        it("without a song duration, the default (10) is used", () => {
            const service = new RoomsService();
            const room = service.createRoom({ id: HOST, nickname: "test" });
            service.setSongsPerPlayer(room.code, HOST, 3);
            expect(room.songDuration).toBe(10);
        })
        it.each([9, 16, 0, 12.5])("rejects song duration %s (whole seconds from 10 to 15): nothing changes", (songDuration) => {
            const service = new RoomsService();
            const room = service.createRoom({ id: HOST, nickname: "test" });
            expect(() => service.setSongsPerPlayer(room.code, HOST, 3, songDuration)).toThrow(BadRequestException);
            // Both values are rejected together: songsPerPlayer must not be half-applied
            expect(room.songDuration).toBe(10);
            expect(room.songsPerPlayer).toBe(2);
            expect(room.status).toBe("configuring");
        })
        it.each([10, 15])("accepts the boundary song duration %s", (songDuration) => {
            const service = new RoomsService();
            const room = service.createRoom({ id: HOST, nickname: "test" });
            service.setSongsPerPlayer(room.code, HOST, 3, songDuration);
            expect(room.songDuration).toBe(songDuration);
        })
    })

    describe("submitSong", () => {
        // A valid song to start from; each test overrides only the field it is about
        const validSong = { youtubeId: "dQw4w9WgXcQ", startTimestamp: 43, title: "never gonna give you up" };

        // --- happy path ---
        it("adds the song to the player who submitted it", () => {
            const service = new RoomsService();
            const room = createSubmittingRoomWithTwoPlayers(service);
            service.submitSong(room.code, "1234567891", validSong);
            expect(room.players.get("1234567891")?.songs).toEqual([
                { ...validSong, submittedBy: "1234567891" },
            ]);
        })
        it("does not touch other players' songs", () => {
            const service = new RoomsService();
            const room = createSubmittingRoomWithTwoPlayers(service);
            service.submitSong(room.code, "1234567891", validSong);
            expect(room.players.get("1234567890")?.songs).toEqual([]);
        })
        it("returns the updated room (the gateway broadcasts it)", () => {
            const service = new RoomsService();
            const room = createSubmittingRoomWithTwoPlayers(service);
            const result = service.submitSong(room.code, "1234567891", validSong);
            expect(result).toBe(room);
        })
        it("a player can add songs up to songsPerPlayer", () => {
            const service = new RoomsService();
            const room = createSubmittingRoomWithTwoPlayers(service); // songsPerPlayer = 2
            service.submitSong(room.code, "1234567891", validSong);
            service.submitSong(room.code, "1234567891", { ...validSong, youtubeId: "9bZkp7q19f0", title: "Gangnam Style" });
            expect(room.players.get("1234567891")?.songs).toHaveLength(2);
        })

        // --- who / when ---
        it("throws if the room does not exist", () => {
            const service = new RoomsService();
            expect(() => service.submitSong("nope", "1234567891", validSong)).toThrow(NotFoundException);
        })
        it("throws if the player is not in the room", () => {
            const service = new RoomsService();
            const room = createSubmittingRoomWithTwoPlayers(service);
            expect(() => service.submitSong(room.code, "stranger", validSong)).toThrow(NotFoundException);
        })
        it("cannot submit while the host is still configuring", () => {
            const service = new RoomsService();
            const room = service.createRoom({ id: "1234567890", nickname: "test" });
            expect(() => service.submitSong(room.code, "1234567890", validSong)).toThrow(BadRequestException);
            expect(room.players.get("1234567890")?.songs).toEqual([]);
        })
        it("cannot submit more than songsPerPlayer songs", () => {
            const service = new RoomsService();
            const room = createSubmittingRoomWithTwoPlayers(service); // songsPerPlayer = 2
            service.submitSong(room.code, "1234567891", validSong);
            service.submitSong(room.code, "1234567891", { ...validSong, youtubeId: "9bZkp7q19f0" });
            expect(() =>
                service.submitSong(room.code, "1234567891", { ...validSong, youtubeId: "kJQP7kiw5Fk" }),
            ).toThrow(BadRequestException);
            expect(room.players.get("1234567891")?.songs).toHaveLength(2);
        })

        // --- the song itself (never trust the client: the frontend checks are only a convenience) ---
        it.each(["", "   "])("rejects a blank title (%j)", (title) => {
            const service = new RoomsService();
            const room = createSubmittingRoomWithTwoPlayers(service);
            expect(() => service.submitSong(room.code, "1234567891", { ...validSong, title })).toThrow(BadRequestException);
            expect(room.players.get("1234567891")?.songs).toEqual([]);
        })
        it("stores the title without surrounding spaces", () => {
            const service = new RoomsService();
            const room = createSubmittingRoomWithTwoPlayers(service);
            service.submitSong(room.code, "1234567891", { ...validSong, title: "  Never Gonna Give You Up  " });
            expect(room.players.get("1234567891")?.songs[0].title).toBe("never gonna give you up");
        })
        it.each([-1, 1.5, Number.NaN])("rejects start timestamp %s (must be a whole number >= 0)", (startTimestamp) => {
            const service = new RoomsService();
            const room = createSubmittingRoomWithTwoPlayers(service);
            expect(() => service.submitSong(room.code, "1234567891", { ...validSong, startTimestamp })).toThrow(BadRequestException);
            expect(room.players.get("1234567891")?.songs).toEqual([]);
        })
        it("accepts a start timestamp of 0 (boundary)", () => {
            const service = new RoomsService();
            const room = createSubmittingRoomWithTwoPlayers(service);
            service.submitSong(room.code, "1234567891", { ...validSong, startTimestamp: 0 });
            expect(room.players.get("1234567891")?.songs[0].startTimestamp).toBe(0);
        })
        it.each(["", "short", "dQw4w9WgXcQ-too-long", "https://youtu.be/dQw4w9WgXcQ", "has spaces!"])(
            "rejects an invalid YouTube video id (%j)",
            (youtubeId) => {
                const service = new RoomsService();
                const room = createSubmittingRoomWithTwoPlayers(service);
                expect(() => service.submitSong(room.code, "1234567891", { ...validSong, youtubeId })).toThrow(BadRequestException);
                expect(room.players.get("1234567891")?.songs).toEqual([]);
            },
        )

        // --- rules you still have to decide on (it.todo shows up in the report as "todo") ---
        it.todo("can the same player submit the same video twice?");
        it.todo("can two different players submit the same video?");
        it.todo("can a player who is already ready still add songs?");
    })

    describe("startGame", () => {
        // --- happy path ---
        it("a new room starts with an empty playlist", () => {
            const service = new RoomsService();
            const room = service.createRoom({ id: HOST, nickname: "test" });
            expect(room.playlist).toEqual([]);
        })
        it("moves the room to the playing phase", () => {
            const service = new RoomsService();
            const room = createRoomReadyToStart(service);
            service.startGame(room.code, HOST);
            expect(room.status).toBe("playing");
        })
        it("puts every submitted song from every player into the playlist exactly once", () => {
            const service = new RoomsService();
            const room = createRoomReadyToStart(service);
            service.startGame(room.code, HOST);
            const ids = room.playlist.map(song => song.youtubeId);
            // Order-independent check: the real shuffler is random
            expect(ids).toHaveLength(4);
            expect(ids).toEqual(expect.arrayContaining(["aaaaaaaaaaa", "bbbbbbbbbbb", "ccccccccccc", "ddddddddddd"]));
        })
        it("keeps who submitted each song (needed later: you can't score on your own song)", () => {
            const service = new RoomsService();
            const room = createRoomReadyToStart(service);
            service.startGame(room.code, HOST);
            const alpha = room.playlist.find(song => song.title === "alpha");
            expect(alpha?.submittedBy).toBe(PLAYER);
        })
        it("orders the playlist using the injected shuffler", () => {
            const service = new RoomsService(sortByTitleShuffler);
            const room = createRoomReadyToStart(service);
            service.startGame(room.code, HOST);
            expect(room.playlist.map(song => song.title)).toEqual(["alpha", "bravo", "charlie", "delta"]);
        })
        it("returns the updated room (the gateway broadcasts it)", () => {
            const service = new RoomsService();
            const room = createRoomReadyToStart(service);
            expect(service.startGame(room.code, HOST)).toBe(room);
        })

        // --- who / when ---
        it("throws if the room does not exist", () => {
            const service = new RoomsService();
            expect(() => service.startGame("nope", HOST)).toThrow(NotFoundException);
        })
        it("only the owner can start the game", () => {
            const service = new RoomsService();
            const room = createRoomReadyToStart(service);
            expect(() => service.startGame(room.code, PLAYER)).toThrow(ForbiddenException);
            expect(room.status).toBe("submitting");
            expect(room.playlist).toEqual([]);
        })
        it("cannot start while somebody is not ready", () => {
            const service = new RoomsService();
            const room = createRoomReadyToStart(service);
            service.changePlayerReadyStatus(room.code, PLAYER); // un-ready
            expect(() => service.startGame(room.code, HOST)).toThrow(BadRequestException);
            expect(room.status).toBe("submitting");
            expect(room.playlist).toEqual([]);
        })
        it("cannot start while the host is still configuring", () => {
            const service = new RoomsService();
            const room = service.createRoom({ id: HOST, nickname: "test" });
            expect(() => service.startGame(room.code, HOST)).toThrow(BadRequestException);
            expect(room.status).toBe("configuring");
        })
        it("cannot start a game that is already running", () => {
            const service = new RoomsService(sortByTitleShuffler);
            const room = createRoomReadyToStart(service);
            service.startGame(room.code, HOST);
            expect(() => service.startGame(room.code, HOST)).toThrow(BadRequestException);
            expect(room.playlist).toHaveLength(4); // not rebuilt / doubled
        })

        // --- step 2.1: starting the game only LOADS the first song, it does not start the timer ---
        it("does not start the timer yet (clients still have to load the video)", () => {
            const { room } = createLoadingRoom();
            expect(room.currentSongStartTime).toBeNull();
        })
        it("starts on the first song of the playlist", () => {
            const { room } = createLoadingRoom();
            expect(room.currentSongIndex).toBe(0);
        })
        it("the first song starts unrevealed", () => {
            const { room } = createLoadingRoom();
            expect(room.songRevealed).toBe(false);
        })

        it.todo("does starting require at least 2 players (nobody can score on their own song)?");
        it.todo("does starting require every player to have submitted songsPerPlayer songs?");
        it.todo("which song is playing now? (e.g. currentSongIndex starts at 0)");
    })

    describe("submitGuess", () => {
        // --- happy path: scoring (golf-style, seconds since the song started) ---
        it("a correct guess scores the seconds elapsed since the song started", () => {
            const { service, room, clock } = createPlayingRoom();
            clock.advanceSeconds(3);
            service.submitGuess(room.code, HOST, "alpha");
            expect(room.players.get(HOST)?.score).toBe(3);
        })
        it("a later correct guess scores more (lower is better)", () => {
            const { service, room, clock } = createPlayingRoom();
            clock.advanceSeconds(6);
            service.submitGuess(room.code, HOST, "alpha");
            expect(room.players.get(HOST)?.score).toBe(6);
        })
        it("returns correct: true and the room for a correct guess", () => {
            const { service, room, clock } = createPlayingRoom();
            clock.advanceSeconds(3);
            const result = service.submitGuess(room.code, HOST, "alpha");
            expect(result).toEqual({ room, correct: true });
        })
        it("remembers that the player guessed the current song", () => {
            const { service, room, clock } = createPlayingRoom();
            clock.advanceSeconds(3);
            service.submitGuess(room.code, HOST, "alpha");
            expect(room.guessedBy.has(HOST)).toBe(true);
        })
        it("ignores letter case and surrounding spaces (titles are stored trimmed + lowercase)", () => {
            const { service, room, clock } = createPlayingRoom();
            clock.advanceSeconds(3);
            const result = service.submitGuess(room.code, HOST, "  ALPHA ");
            expect(result.correct).toBe(true);
            expect(room.players.get(HOST)?.score).toBe(3);
        })
        it("measures time from the start of the CURRENT song, not the start of the game", () => {
            const { service, room, clock } = createPlayingRoom();
            clock.advanceSeconds(20);                 // song 0 plays for 20s
            endSongAndNext(service, room.code);        // song 1 ("bravo", by HOST) starts loading
            loadSongForEveryone(service, room.code);  // ...and starts playing now
            clock.advanceSeconds(4);
            service.submitGuess(room.code, PLAYER, "bravo");
            expect(room.players.get(PLAYER)?.score).toBe(4);
        })
        it("time spent loading the video does not count toward the score", () => {
            const { service, room, clock } = createLoadingRoom();
            clock.advanceSeconds(5);                  // slow connections: 5s of loading
            loadSongForEveryone(service, room.code);  // song 0 "alpha" starts playing now
            clock.advanceSeconds(3);
            service.submitGuess(room.code, HOST, "alpha");
            expect(room.players.get(HOST)?.score).toBe(3); // not 8
        })
        it("scores add up across songs", () => {
            const { service, room, clock } = createPlayingRoom();
            endSongAndNext(service, room.code);        // song 1 "bravo" (by HOST)
            loadSongForEveryone(service, room.code);
            clock.advanceSeconds(4);
            service.submitGuess(room.code, PLAYER, "bravo");
            endSongAndNext(service, room.code);        // song 2 "charlie" (by PLAYER)
            endSongAndNext(service, room.code);        // song 3 "delta" (by HOST)
            loadSongForEveryone(service, room.code);
            clock.advanceSeconds(5);
            service.submitGuess(room.code, PLAYER, "delta");
            expect(room.players.get(PLAYER)?.score).toBe(9);
        })

        // --- wrong / ignored guesses: no error, just correct: false and nothing changes ---
        it("a wrong guess returns correct: false and does not change the score", () => {
            const { service, room, clock } = createPlayingRoom();
            clock.advanceSeconds(3);
            const result = service.submitGuess(room.code, HOST, "bravo");
            expect(result).toEqual({ room, correct: false });
            expect(room.players.get(HOST)?.score).toBe(0);
            expect(room.guessedBy.has(HOST)).toBe(false);
        })
        it("a player can keep guessing after a wrong guess (unlimited guesses)", () => {
            const { service, room, clock } = createPlayingRoom();
            clock.advanceSeconds(2);
            service.submitGuess(room.code, HOST, "wrong");
            clock.advanceSeconds(3);
            const result = service.submitGuess(room.code, HOST, "alpha");
            expect(result.correct).toBe(true);
            expect(room.players.get(HOST)?.score).toBe(5);
        })
        it("guessing your own song is ignored: no points, not marked as guessed", () => {
            const { service, room, clock } = createPlayingRoom(); // song 0 "alpha" was submitted by PLAYER
            clock.advanceSeconds(3);
            const result = service.submitGuess(room.code, PLAYER, "alpha");
            expect(result.correct).toBe(false);
            expect(room.players.get(PLAYER)?.score).toBe(0);
            expect(room.guessedBy.has(PLAYER)).toBe(false);
        })
        it("a guess after time ran out is ignored: correct: false, no points, not marked as guessed", () => {
            // Ignored, not an error: a guess sent at 9.99s can arrive just after the reveal
            const { service, room } = createPlayingRoom();
            service.endCurrentSong(room.code); // HOST didn't guess: 10 + 1 = 11 points
            const result = service.submitGuess(room.code, HOST, "alpha");
            expect(result.correct).toBe(false);
            expect(room.players.get(HOST)?.score).toBe(11);
            expect(room.guessedBy.has(HOST)).toBe(false);
        })
        it("guessing again after already scoring on this song is ignored", () => {
            const { service, room, clock } = createPlayingRoom();
            clock.advanceSeconds(3);
            service.submitGuess(room.code, HOST, "alpha");
            clock.advanceSeconds(10);
            const result = service.submitGuess(room.code, HOST, "alpha");
            expect(result.correct).toBe(false);
            expect(room.players.get(HOST)?.score).toBe(3); // not 3 + 13
        })

        // --- who / when ---
        it("throws if the room does not exist", () => {
            const { service } = createPlayingRoom();
            expect(() => service.submitGuess("nope", HOST, "alpha")).toThrow(NotFoundException);
        })
        it("throws if the player is not in the room", () => {
            const { service, room } = createPlayingRoom();
            expect(() => service.submitGuess(room.code, "stranger", "alpha")).toThrow(NotFoundException);
        })
        it("cannot guess before the game has started", () => {
            const service = new RoomsService(sortByTitleShuffler, createFakeClock());
            const room = createRoomReadyToStart(service); // still "submitting"
            expect(() => service.submitGuess(room.code, HOST, "alpha")).toThrow(BadRequestException);
        })
        it("cannot guess after the game has finished", () => {
            const { service, room } = createPlayingRoom();
            for (let i = 0; i < 4; i++) endSongAndNext(service, room.code); // past the last song
            expect(() => service.submitGuess(room.code, HOST, "delta")).toThrow(BadRequestException);
        })

        // --- step 2.3: no guessing while the song is still loading ---
        // DESIGN CHOICE baked into these two tests: an early guess is REJECTED (error),
        // like guessing before the game started. The alternative is to IGNORE it
        // (return correct: false), like guessing your own song. Change them if you prefer that.
        it("a correct guess while the song is still loading is rejected and scores nothing", () => {
            const { service, room, clock } = createLoadingRoom();
            clock.advanceSeconds(2);
            expect(() => service.submitGuess(room.code, HOST, "alpha")).toThrow(BadRequestException);
            expect(room.players.get(HOST)?.score).toBe(0);
            expect(room.guessedBy.has(HOST)).toBe(false);
        })
        it("a wrong guess while the song is still loading is rejected too", () => {
            // Ordering matters: if the "has it started?" check comes AFTER the title
            // comparison, a wrong guess slips through as correct: false instead.
            const { service, room } = createLoadingRoom();
            expect(() => service.submitGuess(room.code, HOST, "wrong")).toThrow(BadRequestException);
        })

        // --- rules you still have to decide on ---
        it.todo("how are fractional seconds scored? (guess at 3.4s -> 3? 4? 3.4?)");
        it.todo("should the song end automatically once everyone has guessed (haveAllPlayersGuessed)?");
        it.todo("is there a time limit per song?");
        it.todo("fuzzy title matching (typos, 'feat.', punctuation) - deferred in CLAUDE.md");
    })

    // Called by the server's own timer when songDuration seconds have passed
    // (not by a player, so there is no owner check).
    // Playlist reminder: song 0 is "alpha", submitted by PLAYER.
    describe("endCurrentSong", () => {
        // --- the reveal ---
        it("returns the title of the song, so the gateway can reveal it", () => {
            const { service, room } = createPlayingRoom();
            expect(service.endCurrentSong(room.code)).toEqual({ room, title: "alpha" });
        })
        it("marks the song as revealed", () => {
            const { service, room } = createPlayingRoom();
            service.endCurrentSong(room.code);
            expect(room.songRevealed).toBe(true);
        })
        it("stays on the same song (the host moves on with nextSong)", () => {
            const { service, room } = createPlayingRoom();
            service.endCurrentSong(room.code);
            expect(room.currentSongIndex).toBe(0);
            expect(room.status).toBe("playing");
        })

        // --- penalty: not guessing costs songDuration + 1 ---
        it("a player who didn't guess gets songDuration + 1 points", () => {
            const { service, room } = createPlayingRoom(); // songDuration 10
            service.endCurrentSong(room.code);
            expect(room.players.get(HOST)?.score).toBe(11);
        })
        it("uses the room's own song duration", () => {
            const { service, room } = createPlayingRoom(15);
            service.endCurrentSong(room.code);
            expect(room.players.get(HOST)?.score).toBe(16);
        })
        it("a player who guessed keeps their score (no penalty)", () => {
            const { service, room, clock } = createPlayingRoom();
            clock.advanceSeconds(3);
            service.submitGuess(room.code, HOST, "alpha");
            service.endCurrentSong(room.code);
            expect(room.players.get(HOST)?.score).toBe(3);
        })
        it("the player who submitted the song gets no penalty (they can't guess it)", () => {
            const { service, room } = createPlayingRoom();
            service.endCurrentSong(room.code);
            expect(room.players.get(PLAYER)?.score).toBe(0);
        })
        it("the penalty is always worse than the slowest correct guess", () => {
            // Guessing at the last moment (10s) must still beat not guessing at all (11)
            const { service, room, clock } = createPlayingRoom();
            clock.advanceSeconds(10);
            service.submitGuess(room.code, HOST, "alpha");
            expect(room.players.get(HOST)?.score).toBeLessThan(11);
        })

        // --- who / when ---
        it("cannot end the same song twice (the penalty must not be given twice)", () => {
            const { service, room } = createPlayingRoom();
            service.endCurrentSong(room.code);
            expect(() => service.endCurrentSong(room.code)).toThrow(BadRequestException);
            expect(room.players.get(HOST)?.score).toBe(11);
        })
        it("cannot end a song that hasn't started yet (still loading)", () => {
            const { service, room } = createLoadingRoom();
            expect(() => service.endCurrentSong(room.code)).toThrow(BadRequestException);
            expect(room.songRevealed).toBe(false);
        })
        it("cannot end a song before the game has started", () => {
            const service = new RoomsService(sortByTitleShuffler, createFakeClock());
            const room = createRoomReadyToStart(service);
            expect(() => service.endCurrentSong(room.code)).toThrow(BadRequestException);
        })
        it("throws if the room does not exist (e.g. it was closed mid-song)", () => {
            const { service } = createPlayingRoom();
            expect(() => service.endCurrentSong("nope")).toThrow(NotFoundException);
        })
    })

    describe("nextSong", () => {
        // The first song has played and its time ran out: the answer is on screen,
        // and this is the moment the host may press Next
        function createRevealedRoom() {
            const ctx = createPlayingRoom();
            ctx.service.endCurrentSong(ctx.room.code);
            return ctx;
        }

        // --- happy path ---
        it("moves to the next song in the playlist", () => {
            const { service, room } = createRevealedRoom();
            service.nextSong(room.code, HOST);
            expect(room.currentSongIndex).toBe(1);
        })
        it("stops the timer: the new song has to be loaded before it starts", () => {
            const { service, room } = createRevealedRoom();
            service.nextSong(room.code, HOST);
            expect(room.currentSongStartTime).toBeNull();
        })
        it("the new song starts unrevealed (guessing is open again)", () => {
            const { service, room } = createRevealedRoom();
            service.nextSong(room.code, HOST);
            expect(room.songRevealed).toBe(false);
        })
        it("forgets who loaded the previous song (everyone must load the new one)", () => {
            const { service, room } = createRevealedRoom();
            service.nextSong(room.code, HOST);
            service.markSongLoaded(room.code, HOST); // only one of two players
            expect(room.currentSongStartTime).toBeNull();
        })
        it("clears who has guessed (everyone can guess the new song)", () => {
            const { service, room, clock } = createPlayingRoom();
            clock.advanceSeconds(3);
            service.submitGuess(room.code, HOST, "alpha");
            service.endCurrentSong(room.code);
            service.nextSong(room.code, HOST);
            expect(room.guessedBy.size).toBe(0);
        })
        it("does not change anyone's score", () => {
            const { service, room } = createRevealedRoom();
            const before = [room.players.get(HOST)?.score, room.players.get(PLAYER)?.score];
            service.nextSong(room.code, HOST);
            expect([room.players.get(HOST)?.score, room.players.get(PLAYER)?.score]).toEqual(before);
        })
        it("returns the updated room (the gateway broadcasts it)", () => {
            const { service, room } = createRevealedRoom();
            expect(service.nextSong(room.code, HOST)).toBe(room);
        })

        // --- end of the playlist ---
        it("stays playing while there are songs left", () => {
            const { service, room } = createPlayingRoom();
            for (let i = 0; i < 3; i++) endSongAndNext(service, room.code); // now on the last song (index 3)
            expect(room.status).toBe("playing");
        })
        it("finishes the game after the last song", () => {
            const { service, room } = createPlayingRoom();
            for (let i = 0; i < 4; i++) endSongAndNext(service, room.code);
            expect(room.status).toBe("finished");
        })
        it("cannot skip once the game is finished", () => {
            const { service, room } = createPlayingRoom();
            for (let i = 0; i < 4; i++) endSongAndNext(service, room.code);
            expect(() => service.nextSong(room.code, HOST)).toThrow(BadRequestException);
        })

        // --- who / when ---
        it("throws if the room does not exist", () => {
            const { service } = createRevealedRoom();
            expect(() => service.nextSong("nope", HOST)).toThrow(NotFoundException);
        })
        it("only the owner can skip to the next song", () => {
            const { service, room } = createRevealedRoom();
            expect(() => service.nextSong(room.code, PLAYER)).toThrow(ForbiddenException);
            expect(room.currentSongIndex).toBe(0);
        })
        it("cannot skip before the game has started", () => {
            const service = new RoomsService(sortByTitleShuffler, createFakeClock());
            const room = createRoomReadyToStart(service);
            expect(() => service.nextSong(room.code, HOST)).toThrow(BadRequestException);
        })
        it("cannot move on while the song is still playing (the answer isn't revealed yet)", () => {
            const { service, room } = createPlayingRoom();
            expect(() => service.nextSong(room.code, HOST)).toThrow(BadRequestException);
            expect(room.currentSongIndex).toBe(0);
        })
        it("cannot move on while the song is still loading", () => {
            const { service, room } = createLoadingRoom();
            expect(() => service.nextSong(room.code, HOST)).toThrow(BadRequestException);
            expect(room.currentSongIndex).toBe(0);
        })

        it.todo("what should currentSongStartTime be once the game is finished? (null?)");
    })

    // Step 2.2: each client tells the server "I have loaded the video".
    // When the LAST player reports in, the song starts and the timer begins.
    // The gateway uses `allLoaded` to decide whether to emit "playSong" to the room.
    describe("markSongLoaded", () => {
        // --- happy path ---
        it("does not start the song while some players are still loading", () => {
            const { service, room } = createLoadingRoom();
            const result = service.markSongLoaded(room.code, HOST);
            expect(result).toEqual({ room, allLoaded: false });
            expect(room.currentSongStartTime).toBeNull();
        })
        it("starts the song when the last player has loaded it", () => {
            const { service, room, clock } = createLoadingRoom();
            clock.advanceSeconds(2);
            service.markSongLoaded(room.code, HOST);
            clock.advanceSeconds(1);
            const result = service.markSongLoaded(room.code, PLAYER);
            expect(result).toEqual({ room, allLoaded: true });
            expect(room.currentSongStartTime).toBe(clock.now()); // the LAST load, not the first
        })
        it("the order in which players load does not matter", () => {
            const { service, room } = createLoadingRoom();
            service.markSongLoaded(room.code, PLAYER);
            const result = service.markSongLoaded(room.code, HOST);
            expect(result.allLoaded).toBe(true);
        })
        it("the same player reporting twice does not count as two players", () => {
            const { service, room } = createLoadingRoom();
            service.markSongLoaded(room.code, HOST);
            const result = service.markSongLoaded(room.code, HOST);
            expect(result.allLoaded).toBe(false);
            expect(room.currentSongStartTime).toBeNull();
        })

        // --- after the song has already started ---
        // Real case: a player refreshes mid-song, their browser loads the video again
        // and sends songLoaded. That must not restart the timer for everyone.
        it("loading again after the song started does not restart the timer", () => {
            const { service, room, clock } = createPlayingRoom();
            const startedAt = room.currentSongStartTime;
            clock.advanceSeconds(7);
            service.markSongLoaded(room.code, HOST);
            expect(room.currentSongStartTime).toBe(startedAt);
        })
        it("only the call that completes loading reports allLoaded: true (so playSong is sent once)", () => {
            const { service, room } = createPlayingRoom();
            const result = service.markSongLoaded(room.code, HOST);
            expect(result.allLoaded).toBe(false);
        })

        // --- who / when ---
        it("throws if the room does not exist", () => {
            const { service } = createLoadingRoom();
            expect(() => service.markSongLoaded("nope", HOST)).toThrow(NotFoundException);
        })
        it("throws if the player is not in the room", () => {
            const { service, room } = createLoadingRoom();
            expect(() => service.markSongLoaded(room.code, "stranger")).toThrow(NotFoundException);
        })
        it("cannot report loaded before the game has started", () => {
            const service = new RoomsService(sortByTitleShuffler, createFakeClock());
            const room = createRoomReadyToStart(service); // still "submitting"
            expect(() => service.markSongLoaded(room.code, HOST)).toThrow(BadRequestException);
        })
        it("cannot report loaded after the game has finished", () => {
            const { service, room } = createPlayingRoom();
            for (let i = 0; i < 4; i++) endSongAndNext(service, room.code);
            expect(() => service.markSongLoaded(room.code, HOST)).toThrow(BadRequestException);
        })

        // --- rules you still have to decide on ---
        it.todo("what if a player leaves / is kicked while the others wait for them to load?");
        it.todo("timeout: start anyway after N seconds if someone never loads (needs fake timers)");
    })

    // After the leaderboard, the host sends everyone back to the lobby of the SAME room:
    // same code, same people, but a fresh game (no songs, no scores, nobody ready).
    describe("resetRoom", () => {
        // --- happy path: the room goes back to its first state ---
        it("moves a finished room back to the configuring phase", () => {
            const { service, room } = createFinishedRoom();
            service.resetRoom(room.code, HOST);
            expect(room.status).toBe("configuring");
        })
        it("clears the game: empty playlist, first song, no timer, nobody guessed or loaded", () => {
            const { service, room } = createFinishedRoom();
            service.resetRoom(room.code, HOST);
            expect(room.playlist).toEqual([]);
            expect(room.currentSongIndex).toBe(0);
            expect(room.currentSongStartTime).toBeNull();
            expect(room.guessedBy.size).toBe(0);
            expect(room.songLoadedBy.size).toBe(0);
            expect(room.songRevealed).toBe(false);
        })
        it("keeps the previous song duration (like songs per player)", () => {
            const { service, room } = createFinishedRoom();
            service.resetRoom(room.code, HOST);
            expect(room.songDuration).toBe(10);
        })
        it("returns the updated room (the gateway broadcasts it)", () => {
            const { service, room } = createFinishedRoom();
            expect(service.resetRoom(room.code, HOST)).toBe(room);
        })

        // --- the players stay, only their game data is reset ---
        it("keeps everyone in the room, with the same nicknames", () => {
            const { service, room } = createFinishedRoom();
            service.resetRoom(room.code, HOST);
            expect(room.players.size).toBe(2);
            expect(room.players.get(HOST)?.nickname).toBe("test");
            expect(room.players.get(PLAYER)?.nickname).toBe("test2");
        })
        it("keeps the same host", () => {
            const { service, room } = createFinishedRoom();
            service.resetRoom(room.code, HOST);
            expect(room.owner).toBe(HOST);
        })
        it("resets every player's score to 0", () => {
            const { service, room } = createFinishedRoom();
            expect(room.players.get(HOST)?.score).toBeGreaterThan(0); // sanity check: there IS something to reset
            service.resetRoom(room.code, HOST);
            expect(room.players.get(HOST)?.score).toBe(0);
            expect(room.players.get(PLAYER)?.score).toBe(0);
        })
        it("makes every player not ready", () => {
            const { service, room } = createFinishedRoom();
            service.resetRoom(room.code, HOST);
            expect(room.players.get(HOST)?.isReady).toBe(false);
            expect(room.players.get(PLAYER)?.isReady).toBe(false);
        })
        it("clears every player's songs (everyone knows those answers now)", () => {
            const { service, room } = createFinishedRoom();
            service.resetRoom(room.code, HOST);
            expect(room.players.get(HOST)?.songs).toEqual([]);
            expect(room.players.get(PLAYER)?.songs).toEqual([]);
        })
        it("keeps the previous songs per player (the host's setting starts from it)", () => {
            const { service, room } = createFinishedRoom(); // songsPerPlayer = 2
            service.resetRoom(room.code, HOST);
            expect(room.songsPerPlayer).toBe(2);
        })

        // --- consequences of being back in "configuring" ---
        it("new players can join again", () => {
            const { service, room } = createFinishedRoom();
            service.resetRoom(room.code, HOST);
            const result = service.joinRoom(room.code, "1234567892", "latecomer");
            expect(result.isNewPlayer).toBe(true);
            expect(room.players.size).toBe(3);
        })
        it("a whole second game can be played after a reset", () => {
            // Catches any field the reset forgets: the second game would break on it
            const { service, room, clock } = createFinishedRoom();
            service.resetRoom(room.code, HOST);
            service.setSongsPerPlayer(room.code, HOST, 1);
            service.submitSong(room.code, HOST, { youtubeId: "eeeeeeeeeee", startTimestamp: 0, title: "echo" } as never);
            service.submitSong(room.code, PLAYER, { youtubeId: "fffffffffff", startTimestamp: 0, title: "foxtrot" } as never);
            service.changePlayerReadyStatus(room.code, HOST);
            service.changePlayerReadyStatus(room.code, PLAYER);
            service.startGame(room.code, HOST);
            expect(room.playlist.map(song => song.title)).toEqual(["echo", "foxtrot"]); // no old songs
            loadSongForEveryone(service, room.code);
            clock.advanceSeconds(5);
            service.submitGuess(room.code, PLAYER, "echo");
            expect(room.players.get(PLAYER)?.score).toBe(5); // counted from 0, not added to the old game
        })

        // --- who / when ---
        it("throws if the room does not exist", () => {
            const { service } = createFinishedRoom();
            expect(() => service.resetRoom("nope", HOST)).toThrow(NotFoundException);
        })
        it("only the owner can reset the room, and nothing changes", () => {
            const { service, room } = createFinishedRoom();
            const hostScoreBefore = room.players.get(HOST)?.score;
            expect(() => service.resetRoom(room.code, PLAYER)).toThrow(ForbiddenException);
            expect(room.status).toBe("finished");
            expect(room.players.get(HOST)?.score).toBe(hostScoreBefore);
        })
        it("cannot reset while a game is playing (only after it finished)", () => {
            const { service, room, clock } = createPlayingRoom();
            clock.advanceSeconds(3);
            service.submitGuess(room.code, HOST, "alpha");
            expect(() => service.resetRoom(room.code, HOST)).toThrow(BadRequestException);
            expect(room.status).toBe("playing");
            expect(room.players.get(HOST)?.score).toBe(3);
        })
        it("cannot reset while songs are being submitted", () => {
            const service = new RoomsService();
            const room = createRoomReadyToStart(service);
            expect(() => service.resetRoom(room.code, HOST)).toThrow(BadRequestException);
            expect(room.players.get(HOST)?.songs).toHaveLength(2); // songs not wiped
        })
        it("cannot reset a room that is still configuring", () => {
            const service = new RoomsService();
            const room = service.createRoom({ id: HOST, nickname: "test" });
            expect(() => service.resetRoom(room.code, HOST)).toThrow(BadRequestException);
        })
    })
});
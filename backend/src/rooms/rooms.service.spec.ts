import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from "@nestjs/common";
import { RoomsService } from "./rooms.service.js";

// Test helper: a room where the host has already submitted songs per player,
// so it is in the "submitting" phase. Keeps setup out of the tests that need it.
async function createSubmittingRoomWithTwoPlayers(service: RoomsService, songDuration = 10) {
    const room = await service.createRoom({ id: "1234567890", nickname: "test" });
    await service.joinRoom(room.code, "1234567891", "test2");
    await service.setSongsPerPlayer(room.code, "1234567890", 2, songDuration);
    return room;
}

const HOST = "1234567890";
const PLAYER = "1234567891";

// Test helper: submitting room, both players added 2 songs and pressed ready.
// Titles are chosen so that alphabetical order differs from submission order.
async function createRoomReadyToStart(service: RoomsService, songDuration = 10) {
    const room = await createSubmittingRoomWithTwoPlayers(service, songDuration); // songsPerPlayer = 2
    await service.submitSong(room.code, HOST, { youtubeId: "aaaaaaaaaaa", startTimestamp: 0, title: "delta" });
    await service.submitSong(room.code, HOST, { youtubeId: "bbbbbbbbbbb", startTimestamp: 0, title: "bravo" });
    await service.submitSong(room.code, PLAYER, { youtubeId: "ccccccccccc", startTimestamp: 0, title: "charlie" });
    await service.submitSong(room.code, PLAYER, { youtubeId: "ddddddddddd", startTimestamp: 0, title: "alpha" });
    await service.changePlayerReadyStatus(room.code, HOST);
    await service.changePlayerReadyStatus(room.code, PLAYER);
    return room;
}

// A test double (a "stub"): instead of a random order, it always returns the
// songs sorted by title. That makes the expected playlist order predictable,
// and proves the service really uses the shuffler it was given.
// Generic <T> like the real Shuffler, so TypeScript accepts it in its place;
// titleOf reads the title from whatever item it gets (here: always a Song).
const titleOf = (item: unknown) => (item as { title: string }).title;
const sortByTitleShuffler = {
    shuffle: <T>(items: T[]): T[] =>
        [...items].sort((a, b) => titleOf(a).localeCompare(titleOf(b))),
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
async function loadSongForEveryone(service: RoomsService, code: string) {
    await service.markSongLoaded(code, HOST);
    await service.markSongLoaded(code, PLAYER);
}

// Test helper: a game that has started but whose first song is still LOADING
// (nobody has reported songLoaded yet, so the timer has not started).
async function createLoadingRoom(songDuration = 10) {
    const clock = createFakeClock();
    const service = new RoomsService(sortByTitleShuffler, clock);
    const room = await createRoomReadyToStart(service, songDuration);
    await service.startGame(room.code, HOST);
    return { service, room, clock };
}

// Test helper: a game that is running, with the first song loaded and playing.
// Predictable playlist:
//   index 0: "alpha"   (submitted by PLAYER)
//   index 1: "bravo"   (submitted by HOST)
//   index 2: "charlie" (submitted by PLAYER)
//   index 3: "delta"   (submitted by HOST)
async function createPlayingRoom(songDuration = 10) {
    const { service, room, clock } = await createLoadingRoom(songDuration);
    await loadSongForEveryone(service, room.code);
    return { service, room, clock };
}

// Test helper: play the current song to its end, the way a real game does it:
// (load it if needed) -> time runs out (endCurrentSong) -> host presses Next.
async function endSongAndNext(service: RoomsService, code: string) {
    if ((await service.findRoomByCode(code)).currentSongStartTime === null) {
        await loadSongForEveryone(service, code);
    }
    await service.endCurrentSong(code);
    return await service.nextSong(code, HOST);
}

// Test helper: a game that has FINISHED, where HOST scored 3 points on "alpha".
// Everything a reset must undo is "dirty" here: scores, ready flags, songs, playlist.
async function createFinishedRoom() {
    const { service, room, clock } = await createPlayingRoom();
    clock.advanceSeconds(3);
    await service.submitGuess(room.code, HOST, "alpha");
    for (let i = 0; i < 4; i++) await endSongAndNext(service, room.code); // past the last song
    return { service, room, clock };
}

describe('RoomsService', () => {
    it("should create a new room", async () => {
        const service = new RoomsService();

        const room = await service.createRoom({ id: "1234567890", nickname: "test" });

        expect(room).toBeDefined();
        expect(room.code).toBeDefined();
        expect(room.owner).toBeTruthy();
        expect(room.players.size).toBe(1);
        expect(room.players.get("1234567890")).toBeDefined();
    })
    it("a new room starts in the configuring phase", async () => {
        const service = new RoomsService();
        const room = await service.createRoom({ id: "1234567890", nickname: "test" });
        expect(room.status).toBe("configuring");
    })
    it("find a room by code", async () => {
        const service = new RoomsService();
        const room = await service.createRoom({ id: "1234567890", nickname: "test" });
        const foundRoom = await service.findRoom(room.code);
        expect(foundRoom).toBeDefined();
        expect(foundRoom?.code).toBe(room.code);
    })
    it("should join a new player to a room", async () => {
        const service = new RoomsService();
        const room = await service.createRoom({ id: '1234567890', nickname: 'test' });
        const result = await service.joinRoom(room.code, '1234567891', 'test2');
        expect(result.isNewPlayer).toBe(true);
        expect(result.room.players.size).toBe(2);
        expect(result.room.players.get('1234567891')).toBeDefined();
        expect(result.room.players.get('1234567891')?.nickname).toBe('test2');
    })
    it("should throw an error if the nickname is already taken", async () => {
        const service = new RoomsService();
        const room = await service.createRoom({ id: "1234567890", nickname: "test" });
        await expect(service.joinRoom(room.code, "1234567891", "test")).rejects.toThrow(ConflictException);
    })
    it("should reattach an existing player instead of throwing", async () => {
        const service = new RoomsService();
        const room = await service.createRoom({ id: "1234567890", nickname: "test" });
        const result = await service.joinRoom(room.code, "1234567890", "test");
        expect(result.isNewPlayer).toBe(false);
        expect(result.room.players.size).toBe(1);
        expect(result.room.players.get("1234567890")?.nickname).toBe("test");
    })
    it("a new player cannot join once the room left the configuring phase", async () => {
        const service = new RoomsService();
        const room = await createSubmittingRoomWithTwoPlayers(service);
        await expect(service.joinRoom(room.code, "1234567892", "latecomer")).rejects.toThrow(ForbiddenException);
        expect(room.players.size).toBe(2);
    })
    it("an existing player can still reattach after the configuring phase (e.g. page refresh)", async () => {
        const service = new RoomsService();
        const room = await createSubmittingRoomWithTwoPlayers(service);
        const result = await service.joinRoom(room.code, "1234567891", "test2");
        expect(result.isNewPlayer).toBe(false);
        expect(result.room.players.size).toBe(2);
    })
    it("should set a player as ready", async () => {
        const service = new RoomsService();
        const room = await createSubmittingRoomWithTwoPlayers(service);
        await service.changePlayerReadyStatus(room.code, "1234567891");
        expect(room.players.get("1234567891")?.isReady).toBe(true);
    })
    it("should set a player as not ready", async () => {
        const service = new RoomsService();
        const room = await createSubmittingRoomWithTwoPlayers(service);
        await service.changePlayerReadyStatus(room.code, "1234567891");
        await service.changePlayerReadyStatus(room.code, "1234567891");
        expect(room.players.get("1234567891")?.isReady).toBe(false);
    })
    it("a player cannot be ready while the host is still configuring", async () => {
        const service = new RoomsService();
        const room = await service.createRoom({ id: "1234567890", nickname: "test" });
        await service.joinRoom(room.code, "1234567891", "test2");
        await expect(service.changePlayerReadyStatus(room.code, "1234567891")).rejects.toThrow(BadRequestException);
        expect(room.players.get("1234567891")?.isReady).toBe(false);
    })
    it("should kick a player from a room", async () => {
        const service = new RoomsService();
        const room = await service.createRoom({ id: "1234567890", nickname: "test" });
        const result = await service.joinRoom(room.code, "1234567891", "test2");
        await service.kickPlayer(room.code, "1234567890", "1234567891");
        expect(result.room.players.size).toBe(1);
        expect(result.room.players.get("1234567891")?.nickname).toBe(undefined);
    })
    it("player cannot kick himself", async () => {
        const service = new RoomsService();
        const room = await service.createRoom({ id: "1234567890", nickname: "test" });
        const result = await service.joinRoom(room.code, "1234567891", "test2");
        await expect(service.kickPlayer(room.code, "1234567890", "1234567890")).rejects.toThrow(BadRequestException);
    })
    it("error should appear if player tries to kick a non-existent player", async () => {
        const service = new RoomsService();
        const room = await service.createRoom({ id: "1234567890", nickname: "test" });
        const result = await service.joinRoom(room.code, "1234567891", "test2");
        await expect(service.kickPlayer(room.code, "1234567890", "1234567892")).rejects.toThrow(NotFoundException);
    })
    it("player leaves a room", async () => {
        const service = new RoomsService();
        const room = await service.createRoom({ id: "1234567890", nickname: "test" });
        const result = await service.joinRoom(room.code, "1234567891", "test2");
        await service.leaveRoom(room.code, "1234567891");
        expect(result.room.players.size).toBe(1);
        expect(result.room.players.get("1234567891")?.nickname).toBe(undefined);
    })
    it("error should appear if player tries to leave a non-existent room", async () => {
        const service = new RoomsService();
        await expect(service.leaveRoom("1234567890", "1234567891")).rejects.toThrow(NotFoundException);
    })
    it("error should appear if player tries to leave a room he is not in", async () => {
        const service = new RoomsService();
        const room = await service.createRoom({ id: "1234567890", nickname: "test" });
        const result = await service.joinRoom(room.code, "1234567891", "test2");
        await expect(service.leaveRoom(room.code, "1234567892")).rejects.toThrow(NotFoundException);
    })
    it("when admin leaves a room, the room is deleted", async () => {
        const service = new RoomsService();
        const room = await service.createRoom({ id: "1234567890", nickname: "test" });
        const result = await service.joinRoom(room.code, "1234567891", "test2");
        await service.closeRoom(room.code, "1234567890");
        expect(await service.findRoom(room.code)).toBeUndefined();
    })

    describe("setSongsPerPlayer", () => {
        it("owner submitting sets the value and moves the room to the submitting phase", async () => {
            const service = new RoomsService();
            const room = await service.createRoom({ id: "1234567890", nickname: "test" });
            await service.setSongsPerPlayer(room.code, "1234567890", 4);
            expect(room.songsPerPlayer).toBe(4);
            expect(room.status).toBe("submitting");
        })
        it("a player who is not the owner cannot submit it", async () => {
            const service = new RoomsService();
            const room = await service.createRoom({ id: "1234567890", nickname: "test" });
            await service.joinRoom(room.code, "1234567891", "test2");
            await expect(service.setSongsPerPlayer(room.code, "1234567891", 4)).rejects.toThrow(ForbiddenException);
            expect(room.songsPerPlayer).toBe(2);
            expect(room.status).toBe("configuring");
        })
        it.each([0, 6, -1, 2.5])("rejects %s (must be a whole number from 1 to 5) and stays configuring", async (value) => {
            const service = new RoomsService();
            const room = await service.createRoom({ id: "1234567890", nickname: "test" });
            await expect(service.setSongsPerPlayer(room.code, "1234567890", value)).rejects.toThrow(BadRequestException);
            expect(room.status).toBe("configuring");
        })
        it.each([1, 5])("accepts the boundary value %s", async (value) => {
            const service = new RoomsService();
            const room = await service.createRoom({ id: "1234567890", nickname: "test" });
            await service.setSongsPerPlayer(room.code, "1234567890", value);
            expect(room.songsPerPlayer).toBe(value);
        })
        it("cannot be submitted a second time", async () => {
            const service = new RoomsService();
            const room = await createSubmittingRoomWithTwoPlayers(service);
            await expect(service.setSongsPerPlayer(room.code, "1234567890", 3)).rejects.toThrow(BadRequestException);
            expect(room.songsPerPlayer).toBe(2);
        })
        it("throws if the room does not exist", async () => {
            const service = new RoomsService();
            await expect(service.setSongsPerPlayer("nope", "1234567890", 3)).rejects.toThrow(NotFoundException);
        })

        // --- song duration: how many seconds each song plays before the answer is shown ---
        it("a new room plays each song for 10 seconds by default", async () => {
            const service = new RoomsService();
            const room = await service.createRoom({ id: HOST, nickname: "test" });
            expect(room.songDuration).toBe(10);
        })
        it("the owner sets the song duration together with songs per player", async () => {
            const service = new RoomsService();
            const room = await service.createRoom({ id: HOST, nickname: "test" });
            await service.setSongsPerPlayer(room.code, HOST, 3, 15);
            expect(room.songDuration).toBe(15);
            expect(room.songsPerPlayer).toBe(3);
        })
        it("without a song duration, the default (10) is used", async () => {
            const service = new RoomsService();
            const room = await service.createRoom({ id: HOST, nickname: "test" });
            await service.setSongsPerPlayer(room.code, HOST, 3);
            expect(room.songDuration).toBe(10);
        })
        it.each([9, 16, 0, 12.5])("rejects song duration %s (whole seconds from 10 to 15): nothing changes", async (songDuration) => {
            const service = new RoomsService();
            const room = await service.createRoom({ id: HOST, nickname: "test" });
            await expect(service.setSongsPerPlayer(room.code, HOST, 3, songDuration)).rejects.toThrow(BadRequestException);
            // Both values are rejected together: songsPerPlayer must not be half-applied
            expect(room.songDuration).toBe(10);
            expect(room.songsPerPlayer).toBe(2);
            expect(room.status).toBe("configuring");
        })
        it.each([10, 15])("accepts the boundary song duration %s", async (songDuration) => {
            const service = new RoomsService();
            const room = await service.createRoom({ id: HOST, nickname: "test" });
            await service.setSongsPerPlayer(room.code, HOST, 3, songDuration);
            expect(room.songDuration).toBe(songDuration);
        })
    })

    describe("submitSong", () => {
        // A valid song to start from; each test overrides only the field it is about
        const validSong = { youtubeId: "dQw4w9WgXcQ", startTimestamp: 43, title: "never gonna give you up" };

        // --- happy path ---
        it("adds the song to the player who submitted it", async () => {
            const service = new RoomsService();
            const room = await createSubmittingRoomWithTwoPlayers(service);
            await service.submitSong(room.code, "1234567891", validSong);
            expect(room.players.get("1234567891")?.songs).toEqual([
                { ...validSong, submittedBy: "1234567891" },
            ]);
        })
        it("does not touch other players' songs", async () => {
            const service = new RoomsService();
            const room = await createSubmittingRoomWithTwoPlayers(service);
            await service.submitSong(room.code, "1234567891", validSong);
            expect(room.players.get("1234567890")?.songs).toEqual([]);
        })
        it("returns the updated room (the gateway broadcasts it)", async () => {
            const service = new RoomsService();
            const room = await createSubmittingRoomWithTwoPlayers(service);
            const result = await service.submitSong(room.code, "1234567891", validSong);
            expect(result).toBe(room);
        })
        it("a player can add songs up to songsPerPlayer", async () => {
            const service = new RoomsService();
            const room = await createSubmittingRoomWithTwoPlayers(service); // songsPerPlayer = 2
            await service.submitSong(room.code, "1234567891", validSong);
            await service.submitSong(room.code, "1234567891", { ...validSong, youtubeId: "9bZkp7q19f0", title: "Gangnam Style" });
            expect(room.players.get("1234567891")?.songs).toHaveLength(2);
        })

        // --- who / when ---
        it("throws if the room does not exist", async () => {
            const service = new RoomsService();
            await expect(service.submitSong("nope", "1234567891", validSong)).rejects.toThrow(NotFoundException);
        })
        it("throws if the player is not in the room", async () => {
            const service = new RoomsService();
            const room = await createSubmittingRoomWithTwoPlayers(service);
            await expect(service.submitSong(room.code, "stranger", validSong)).rejects.toThrow(NotFoundException);
        })
        it("cannot submit while the host is still configuring", async () => {
            const service = new RoomsService();
            const room = await service.createRoom({ id: "1234567890", nickname: "test" });
            await expect(service.submitSong(room.code, "1234567890", validSong)).rejects.toThrow(BadRequestException);
            expect(room.players.get("1234567890")?.songs).toEqual([]);
        })
        it("cannot submit more than songsPerPlayer songs", async () => {
            const service = new RoomsService();
            const room = await createSubmittingRoomWithTwoPlayers(service); // songsPerPlayer = 2
            await service.submitSong(room.code, "1234567891", validSong);
            await service.submitSong(room.code, "1234567891", { ...validSong, youtubeId: "9bZkp7q19f0" });
            await expect(service.submitSong(room.code, "1234567891", { ...validSong, youtubeId: "kJQP7kiw5Fk" })).rejects.toThrow(BadRequestException);
            expect(room.players.get("1234567891")?.songs).toHaveLength(2);
        })

        // --- the song itself (never trust the client: the frontend checks are only a convenience) ---
        it.each(["", "   "])("rejects a blank title (%j)", async (title) => {
            const service = new RoomsService();
            const room = await createSubmittingRoomWithTwoPlayers(service);
            await expect(service.submitSong(room.code, "1234567891", { ...validSong, title })).rejects.toThrow(BadRequestException);
            expect(room.players.get("1234567891")?.songs).toEqual([]);
        })
        it("stores the title as typed (for the reveal), only without surrounding spaces", async () => {
            // Matching ignores case and punctuation when COMPARING (see
            // title-matching.ts), so the stored title can keep its real spelling
            const service = new RoomsService();
            const room = await createSubmittingRoomWithTwoPlayers(service);
            await service.submitSong(room.code, "1234567891", { ...validSong, title: "  That's Life  " });
            expect(room.players.get("1234567891")?.songs[0].title).toBe("That's Life");
        })
        it.each(["!!!", " - . ' "])("rejects a title with no letters or digits (%j): no guess could ever match it", async (title) => {
            const service = new RoomsService();
            const room = await createSubmittingRoomWithTwoPlayers(service);
            await expect(service.submitSong(room.code, "1234567891", { ...validSong, title })).rejects.toThrow(BadRequestException);
            expect(room.players.get("1234567891")?.songs).toEqual([]);
        })
        it.each([-1, 1.5, Number.NaN])("rejects start timestamp %s (must be a whole number >= 0)", async (startTimestamp) => {
            const service = new RoomsService();
            const room = await createSubmittingRoomWithTwoPlayers(service);
            await expect(service.submitSong(room.code, "1234567891", { ...validSong, startTimestamp })).rejects.toThrow(BadRequestException);
            expect(room.players.get("1234567891")?.songs).toEqual([]);
        })
        it("accepts a start timestamp of 0 (boundary)", async () => {
            const service = new RoomsService();
            const room = await createSubmittingRoomWithTwoPlayers(service);
            await service.submitSong(room.code, "1234567891", { ...validSong, startTimestamp: 0 });
            expect(room.players.get("1234567891")?.songs[0].startTimestamp).toBe(0);
        })
        it.each(["", "short", "dQw4w9WgXcQ-too-long", "https://youtu.be/dQw4w9WgXcQ", "has spaces!"])(
            "rejects an invalid YouTube video id (%j)",
            async (youtubeId) => {
                const service = new RoomsService();
                const room = await createSubmittingRoomWithTwoPlayers(service);
                await expect(service.submitSong(room.code, "1234567891", { ...validSong, youtubeId })).rejects.toThrow(BadRequestException);
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
        it("a new room starts with an empty playlist", async () => {
            const service = new RoomsService();
            const room = await service.createRoom({ id: HOST, nickname: "test" });
            expect(room.playlist).toEqual([]);
        })
        it("moves the room to the playing phase", async () => {
            const service = new RoomsService();
            const room = await createRoomReadyToStart(service);
            await service.startGame(room.code, HOST);
            expect(room.status).toBe("playing");
        })
        it("puts every submitted song from every player into the playlist exactly once", async () => {
            const service = new RoomsService();
            const room = await createRoomReadyToStart(service);
            await service.startGame(room.code, HOST);
            const ids = room.playlist.map(song => song.youtubeId);
            // Order-independent check: the real shuffler is random
            expect(ids).toHaveLength(4);
            expect(ids).toEqual(expect.arrayContaining(["aaaaaaaaaaa", "bbbbbbbbbbb", "ccccccccccc", "ddddddddddd"]));
        })
        it("keeps who submitted each song (needed later: you can't score on your own song)", async () => {
            const service = new RoomsService();
            const room = await createRoomReadyToStart(service);
            await service.startGame(room.code, HOST);
            const alpha = room.playlist.find(song => song.title === "alpha");
            expect(alpha?.submittedBy).toBe(PLAYER);
        })
        it("orders the playlist using the injected shuffler", async () => {
            const service = new RoomsService(sortByTitleShuffler);
            const room = await createRoomReadyToStart(service);
            await service.startGame(room.code, HOST);
            expect(room.playlist.map(song => song.title)).toEqual(["alpha", "bravo", "charlie", "delta"]);
        })
        it("returns the updated room (the gateway broadcasts it)", async () => {
            const service = new RoomsService();
            const room = await createRoomReadyToStart(service);
            expect(await service.startGame(room.code, HOST)).toBe(room);
        })

        // --- who / when ---
        it("throws if the room does not exist", async () => {
            const service = new RoomsService();
            await expect(service.startGame("nope", HOST)).rejects.toThrow(NotFoundException);
        })
        it("only the owner can start the game", async () => {
            const service = new RoomsService();
            const room = await createRoomReadyToStart(service);
            await expect(service.startGame(room.code, PLAYER)).rejects.toThrow(ForbiddenException);
            expect(room.status).toBe("submitting");
            expect(room.playlist).toEqual([]);
        })
        it("cannot start while somebody is not ready", async () => {
            const service = new RoomsService();
            const room = await createRoomReadyToStart(service);
            await service.changePlayerReadyStatus(room.code, PLAYER); // un-ready
            await expect(service.startGame(room.code, HOST)).rejects.toThrow(BadRequestException);
            expect(room.status).toBe("submitting");
            expect(room.playlist).toEqual([]);
        })
        it("cannot start while the host is still configuring", async () => {
            const service = new RoomsService();
            const room = await service.createRoom({ id: HOST, nickname: "test" });
            await expect(service.startGame(room.code, HOST)).rejects.toThrow(BadRequestException);
            expect(room.status).toBe("configuring");
        })
        it("cannot start a game that is already running", async () => {
            const service = new RoomsService(sortByTitleShuffler);
            const room = await createRoomReadyToStart(service);
            await service.startGame(room.code, HOST);
            await expect(service.startGame(room.code, HOST)).rejects.toThrow(BadRequestException);
            expect(room.playlist).toHaveLength(4); // not rebuilt / doubled
        })

        // --- step 2.1: starting the game only LOADS the first song, it does not start the timer ---
        it("does not start the timer yet (clients still have to load the video)", async () => {
            const { room } = await createLoadingRoom();
            expect(room.currentSongStartTime).toBeNull();
        })
        it("starts on the first song of the playlist", async () => {
            const { room } = await createLoadingRoom();
            expect(room.currentSongIndex).toBe(0);
        })
        it("the first song starts unrevealed", async () => {
            const { room } = await createLoadingRoom();
            expect(room.songRevealed).toBe(false);
        })

        it.todo("does starting require at least 2 players (nobody can score on their own song)?");
        it.todo("does starting require every player to have submitted songsPerPlayer songs?");
        it.todo("which song is playing now? (e.g. currentSongIndex starts at 0)");
    })

    describe("submitGuess", () => {
        // --- happy path: scoring (golf-style, seconds since the song started) ---
        it("a correct guess scores the seconds elapsed since the song started", async () => {
            const { service, room, clock } = await createPlayingRoom();
            clock.advanceSeconds(3);
            await service.submitGuess(room.code, HOST, "alpha");
            expect(room.players.get(HOST)?.score).toBe(3);
        })
        it("a later correct guess scores more (lower is better)", async () => {
            const { service, room, clock } = await createPlayingRoom();
            clock.advanceSeconds(6);
            await service.submitGuess(room.code, HOST, "alpha");
            expect(room.players.get(HOST)?.score).toBe(6);
        })
        it("returns correct: true and the room for a correct guess", async () => {
            const { service, room, clock } = await createPlayingRoom();
            clock.advanceSeconds(3);
            const result = await service.submitGuess(room.code, HOST, "alpha");
            expect(result).toEqual({ room, correct: true });
        })
        it("remembers that the player guessed the current song", async () => {
            const { service, room, clock } = await createPlayingRoom();
            clock.advanceSeconds(3);
            await service.submitGuess(room.code, HOST, "alpha");
            expect(room.guessedBy.has(HOST)).toBe(true);
        })
        it("ignores letter case and surrounding spaces", async () => {
            const { service, room, clock } = await createPlayingRoom();
            clock.advanceSeconds(3);
            const result = await service.submitGuess(room.code, HOST, "  ALPHA ");
            expect(result.correct).toBe(true);
            expect(room.players.get(HOST)?.score).toBe(3);
        })
        // The details of matching are tested in title-matching.spec.ts; these
        // two only prove the service really uses it
        it("ignores punctuation: 'al-pha!' scores on 'alpha'", async () => {
            const { service, room, clock } = await createPlayingRoom();
            clock.advanceSeconds(3);
            const result = await service.submitGuess(room.code, HOST, "al-pha!");
            expect(result.correct).toBe(true);
        })
        it("forgives a small typo: 'alpah' scores on 'alpha'", async () => {
            const { service, room, clock } = await createPlayingRoom();
            clock.advanceSeconds(3);
            const result = await service.submitGuess(room.code, HOST, "alpah");
            expect(result.correct).toBe(true);
        })
        it("measures time from the start of the CURRENT song, not the start of the game", async () => {
            const { service, room, clock } = await createPlayingRoom();
            clock.advanceSeconds(20);                 // song 0 plays for 20s
            await endSongAndNext(service, room.code);        // song 1 ("bravo", by HOST) starts loading
            await loadSongForEveryone(service, room.code);  // ...and starts playing now
            clock.advanceSeconds(4);
            await service.submitGuess(room.code, PLAYER, "bravo");
            expect(room.players.get(PLAYER)?.score).toBe(4);
        })
        it("time spent loading the video does not count toward the score", async () => {
            const { service, room, clock } = await createLoadingRoom();
            clock.advanceSeconds(5);                  // slow connections: 5s of loading
            await loadSongForEveryone(service, room.code);  // song 0 "alpha" starts playing now
            clock.advanceSeconds(3);
            await service.submitGuess(room.code, HOST, "alpha");
            expect(room.players.get(HOST)?.score).toBe(3); // not 8
        })
        it("scores add up across songs", async () => {
            const { service, room, clock } = await createPlayingRoom();
            await endSongAndNext(service, room.code);        // song 1 "bravo" (by HOST)
            await loadSongForEveryone(service, room.code);
            clock.advanceSeconds(4);
            await service.submitGuess(room.code, PLAYER, "bravo");
            await endSongAndNext(service, room.code);        // song 2 "charlie" (by PLAYER)
            await endSongAndNext(service, room.code);        // song 3 "delta" (by HOST)
            await loadSongForEveryone(service, room.code);
            clock.advanceSeconds(5);
            await service.submitGuess(room.code, PLAYER, "delta");
            expect(room.players.get(PLAYER)?.score).toBe(9);
        })

        // --- wrong / ignored guesses: no error, just correct: false and nothing changes ---
        it("a wrong guess returns correct: false and does not change the score", async () => {
            const { service, room, clock } = await createPlayingRoom();
            clock.advanceSeconds(3);
            const result = await service.submitGuess(room.code, HOST, "bravo");
            expect(result).toEqual({ room, correct: false });
            expect(room.players.get(HOST)?.score).toBe(0);
            expect(room.guessedBy.has(HOST)).toBe(false);
        })
        it("a player can keep guessing after a wrong guess (unlimited guesses)", async () => {
            const { service, room, clock } = await createPlayingRoom();
            clock.advanceSeconds(2);
            await service.submitGuess(room.code, HOST, "wrong");
            clock.advanceSeconds(3);
            const result = await service.submitGuess(room.code, HOST, "alpha");
            expect(result.correct).toBe(true);
            expect(room.players.get(HOST)?.score).toBe(5);
        })
        it("guessing your own song is ignored: no points, not marked as guessed", async () => {
            const { service, room, clock } = await createPlayingRoom(); // song 0 "alpha" was submitted by PLAYER
            clock.advanceSeconds(3);
            const result = await service.submitGuess(room.code, PLAYER, "alpha");
            expect(result.correct).toBe(false);
            expect(room.players.get(PLAYER)?.score).toBe(0);
            expect(room.guessedBy.has(PLAYER)).toBe(false);
        })
        it("a guess after time ran out is ignored: correct: false, no points, not marked as guessed", async () => {
            // Ignored, not an error: a guess sent at 9.99s can arrive just after the reveal
            const { service, room } = await createPlayingRoom();
            await service.endCurrentSong(room.code); // HOST didn't guess: 10 + 1 = 11 points
            const result = await service.submitGuess(room.code, HOST, "alpha");
            expect(result.correct).toBe(false);
            expect(room.players.get(HOST)?.score).toBe(11);
            expect(room.guessedBy.has(HOST)).toBe(false);
        })
        it("guessing again after already scoring on this song is ignored", async () => {
            const { service, room, clock } = await createPlayingRoom();
            clock.advanceSeconds(3);
            await service.submitGuess(room.code, HOST, "alpha");
            clock.advanceSeconds(10);
            const result = await service.submitGuess(room.code, HOST, "alpha");
            expect(result.correct).toBe(false);
            expect(room.players.get(HOST)?.score).toBe(3); // not 3 + 13
        })

        // --- who / when ---
        it("throws if the room does not exist", async () => {
            const { service } = await createPlayingRoom();
            await expect(service.submitGuess("nope", HOST, "alpha")).rejects.toThrow(NotFoundException);
        })
        it("throws if the player is not in the room", async () => {
            const { service, room } = await createPlayingRoom();
            await expect(service.submitGuess(room.code, "stranger", "alpha")).rejects.toThrow(NotFoundException);
        })
        it("cannot guess before the game has started", async () => {
            const service = new RoomsService(sortByTitleShuffler, createFakeClock());
            const room = await createRoomReadyToStart(service); // still "submitting"
            await expect(service.submitGuess(room.code, HOST, "alpha")).rejects.toThrow(BadRequestException);
        })
        it("cannot guess after the game has finished", async () => {
            const { service, room } = await createPlayingRoom();
            for (let i = 0; i < 4; i++) await endSongAndNext(service, room.code); // past the last song
            await expect(service.submitGuess(room.code, HOST, "delta")).rejects.toThrow(BadRequestException);
        })

        // --- step 2.3: no guessing while the song is still loading ---
        // DESIGN CHOICE baked into these two tests: an early guess is REJECTED (error),
        // like guessing before the game started. The alternative is to IGNORE it
        // (return correct: false), like guessing your own song. Change them if you prefer that.
        it("a correct guess while the song is still loading is rejected and scores nothing", async () => {
            const { service, room, clock } = await createLoadingRoom();
            clock.advanceSeconds(2);
            await expect(service.submitGuess(room.code, HOST, "alpha")).rejects.toThrow(BadRequestException);
            expect(room.players.get(HOST)?.score).toBe(0);
            expect(room.guessedBy.has(HOST)).toBe(false);
        })
        it("a wrong guess while the song is still loading is rejected too", async () => {
            // Ordering matters: if the "has it started?" check comes AFTER the title
            // comparison, a wrong guess slips through as correct: false instead.
            const { service, room } = await createLoadingRoom();
            await expect(service.submitGuess(room.code, HOST, "wrong")).rejects.toThrow(BadRequestException);
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
        it("returns the title of the song, so the gateway can reveal it", async () => {
            const { service, room } = await createPlayingRoom();
            expect(await service.endCurrentSong(room.code)).toEqual({ room, title: "alpha" });
        })
        it("marks the song as revealed", async () => {
            const { service, room } = await createPlayingRoom();
            await service.endCurrentSong(room.code);
            expect(room.songRevealed).toBe(true);
        })
        it("stays on the same song (the host moves on with nextSong)", async () => {
            const { service, room } = await createPlayingRoom();
            await service.endCurrentSong(room.code);
            expect(room.currentSongIndex).toBe(0);
            expect(room.status).toBe("playing");
        })

        // --- penalty: not guessing costs songDuration + 1 ---
        it("a player who didn't guess gets songDuration + 1 points", async () => {
            const { service, room } = await createPlayingRoom(); // songDuration 10
            await service.endCurrentSong(room.code);
            expect(room.players.get(HOST)?.score).toBe(11);
        })
        it("uses the room's own song duration", async () => {
            const { service, room } = await createPlayingRoom(15);
            await service.endCurrentSong(room.code);
            expect(room.players.get(HOST)?.score).toBe(16);
        })
        it("a player who guessed keeps their score (no penalty)", async () => {
            const { service, room, clock } = await createPlayingRoom();
            clock.advanceSeconds(3);
            await service.submitGuess(room.code, HOST, "alpha");
            await service.endCurrentSong(room.code);
            expect(room.players.get(HOST)?.score).toBe(3);
        })
        it("the player who submitted the song gets no penalty (they can't guess it)", async () => {
            const { service, room } = await createPlayingRoom();
            await service.endCurrentSong(room.code);
            expect(room.players.get(PLAYER)?.score).toBe(0);
        })
        it("the penalty is always worse than the slowest correct guess", async () => {
            // Guessing at the last moment (10s) must still beat not guessing at all (11)
            const { service, room, clock } = await createPlayingRoom();
            clock.advanceSeconds(10);
            await service.submitGuess(room.code, HOST, "alpha");
            expect(room.players.get(HOST)?.score).toBeLessThan(11);
        })

        // --- who / when ---
        it("cannot end the same song twice (the penalty must not be given twice)", async () => {
            const { service, room } = await createPlayingRoom();
            await service.endCurrentSong(room.code);
            await expect(service.endCurrentSong(room.code)).rejects.toThrow(BadRequestException);
            expect(room.players.get(HOST)?.score).toBe(11);
        })
        it("cannot end a song that hasn't started yet (still loading)", async () => {
            const { service, room } = await createLoadingRoom();
            await expect(service.endCurrentSong(room.code)).rejects.toThrow(BadRequestException);
            expect(room.songRevealed).toBe(false);
        })
        it("cannot end a song before the game has started", async () => {
            const service = new RoomsService(sortByTitleShuffler, createFakeClock());
            const room = await createRoomReadyToStart(service);
            await expect(service.endCurrentSong(room.code)).rejects.toThrow(BadRequestException);
        })
        it("throws if the room does not exist (e.g. it was closed mid-song)", async () => {
            const { service } = await createPlayingRoom();
            await expect(service.endCurrentSong("nope")).rejects.toThrow(NotFoundException);
        })
    })

    describe("nextSong", () => {
        // The first song has played and its time ran out: the answer is on screen,
        // and this is the moment the host may press Next
        async function createRevealedRoom() {
            const ctx = await createPlayingRoom();
            await ctx.service.endCurrentSong(ctx.room.code);
            return ctx;
        }

        // --- happy path ---
        it("moves to the next song in the playlist", async () => {
            const { service, room } = await createRevealedRoom();
            await service.nextSong(room.code, HOST);
            expect(room.currentSongIndex).toBe(1);
        })
        it("stops the timer: the new song has to be loaded before it starts", async () => {
            const { service, room } = await createRevealedRoom();
            await service.nextSong(room.code, HOST);
            expect(room.currentSongStartTime).toBeNull();
        })
        it("the new song starts unrevealed (guessing is open again)", async () => {
            const { service, room } = await createRevealedRoom();
            await service.nextSong(room.code, HOST);
            expect(room.songRevealed).toBe(false);
        })
        it("forgets who loaded the previous song (everyone must load the new one)", async () => {
            const { service, room } = await createRevealedRoom();
            await service.nextSong(room.code, HOST);
            await service.markSongLoaded(room.code, HOST); // only one of two players
            expect(room.currentSongStartTime).toBeNull();
        })
        it("clears who has guessed (everyone can guess the new song)", async () => {
            const { service, room, clock } = await createPlayingRoom();
            clock.advanceSeconds(3);
            await service.submitGuess(room.code, HOST, "alpha");
            await service.endCurrentSong(room.code);
            await service.nextSong(room.code, HOST);
            expect(room.guessedBy.size).toBe(0);
        })
        it("does not change anyone's score", async () => {
            const { service, room } = await createRevealedRoom();
            const before = [room.players.get(HOST)?.score, room.players.get(PLAYER)?.score];
            await service.nextSong(room.code, HOST);
            expect([room.players.get(HOST)?.score, room.players.get(PLAYER)?.score]).toEqual(before);
        })
        it("returns the updated room (the gateway broadcasts it)", async () => {
            const { service, room } = await createRevealedRoom();
            expect(await service.nextSong(room.code, HOST)).toBe(room);
        })

        // --- end of the playlist ---
        it("stays playing while there are songs left", async () => {
            const { service, room } = await createPlayingRoom();
            for (let i = 0; i < 3; i++) await endSongAndNext(service, room.code); // now on the last song (index 3)
            expect(room.status).toBe("playing");
        })
        it("finishes the game after the last song", async () => {
            const { service, room } = await createPlayingRoom();
            for (let i = 0; i < 4; i++) await endSongAndNext(service, room.code);
            expect(room.status).toBe("finished");
        })
        it("cannot skip once the game is finished", async () => {
            const { service, room } = await createPlayingRoom();
            for (let i = 0; i < 4; i++) await endSongAndNext(service, room.code);
            await expect(service.nextSong(room.code, HOST)).rejects.toThrow(BadRequestException);
        })

        // --- who / when ---
        it("throws if the room does not exist", async () => {
            const { service } = await createRevealedRoom();
            await expect(service.nextSong("nope", HOST)).rejects.toThrow(NotFoundException);
        })
        it("only the owner can skip to the next song", async () => {
            const { service, room } = await createRevealedRoom();
            await expect(service.nextSong(room.code, PLAYER)).rejects.toThrow(ForbiddenException);
            expect(room.currentSongIndex).toBe(0);
        })
        it("cannot skip before the game has started", async () => {
            const service = new RoomsService(sortByTitleShuffler, createFakeClock());
            const room = await createRoomReadyToStart(service);
            await expect(service.nextSong(room.code, HOST)).rejects.toThrow(BadRequestException);
        })
        it("cannot move on while the song is still playing (the answer isn't revealed yet)", async () => {
            const { service, room } = await createPlayingRoom();
            await expect(service.nextSong(room.code, HOST)).rejects.toThrow(BadRequestException);
            expect(room.currentSongIndex).toBe(0);
        })
        it("cannot move on while the song is still loading", async () => {
            const { service, room } = await createLoadingRoom();
            await expect(service.nextSong(room.code, HOST)).rejects.toThrow(BadRequestException);
            expect(room.currentSongIndex).toBe(0);
        })

        it.todo("what should currentSongStartTime be once the game is finished? (null?)");
    })

    // Step 2.2: each client tells the server "I have loaded the video".
    // When the LAST player reports in, the song starts and the timer begins.
    // The gateway uses `allLoaded` to decide whether to emit "playSong" to the room.
    describe("markSongLoaded", () => {
        // --- happy path ---
        it("does not start the song while some players are still loading", async () => {
            const { service, room } = await createLoadingRoom();
            const result = await service.markSongLoaded(room.code, HOST);
            expect(result).toEqual({ room, allLoaded: false });
            expect(room.currentSongStartTime).toBeNull();
        })
        it("starts the song when the last player has loaded it", async () => {
            const { service, room, clock } = await createLoadingRoom();
            clock.advanceSeconds(2);
            await service.markSongLoaded(room.code, HOST);
            clock.advanceSeconds(1);
            const result = await service.markSongLoaded(room.code, PLAYER);
            expect(result).toEqual({ room, allLoaded: true });
            expect(room.currentSongStartTime).toBe(clock.now()); // the LAST load, not the first
        })
        it("the order in which players load does not matter", async () => {
            const { service, room } = await createLoadingRoom();
            await service.markSongLoaded(room.code, PLAYER);
            const result = await service.markSongLoaded(room.code, HOST);
            expect(result.allLoaded).toBe(true);
        })
        it("the same player reporting twice does not count as two players", async () => {
            const { service, room } = await createLoadingRoom();
            await service.markSongLoaded(room.code, HOST);
            const result = await service.markSongLoaded(room.code, HOST);
            expect(result.allLoaded).toBe(false);
            expect(room.currentSongStartTime).toBeNull();
        })

        // --- after the song has already started ---
        // Real case: a player refreshes mid-song, their browser loads the video again
        // and sends songLoaded. That must not restart the timer for everyone.
        it("loading again after the song started does not restart the timer", async () => {
            const { service, room, clock } = await createPlayingRoom();
            const startedAt = room.currentSongStartTime;
            clock.advanceSeconds(7);
            await service.markSongLoaded(room.code, HOST);
            expect(room.currentSongStartTime).toBe(startedAt);
        })
        it("only the call that completes loading reports allLoaded: true (so playSong is sent once)", async () => {
            const { service, room } = await createPlayingRoom();
            const result = await service.markSongLoaded(room.code, HOST);
            expect(result.allLoaded).toBe(false);
        })

        // --- who / when ---
        it("throws if the room does not exist", async () => {
            const { service } = await createLoadingRoom();
            await expect(service.markSongLoaded("nope", HOST)).rejects.toThrow(NotFoundException);
        })
        it("throws if the player is not in the room", async () => {
            const { service, room } = await createLoadingRoom();
            await expect(service.markSongLoaded(room.code, "stranger")).rejects.toThrow(NotFoundException);
        })
        it("cannot report loaded before the game has started", async () => {
            const service = new RoomsService(sortByTitleShuffler, createFakeClock());
            const room = await createRoomReadyToStart(service); // still "submitting"
            await expect(service.markSongLoaded(room.code, HOST)).rejects.toThrow(BadRequestException);
        })
        it("cannot report loaded after the game has finished", async () => {
            const { service, room } = await createPlayingRoom();
            for (let i = 0; i < 4; i++) await endSongAndNext(service, room.code);
            await expect(service.markSongLoaded(room.code, HOST)).rejects.toThrow(BadRequestException);
        })

        // --- rules you still have to decide on ---
        it.todo("what if a player leaves / is kicked while the others wait for them to load?");
        it.todo("timeout: start anyway after N seconds if someone never loads (needs fake timers)");
    })

    // After the leaderboard, the host sends everyone back to the lobby of the SAME room:
    // same code, same people, but a fresh game (no songs, no scores, nobody ready).
    describe("resetRoom", () => {
        // --- happy path: the room goes back to its first state ---
        it("moves a finished room back to the configuring phase", async () => {
            const { service, room } = await createFinishedRoom();
            await service.resetRoom(room.code, HOST);
            expect(room.status).toBe("configuring");
        })
        it("clears the game: empty playlist, first song, no timer, nobody guessed or loaded", async () => {
            const { service, room } = await createFinishedRoom();
            await service.resetRoom(room.code, HOST);
            expect(room.playlist).toEqual([]);
            expect(room.currentSongIndex).toBe(0);
            expect(room.currentSongStartTime).toBeNull();
            expect(room.guessedBy.size).toBe(0);
            expect(room.songLoadedBy.size).toBe(0);
            expect(room.songRevealed).toBe(false);
        })
        it("keeps the previous song duration (like songs per player)", async () => {
            const { service, room } = await createFinishedRoom();
            await service.resetRoom(room.code, HOST);
            expect(room.songDuration).toBe(10);
        })
        it("returns the updated room (the gateway broadcasts it)", async () => {
            const { service, room } = await createFinishedRoom();
            expect(await service.resetRoom(room.code, HOST)).toBe(room);
        })

        // --- the players stay, only their game data is reset ---
        it("keeps everyone in the room, with the same nicknames", async () => {
            const { service, room } = await createFinishedRoom();
            await service.resetRoom(room.code, HOST);
            expect(room.players.size).toBe(2);
            expect(room.players.get(HOST)?.nickname).toBe("test");
            expect(room.players.get(PLAYER)?.nickname).toBe("test2");
        })
        it("keeps the same host", async () => {
            const { service, room } = await createFinishedRoom();
            await service.resetRoom(room.code, HOST);
            expect(room.owner).toBe(HOST);
        })
        it("resets every player's score to 0", async () => {
            const { service, room } = await createFinishedRoom();
            expect(room.players.get(HOST)?.score).toBeGreaterThan(0); // sanity check: there IS something to reset
            await service.resetRoom(room.code, HOST);
            expect(room.players.get(HOST)?.score).toBe(0);
            expect(room.players.get(PLAYER)?.score).toBe(0);
        })
        it("makes every player not ready", async () => {
            const { service, room } = await createFinishedRoom();
            await service.resetRoom(room.code, HOST);
            expect(room.players.get(HOST)?.isReady).toBe(false);
            expect(room.players.get(PLAYER)?.isReady).toBe(false);
        })
        it("clears every player's songs (everyone knows those answers now)", async () => {
            const { service, room } = await createFinishedRoom();
            await service.resetRoom(room.code, HOST);
            expect(room.players.get(HOST)?.songs).toEqual([]);
            expect(room.players.get(PLAYER)?.songs).toEqual([]);
        })
        it("keeps the previous songs per player (the host's setting starts from it)", async () => {
            const { service, room } = await createFinishedRoom(); // songsPerPlayer = 2
            await service.resetRoom(room.code, HOST);
            expect(room.songsPerPlayer).toBe(2);
        })

        // --- consequences of being back in "configuring" ---
        it("new players can join again", async () => {
            const { service, room } = await createFinishedRoom();
            await service.resetRoom(room.code, HOST);
            const result = await service.joinRoom(room.code, "1234567892", "latecomer");
            expect(result.isNewPlayer).toBe(true);
            expect(room.players.size).toBe(3);
        })
        it("a whole second game can be played after a reset", async () => {
            // Catches any field the reset forgets: the second game would break on it
            const { service, room, clock } = await createFinishedRoom();
            await service.resetRoom(room.code, HOST);
            await service.setSongsPerPlayer(room.code, HOST, 1);
            await service.submitSong(room.code, HOST, { youtubeId: "eeeeeeeeeee", startTimestamp: 0, title: "echo" });
            await service.submitSong(room.code, PLAYER, { youtubeId: "fffffffffff", startTimestamp: 0, title: "foxtrot" });
            await service.changePlayerReadyStatus(room.code, HOST);
            await service.changePlayerReadyStatus(room.code, PLAYER);
            await service.startGame(room.code, HOST);
            expect(room.playlist.map(song => song.title)).toEqual(["echo", "foxtrot"]); // no old songs
            await loadSongForEveryone(service, room.code);
            clock.advanceSeconds(5);
            await service.submitGuess(room.code, PLAYER, "echo");
            expect(room.players.get(PLAYER)?.score).toBe(5); // counted from 0, not added to the old game
        })

        // --- who / when ---
        it("throws if the room does not exist", async () => {
            const { service } = await createFinishedRoom();
            await expect(service.resetRoom("nope", HOST)).rejects.toThrow(NotFoundException);
        })
        it("only the owner can reset the room, and nothing changes", async () => {
            const { service, room } = await createFinishedRoom();
            const hostScoreBefore = room.players.get(HOST)?.score;
            await expect(service.resetRoom(room.code, PLAYER)).rejects.toThrow(ForbiddenException);
            expect(room.status).toBe("finished");
            expect(room.players.get(HOST)?.score).toBe(hostScoreBefore);
        })
        it("cannot reset while a game is playing (only after it finished)", async () => {
            const { service, room, clock } = await createPlayingRoom();
            clock.advanceSeconds(3);
            await service.submitGuess(room.code, HOST, "alpha");
            await expect(service.resetRoom(room.code, HOST)).rejects.toThrow(BadRequestException);
            expect(room.status).toBe("playing");
            expect(room.players.get(HOST)?.score).toBe(3);
        })
        it("cannot reset while songs are being submitted", async () => {
            const service = new RoomsService();
            const room = await createRoomReadyToStart(service);
            await expect(service.resetRoom(room.code, HOST)).rejects.toThrow(BadRequestException);
            expect(room.players.get(HOST)?.songs).toHaveLength(2); // songs not wiped
        })
        it("cannot reset a room that is still configuring", async () => {
            const service = new RoomsService();
            const room = await service.createRoom({ id: HOST, nickname: "test" });
            await expect(service.resetRoom(room.code, HOST)).rejects.toThrow(BadRequestException);
        })
    })
});
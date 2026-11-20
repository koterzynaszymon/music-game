import { BadRequestException, ForbiddenException } from "@nestjs/common";
import type { Server, Socket } from "socket.io";
import { RoomsGateway } from "./rooms.gateway.js";
import { RoomsService } from "./rooms.service.js";

// What these tests are about
// --------------------------
// The game RULES are already tested in rooms.service.spec.ts. The gateway's job
// is ROUTING: which event goes to whom, in what order, carrying what data.
// So we use the real RoomsService (fast, already trusted) and replace only the
// network side with fakes that record every emit.
//
// Note: calling handler methods directly skips what Nest adds around them at
// runtime: no ValidationPipe on the DTOs and no WsErrorFilter. That's why an
// error shows up here as a thrown exception, not as an "error" event.

const HOST = "1234567890";
const PLAYER = "1234567891";

// --- Test doubles ---------------------------------------------------------

type Emit = { to: string; event: string; payload?: unknown };

// A "spy" for the Socket.IO server: server.to(x).emit(...) is recorded as
// { to: x, event, payload } instead of being sent over the network.
function createFakeServer() {
    const emits: Emit[] = [];
    const server = {
        to: (target: string) => ({
            emit: (event: string, payload?: unknown) => {
                emits.push({ to: target, event, payload });
                return true;
            },
        }),
        in: () => ({ socketsLeave: vi.fn() }),
    };
    return { server: server as unknown as Server, emits };
}

// A spy for ONE connected socket: client.emit(...) only reaches this player.
function createFakeClient() {
    const emits: { event: string; payload?: unknown }[] = [];
    const client = {
        emit: (event: string, payload?: unknown) => {
            emits.push({ event, payload });
            return true;
        },
        join: vi.fn(),
        leave: vi.fn(),
    };
    return { client: client as unknown as Socket, emits, join: client.join };
}

// Same fakes as in rooms.service.spec.ts (predictable order, hand-driven time)
const sortByTitleShuffler = {
    shuffle: <T extends { title: string }>(items: T[]) =>
        [...items].sort((a, b) => a.title.localeCompare(b.title)),
};
function createFakeClock(startMs = 1_000_000) {
    let nowMs = startMs;
    return {
        now: () => nowMs,
        advanceSeconds: (seconds: number) => { nowMs += seconds * 1000; },
    };
}

// --- Setup helpers --------------------------------------------------------
// Arrange with the SERVICE (quick, no emits to wade through),
// act with the GATEWAY (the thing under test).

function setup() {
    const clock = createFakeClock();
    const service = new RoomsService(sortByTitleShuffler, clock);
    const gateway = new RoomsGateway(service);
    const { server, emits } = createFakeServer();
    gateway.server = server;
    return { service, gateway, clock, serverEmits: emits };
}

// Both players submitted 2 songs and are ready. After startGame the playlist is:
//   0 "alpha"   ddddddddddd (by PLAYER)
//   1 "bravo"   bbbbbbbbbbb (by HOST)
//   2 "charlie" ccccccccccc (by PLAYER)
//   3 "delta"   aaaaaaaaaaa (by HOST)
const TITLES = ["alpha", "bravo", "charlie", "delta"];
function createReadyRoom(service: RoomsService) {
    const room = service.createRoom({ id: HOST, nickname: "host" });
    service.joinRoom(room.code, PLAYER, "player");
    service.setSongsPerPlayer(room.code, HOST, 2);
    service.submitSong(room.code, HOST, { youtubeId: "aaaaaaaaaaa", startTimestamp: 0, title: "delta" } as never);
    service.submitSong(room.code, HOST, { youtubeId: "bbbbbbbbbbb", startTimestamp: 10, title: "bravo" } as never);
    service.submitSong(room.code, PLAYER, { youtubeId: "ccccccccccc", startTimestamp: 20, title: "charlie" } as never);
    service.submitSong(room.code, PLAYER, { youtubeId: "ddddddddddd", startTimestamp: 30, title: "alpha" } as never);
    service.changePlayerReadyStatus(room.code, HOST);
    service.changePlayerReadyStatus(room.code, PLAYER);
    return room;
}

// Game started, first song still loading
function setupLoadingGame() {
    const ctx = setup();
    const room = createReadyRoom(ctx.service);
    ctx.service.startGame(room.code, HOST);
    ctx.serverEmits.length = 0; // forget the setup's emits (none here, but keeps intent clear)
    return { ...ctx, room };
}

// Game started, first song loaded by everyone and playing
function setupPlayingGame() {
    const ctx = setupLoadingGame();
    ctx.service.markSongLoaded(ctx.room.code, HOST);
    ctx.service.markSongLoaded(ctx.room.code, PLAYER);
    return ctx;
}

// --- Small assertion helpers ---------------------------------------------

const eventNames = (emits: { event: string }[]) => emits.map((e) => e.event);
const toRoom = (emits: Emit[], code: string) => emits.filter((e) => e.to === code);

// True if any payload, anywhere, mentions one of these strings
function mentionsAny(emits: { payload?: unknown }[], words: string[]) {
    const text = JSON.stringify(emits.map((e) => e.payload ?? null));
    return words.some((word) => text.includes(word));
}

describe("RoomsGateway", () => {
    describe("joinRoom", () => {
        it("a new player joins the socket rooms for the room code and their own id", () => {
            const { service, gateway } = setup();
            const room = service.createRoom({ id: HOST, nickname: "host" });
            const { client, join } = createFakeClient();
            gateway.handleJoinRoom({ code: room.code, id: PLAYER, nickname: "player" }, client);
            expect(join).toHaveBeenCalledWith(room.code);
            expect(join).toHaveBeenCalledWith(PLAYER); // used for kicked / leftRoom
        })
        it("a new player is announced to the room and gets roomJoined themselves", () => {
            const { service, gateway, serverEmits } = setup();
            const room = service.createRoom({ id: HOST, nickname: "host" });
            const { client, emits } = createFakeClient();
            gateway.handleJoinRoom({ code: room.code, id: PLAYER, nickname: "player" }, client);
            expect(eventNames(toRoom(serverEmits, room.code))).toEqual(["roomUpdated"]);
            expect(eventNames(emits)).toEqual(["roomJoined"]);
        })
        it("a reattaching player is NOT announced again (nothing changed for the others)", () => {
            const { service, gateway, serverEmits } = setup();
            const room = service.createRoom({ id: HOST, nickname: "host" });
            const { client } = createFakeClient();
            gateway.handleJoinRoom({ code: room.code, id: HOST, nickname: "host" }, client);
            expect(serverEmits).toEqual([]);
        })
        it("a failed join answers joinRejected to that client only", () => {
            const { gateway, serverEmits } = setup();
            const { client, emits } = createFakeClient();
            gateway.handleJoinRoom({ code: "nope", id: PLAYER, nickname: "player" }, client);
            expect(eventNames(emits)).toEqual(["joinRejected"]);
            expect(serverEmits).toEqual([]);
        })
        it("reattaching before the game started sends no song", () => {
            const { service, gateway } = setup();
            const room = createReadyRoom(service); // still "submitting"
            const { client, emits } = createFakeClient();
            gateway.handleJoinRoom({ code: room.code, id: PLAYER, nickname: "player" }, client);
            expect(eventNames(emits)).not.toContain("loadSong");
        })

        // --- rejoining mid-game (e.g. page refresh) ---
        it("rejoining while the song is loading: loadSong to that client only, no playSong yet", () => {
            const { gateway, room, serverEmits } = setupLoadingGame();
            const { client, emits } = createFakeClient();
            gateway.handleJoinRoom({ code: room.code, id: PLAYER, nickname: "player" }, client);
            expect(eventNames(emits)).toEqual(["roomJoined", "loadSong"]);
            expect(serverEmits).toEqual([]); // the others must NOT reload
        })
        it("rejoining while the song is playing: loadSong AND playSong to that client only", () => {
            const { gateway, room, serverEmits } = setupPlayingGame();
            const { client, emits } = createFakeClient();
            gateway.handleJoinRoom({ code: room.code, id: PLAYER, nickname: "player" }, client);
            expect(eventNames(emits)).toEqual(["roomJoined", "loadSong", "playSong"]);
            expect(serverEmits).toEqual([]);
        })
        it("the loadSong sent on rejoin has no title in it", () => {
            const { gateway, room } = setupPlayingGame();
            const { client, emits } = createFakeClient();
            gateway.handleJoinRoom({ code: room.code, id: PLAYER, nickname: "player" }, client);
            // Only loadSong: roomJoined intentionally carries mySongs (the player's OWN titles)
            const loadSong = emits.filter((e) => e.event === "loadSong");
            expect(loadSong).toHaveLength(1);
            expect(mentionsAny(loadSong, TITLES)).toBe(false);
        })
    })

    describe("startGame", () => {
        it("broadcasts the room in the playing phase", () => {
            const { service, gateway, serverEmits } = setup();
            const room = createReadyRoom(service);
            const { client } = createFakeClient();
            gateway.handleStartGame({ code: room.code, requesterId: HOST }, client);
            const update = serverEmits.find((e) => e.event === "roomUpdated");
            expect(update?.to).toBe(room.code);
            expect(update?.payload).toMatchObject({ status: "playing" });
        })
        it("tells everyone to load the first song, with exactly these fields", () => {
            const { service, gateway, serverEmits } = setup();
            const room = createReadyRoom(service);
            const { client } = createFakeClient();
            gateway.handleStartGame({ code: room.code, requesterId: HOST }, client);
            const loadSong = serverEmits.find((e) => e.event === "loadSong");
            expect(loadSong?.to).toBe(room.code);
            // toEqual (not toMatchObject): an extra field like `title` fails the test
            expect(loadSong?.payload).toEqual({ youtubeId: "ddddddddddd", startTimestamp: 30, index: 0, total: 4 });
        })
        it("does not start playback yet (clients must load first)", () => {
            const { service, gateway, serverEmits } = setup();
            const room = createReadyRoom(service);
            const { client, emits } = createFakeClient();
            gateway.handleStartGame({ code: room.code, requesterId: HOST }, client);
            expect(eventNames(serverEmits)).not.toContain("playSong");
            expect(eventNames(emits)).not.toContain("playSong");
        })
        it("never sends any song title to anyone, not even the host", () => {
            const { service, gateway, serverEmits } = setup();
            const room = createReadyRoom(service);
            const { client, emits } = createFakeClient();
            gateway.handleStartGame({ code: room.code, requesterId: HOST }, client);
            expect(mentionsAny(serverEmits, TITLES)).toBe(false);
            expect(mentionsAny(emits, TITLES)).toBe(false);
        })
    })

    describe("songLoaded", () => {
        it("does not start playback while someone is still loading", () => {
            const { gateway, room, serverEmits } = setupLoadingGame();
            gateway.handleSongLoaded({ code: room.code, id: HOST });
            expect(eventNames(serverEmits)).not.toContain("playSong");
        })
        it("starts playback for the whole room when the last player has loaded", () => {
            const { gateway, room, serverEmits } = setupLoadingGame();
            gateway.handleSongLoaded({ code: room.code, id: HOST });
            gateway.handleSongLoaded({ code: room.code, id: PLAYER });
            const plays = serverEmits.filter((e) => e.event === "playSong");
            expect(plays).toEqual([{ to: room.code, event: "playSong", payload: undefined }]);
        })
        it("a late songLoaded (e.g. after a refresh) does not send playSong to everyone again", () => {
            const { gateway, room, serverEmits } = setupPlayingGame();
            gateway.handleSongLoaded({ code: room.code, id: PLAYER });
            expect(eventNames(serverEmits)).not.toContain("playSong");
        })
    })

    describe("submitGuess", () => {
        it("a correct guess: guessResult true to the guesser, updated scores to the room", () => {
            const { gateway, room, clock, serverEmits } = setupPlayingGame();
            clock.advanceSeconds(3);
            const { client, emits } = createFakeClient();
            gateway.handleSubmitGuess({ code: room.code, id: HOST, guess: "alpha" }, client);
            expect(emits).toContainEqual({ event: "guessResult", payload: { correct: true } });
            const update = toRoom(serverEmits, room.code).find((e) => e.event === "roomUpdated");
            expect(update?.payload).toMatchObject({ players: { [HOST]: { score: 3 } } });
        })
        it("a wrong guess: guessResult false to the guesser, nothing to the room", () => {
            const { gateway, room, serverEmits } = setupPlayingGame();
            const { client, emits } = createFakeClient();
            gateway.handleSubmitGuess({ code: room.code, id: HOST, guess: "nope" }, client);
            expect(emits).toContainEqual({ event: "guessResult", payload: { correct: false } });
            expect(toRoom(serverEmits, room.code)).toEqual([]);
        })
        it("the guess text is never sent to the room (it may be the answer)", () => {
            const { gateway, room, clock, serverEmits } = setupPlayingGame();
            clock.advanceSeconds(3);
            const { client } = createFakeClient();
            gateway.handleSubmitGuess({ code: room.code, id: HOST, guess: "alpha" }, client);
            expect(mentionsAny(serverEmits, ["alpha"])).toBe(false);
        })
        it("a guess while the song is still loading is rejected (WsErrorFilter turns it into 'error')", () => {
            const { gateway, room } = setupLoadingGame();
            const { client } = createFakeClient();
            expect(() =>
                gateway.handleSubmitGuess({ code: room.code, id: HOST, guess: "alpha" }, client),
            ).toThrow(BadRequestException);
        })

        it.todo("decide: one event for a wrong guess (guessResult) or two (guessResult + incorrectGuess)?");
        it.todo("playerGuessed { nickname } to the room on a correct guess?");
    })

    describe("nextSong", () => {
        it("reveals the title of the song that just ENDED (not the next one)", () => {
            const { gateway, room, serverEmits } = setupPlayingGame();
            gateway.handleNextSong({ code: room.code, requesterId: HOST });
            expect(serverEmits).toContainEqual({ to: room.code, event: "songEnded", payload: { title: "alpha" } });
        })
        it("then broadcasts the room and tells everyone to load the next song, in that order", () => {
            const { gateway, room, serverEmits } = setupPlayingGame();
            gateway.handleNextSong({ code: room.code, requesterId: HOST });
            expect(eventNames(toRoom(serverEmits, room.code))).toEqual(["songEnded", "roomUpdated", "loadSong"]);
            const loadSong = serverEmits.find((e) => e.event === "loadSong");
            expect(loadSong?.payload).toEqual({ youtubeId: "bbbbbbbbbbb", startTimestamp: 10, index: 1, total: 4 });
        })
        it("never reveals the NEXT song's title", () => {
            const { gateway, room, serverEmits } = setupPlayingGame();
            gateway.handleNextSong({ code: room.code, requesterId: HOST });
            expect(mentionsAny(serverEmits, ["bravo", "charlie", "delta"])).toBe(false);
        })
        it("a non-host cannot skip, and nothing is revealed", () => {
            const { gateway, room, serverEmits } = setupPlayingGame();
            expect(() => gateway.handleNextSong({ code: room.code, requesterId: PLAYER })).toThrow(ForbiddenException);
            expect(serverEmits).toEqual([]);
        })
        it("after the last song: reveals it, broadcasts the finished room, loads nothing", () => {
            const { gateway, room, serverEmits } = setupPlayingGame();
            for (let i = 0; i < 3; i++) gateway.handleNextSong({ code: room.code, requesterId: HOST });
            serverEmits.length = 0; // only look at the final skip
            gateway.handleNextSong({ code: room.code, requesterId: HOST });
            expect(eventNames(serverEmits)).toEqual(["songEnded", "roomUpdated"]);
            expect(serverEmits[0].payload).toEqual({ title: "delta" });
            expect(serverEmits[1].payload).toMatchObject({ status: "finished" });
        })
    })
});

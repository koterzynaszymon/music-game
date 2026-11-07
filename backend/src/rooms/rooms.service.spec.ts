import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from "@nestjs/common";
import { RoomsService } from "./rooms.service.js";

// Test helper: a room where the host has already submitted songs per player,
// so it is in the "submitting" phase. Keeps setup out of the tests that need it.
function createSubmittingRoomWithTwoPlayers(service: RoomsService) {
    const room = service.createRoom({ id: "1234567890", nickname: "test" });
    service.joinRoom(room.code, "1234567891", "test2");
    service.setSongsPerPlayer(room.code, "1234567890", 2);
    return room;
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
    })
});
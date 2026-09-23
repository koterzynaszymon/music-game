import { ConflictException } from "@nestjs/common";
import { RoomsService } from "./rooms.service.js";

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
});
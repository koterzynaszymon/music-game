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

    it("should join a new player to a room", () => {
        const service = new RoomsService();
        let room = service.createRoom({ id: '1234567890', nickname: 'test' });
        room = service.joinRoom('1234567891', 'test2', room.code);
        expect(room.players.size).toBe(2);
        expect(room.players.get('1234567891')).toBeDefined();
        expect(room.players.get('1234567891').nickname).toBe('test2');
    })
    it("should throw an error if the nickname is already taken", () => {
        const service = new RoomsService();
        const room = service.createRoom({ id: "1234567890", nickname: "test" });
        expect(() => service.joinRoom(room.code, "1234567891", "test")).toThrow(ConflictException);
    })
});
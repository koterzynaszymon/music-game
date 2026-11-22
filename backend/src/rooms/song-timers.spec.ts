import { SongTimers } from "./song-timers.js";

// Fake timers: setTimeout no longer waits for real. Time only moves when the
// test calls vi.advanceTimersByTime(ms), so "after 10 seconds" is instant and exact.
beforeEach(() => {
    vi.useFakeTimers();
});
afterEach(() => {
    vi.useRealTimers(); // never leak fake time into other test files
});

describe("SongTimers", () => {
    it("calls back after the given time, not before", () => {
        const timers = new SongTimers();
        const onEnd = vi.fn(); // a "spy": remembers whether / how often it was called
        timers.start("room1", 10_000, onEnd);
        vi.advanceTimersByTime(9_999);
        expect(onEnd).not.toHaveBeenCalled();
        vi.advanceTimersByTime(1);
        expect(onEnd).toHaveBeenCalledTimes(1);
    })
    it("a cancelled timer never calls back", () => {
        const timers = new SongTimers();
        const onEnd = vi.fn();
        timers.start("room1", 10_000, onEnd);
        timers.cancel("room1");
        vi.advanceTimersByTime(60_000);
        expect(onEnd).not.toHaveBeenCalled();
    })
    it("starting again for the same room replaces the old timer (only one per room)", () => {
        const timers = new SongTimers();
        const first = vi.fn();
        const second = vi.fn();
        timers.start("room1", 10_000, first);
        timers.start("room1", 10_000, second);
        vi.advanceTimersByTime(10_000);
        expect(first).not.toHaveBeenCalled();
        expect(second).toHaveBeenCalledTimes(1);
    })
    it("rooms have separate timers", () => {
        const timers = new SongTimers();
        const room1 = vi.fn();
        const room2 = vi.fn();
        timers.start("room1", 10_000, room1);
        timers.start("room2", 15_000, room2);
        timers.cancel("room1");
        vi.advanceTimersByTime(15_000);
        expect(room1).not.toHaveBeenCalled();
        expect(room2).toHaveBeenCalledTimes(1);
    })
    it("cancelling a room without a timer does nothing (no error)", () => {
        const timers = new SongTimers();
        expect(() => timers.cancel("nope")).not.toThrow();
    })

    // has(): "is a timer running for this room IN THIS PROCESS?"
    // After a server restart the answer is false even mid-song: timers live in memory
    describe("has", () => {
        it("is false for a room that never had a timer", () => {
            expect(new SongTimers().has("room1")).toBe(false);
        })
        it("is true while the timer is running", () => {
            const timers = new SongTimers();
            timers.start("room1", 10_000, vi.fn());
            expect(timers.has("room1")).toBe(true);
        })
        it("is false once the timer has fired", () => {
            const timers = new SongTimers();
            timers.start("room1", 10_000, vi.fn());
            vi.advanceTimersByTime(10_000);
            expect(timers.has("room1")).toBe(false);
        })
        it("is false after cancel", () => {
            const timers = new SongTimers();
            timers.start("room1", 10_000, vi.fn());
            timers.cancel("room1");
            expect(timers.has("room1")).toBe(false);
        })
    })
});

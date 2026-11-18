import { Shuffler } from "./shuffler.js";

// The real shuffler is random, so these tests check properties that must hold
// for ANY order, instead of one specific order.
describe("Shuffler", () => {
    it("returns the same items (nothing lost, nothing duplicated)", () => {
        const shuffler = new Shuffler();
        const items = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
        const result = shuffler.shuffle(items);
        expect(result).toHaveLength(items.length);
        expect([...result].sort((a, b) => a - b)).toEqual(items);
    })
    it("does not modify the array it was given", () => {
        const shuffler = new Shuffler();
        const items = [1, 2, 3, 4, 5];
        shuffler.shuffle(items);
        expect(items).toEqual([1, 2, 3, 4, 5]);
    })
    it("returns a new array, not the same one", () => {
        const shuffler = new Shuffler();
        const items = [1, 2, 3];
        expect(shuffler.shuffle(items)).not.toBe(items);
    })
    it.each([[[]], [[42]]])("handles tiny arrays (%j)", (items: number[]) => {
        const shuffler = new Shuffler();
        expect(shuffler.shuffle(items)).toEqual(items);
    })
    it("actually changes the order sometimes", () => {
        // With 10 items there are 3.6 million orders; getting the original
        // order back 20 times in a row would mean shuffle does nothing.
        const shuffler = new Shuffler();
        const items = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
        const changedAtLeastOnce = Array.from({ length: 20 }, () => shuffler.shuffle(items))
            .some(result => result.join() !== items.join());
        expect(changedAtLeastOnce).toBe(true);
    })
});

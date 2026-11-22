import { describe, it, expect } from 'vitest';
import { KeyedLock } from './keyed-lock.js';

// A task that waits `ms` (real time, but tiny) and records when it starts and
// ends, so the tests can see whether two tasks overlapped
function recordingTask(log: string[], name: string, ms = 5) {
  return async () => {
    log.push(`${name} start`);
    await new Promise((resolve) => setTimeout(resolve, ms));
    log.push(`${name} end`);
    return name;
  };
}

describe('KeyedLock', () => {
  it('runs tasks with the SAME key one after another, in the order they came', async () => {
    const lock = new KeyedLock();
    const log: string[] = [];
    await Promise.all([
      lock.run('room1', recordingTask(log, 'a')),
      lock.run('room1', recordingTask(log, 'b')),
      lock.run('room1', recordingTask(log, 'c')),
    ]);
    expect(log).toEqual(['a start', 'a end', 'b start', 'b end', 'c start', 'c end']);
  });

  it('runs tasks with DIFFERENT keys at the same time (rooms don\'t wait for each other)', async () => {
    const lock = new KeyedLock();
    const log: string[] = [];
    await Promise.all([
      lock.run('room1', recordingTask(log, 'a')),
      lock.run('room2', recordingTask(log, 'b')),
    ]);
    expect(log.slice(0, 2)).toEqual(['a start', 'b start']);
  });

  it('returns what the task returns', async () => {
    const lock = new KeyedLock();
    expect(await lock.run('room1', async () => 42)).toBe(42);
  });

  it('a failing task passes its error on, and does not block the next task', async () => {
    const lock = new KeyedLock();
    const failing = lock.run('room1', async () => {
      throw new Error('boom');
    });
    const next = lock.run('room1', async () => 'still runs');
    await expect(failing).rejects.toThrow('boom');
    expect(await next).toBe('still runs');
  });
});

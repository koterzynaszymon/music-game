import { Injectable } from '@nestjs/common';

// One running timer per room ("reveal the answer when the time is up").
// Deliberately NOT stored in Room: Room is plain data (it may move to Redis
// later), while a timer only exists inside this one running server process.
@Injectable()
export class SongTimers {
  private timers = new Map<string, ReturnType<typeof setTimeout>>();

  start(code: string, ms: number, onEnd: () => void): void {
    this.cancel(code); // never two timers for the same room
    const timer = setTimeout(() => {
      this.timers.delete(code);
      onEnd();
    }, ms);
    this.timers.set(code, timer);
  }

  cancel(code: string): void {
    clearTimeout(this.timers.get(code)); // clearTimeout(undefined) is a no-op
    this.timers.delete(code);
  }
}

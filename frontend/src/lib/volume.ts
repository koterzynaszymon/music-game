import { createContext, useContext } from "react";

// --- Remembering the volume (localStorage) ---------------------------------

const STORAGE_KEY = "music-game-volume";
export const DEFAULT_VOLUME = 50; // 0-100, like YouTube's setVolume

// localStorage only stores strings, and its contents can be anything
export function loadVolume(): number {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    const volume = Number(saved);
    if (saved !== null && Number.isInteger(volume) && volume >= 0 && volume <= 100) {
      return volume;
    }
  } catch {
    // localStorage unavailable: fall through to the default
  }
  return DEFAULT_VOLUME;
}

export function saveVolume(volume: number): void {
  try {
    localStorage.setItem(STORAGE_KEY, String(volume));
  } catch {
    // Not saved, but the volume still works for this visit
  }
}

// --- Sharing the volume (React Context) ------------------------------------
// Context = a value any component below <VolumeProvider> can read with
// useVolume(), without passing it down as a prop through every level.

type VolumeContextValue = {
  volume: number;
  setVolume: (volume: number) => void;
};

// null = "no provider above this component" (a bug, see useVolume)
export const VolumeContext = createContext<VolumeContextValue | null>(null);

export function useVolume(): VolumeContextValue {
  const context = useContext(VolumeContext);
  if (!context) {
    throw new Error("useVolume must be used inside <VolumeProvider>");
  }
  return context;
}

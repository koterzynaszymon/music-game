import { useVolume } from "../lib/volume.ts";

function speakerFor(volume: number): string {
  if (volume === 0) return "🔇";
  if (volume < 34) return "🔈";
  if (volume < 67) return "🔉";
  return "🔊";
}

// Works anywhere inside <VolumeProvider>: it needs no props at all.
export default function VolumeControl() {
  const { volume, setVolume } = useVolume();

  return (
    <label className="flex items-center gap-2 rounded-lg px-3 py-1.5" title={`Volume: ${volume}%`}>
      {/* The emoji is decoration: the slider itself is labelled for screen readers */}
      <span aria-hidden="true" className="w-6 text-center text-xl">
        {speakerFor(volume)}
      </span>
      <input
        type="range"
        min={0}
        max={100}
        value={volume}
        // The value of a range input is always a string, even with type="range"
        onChange={(e) => setVolume(Number(e.target.value))}
        aria-label="Volume"
        className="w-24 sm:w-32 cursor-pointer accent-(--accent)"
      />
    </label>
  );
}

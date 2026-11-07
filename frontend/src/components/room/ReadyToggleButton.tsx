type ReadyToggleButtonProps = {
  isReady: boolean;
  onToggle: () => void;
};

export default function ReadyToggleButton({ isReady, onToggle }: ReadyToggleButtonProps) {
  // Full class names written out: Tailwind can't see classes built at runtime
  const colors = isReady
    ? "bg-gray-700 hover:bg-gray-600 text-gray-100"
    : "bg-green-500 hover:bg-green-400 text-green-950";

  return (
    <button
      className={`w-full rounded-xl py-3 font-semibold cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--text-h) ${colors}`}
      onClick={onToggle}
    >
      {isReady ? "Cancel ready" : "I'm ready"}
    </button>
  );
}

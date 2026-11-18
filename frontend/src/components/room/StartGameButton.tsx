type StartGameButtonProps = {
  onStart: () => void;
};

export default function StartGameButton({ onStart }: StartGameButtonProps) {
  return (
    <button
      className="w-full rounded-xl py-3 font-semibold cursor-pointer bg-purple-500 hover:bg-purple-400 text-purple-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--text-h)"
      onClick={onStart}
    >
      Start game
    </button>
  );
}

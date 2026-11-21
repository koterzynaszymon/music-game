type BackToLobbyButtonProps = {
  onReset: () => void;
};

// Host only, on the leaderboard. Same look as StartGameButton.
export default function BackToLobbyButton({ onReset }: BackToLobbyButtonProps) {
  return (
    <button
      className="w-full rounded-xl py-3 font-semibold cursor-pointer bg-purple-500 hover:bg-purple-400 text-purple-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--text-h)"
      onClick={onReset}
    >
      Back to lobby
    </button>
  );
}

type NextSongButtonProps = {
  isLastSong: boolean;
  onNext: () => void;
};

// Host only. Same look as StartGameButton.
export default function NextSongButton({ isLastSong, onNext }: NextSongButtonProps) {
  return (
    <button
      className="w-full rounded-xl py-3 font-semibold cursor-pointer bg-purple-500 hover:bg-purple-400 text-purple-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--text-h)"
      onClick={onNext}
    >
      {isLastSong ? "Finish game" : "Next song →"}
    </button>
  );
}

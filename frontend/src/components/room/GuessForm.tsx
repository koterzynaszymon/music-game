import { useState } from "react";

type GuessFormProps = {
  // False until the song actually starts (the server rejects earlier guesses)
  enabled: boolean;
  onGuess: (guess: string) => void;
};

export default function GuessForm({ enabled, onGuess }: GuessFormProps) {
  const [text, setText] = useState("");

  function handleSubmit(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault(); // stop the browser from reloading the page
    const guess = text.trim();
    if (guess === "") return;
    onGuess(guess);
    setText(""); // ready for the next try: guesses are unlimited
  }

  return (
    <form onSubmit={handleSubmit} className="flex gap-2">
      <input
        type="text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        disabled={!enabled}
        placeholder={enabled ? "Song title…" : "Waiting for the song to start…"}
        autoComplete="off"
        autoFocus
        className="w-full rounded-xl border-2 border-(--border) bg-(--code-bg) px-3 py-2 text-(--text-h) placeholder:text-(--text)/60 focus:outline-none focus:border-(--accent-border) disabled:opacity-50"
      />
      <button type="submit" disabled={!enabled || text.trim() === ""} className="btn-primary">
        Guess
      </button>
    </form>
  );
}

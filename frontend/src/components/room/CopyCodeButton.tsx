import { useState } from "react";

type CopyCodeButtonProps = {
  code: string;
};

export default function CopyCodeButton({ code }: CopyCodeButtonProps) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <button
      onClick={handleCopy}
      className="flex items-baseline gap-3 rounded-lg px-3 py-1.5 hover:bg-(--accent-bg) cursor-pointer focus-visible:outline-2 focus-visible:outline-(--text-h)"
      aria-label={`Copy room code ${code}`}
    >
      <span className="text-sm">{copied ? "Copied" : "Room code"}</span>
      <span className="text-2xl font-semibold tracking-[0.2em] text-(--text-h)">
        {code}
      </span>
    </button>
  );
}

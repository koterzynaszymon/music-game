import { useEffect, useRef } from "react";

// Passed through router navigation state: navigate("/", { state: { notice } })
export type Notice = {
  title: string;
  message: string;
};

type NoticeDialogProps = Notice & {
  onClose: () => void;
};

// A record with the tonearm lifted off: "the music stopped"
function StoppedRecord() {
  return (
    <svg
      viewBox="0 0 64 64"
      className="size-14 shrink-0"
      aria-hidden="true"
    >
      <g>
        <circle cx="28" cy="36" r="24" fill="#0e0f13" stroke="var(--border)" strokeWidth="2" />
        <circle cx="28" cy="36" r="18" fill="none" stroke="var(--border)" strokeWidth="1" />
        <circle cx="28" cy="36" r="13" fill="none" stroke="var(--border)" strokeWidth="1" />
        <circle cx="28" cy="36" r="8" fill="var(--accent)" />
        <circle cx="31" cy="33" r="2" fill="#f3e8ff" opacity="0.7" />
        <circle cx="28" cy="36" r="1.5" fill="#0e0f13" />
      </g>
      <circle cx="56" cy="8" r="4" fill="var(--text)" />
      <path d="M56 8 L60 34 L55 40" fill="none" stroke="var(--text)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// Rendering this component opens it; the parent removes it in onClose
export default function NoticeDialog({ title, message, onClose }: NoticeDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) {
      dialog.showModal();
    }
  }, []);

  function handleBackdropClick(event: React.MouseEvent<HTMLDialogElement>) {
    // Clicks on the backdrop land on the <dialog> itself, clicks inside land on its children
    if (event.target === event.currentTarget) {
      dialogRef.current?.close();
    }
  }

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      onClick={handleBackdropClick}
      aria-labelledby="notice-title"
      aria-describedby="notice-message"
      className="m-auto w-[min(26rem,calc(100%-2rem))] rounded-2xl border-2 border-(--border) bg-(--bg) p-6 text-left text-(--text) shadow-(--shadow) backdrop:bg-black/60 transition-[opacity,translate] duration-200 ease-out motion-safe:starting:open:translate-y-3 starting:open:opacity-0"
    >
      <div className="flex items-start gap-4">
        <StoppedRecord />
        <div className="min-w-0 pt-1">
          <h2 id="notice-title">{title}</h2>
          <p id="notice-message">{message}</p>
        </div>
      </div>
      <div className="mt-6 flex justify-end">
        <button
          autoFocus
          className="btn-primary"
          onClick={() => dialogRef.current?.close()}
        >
          Got it
        </button>
      </div>
    </dialog>
  );
}

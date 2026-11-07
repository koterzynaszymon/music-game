import { useEffect, useState, type SubmitEvent } from "react";
import {
  getClientNicknameFromStorage,
  getOrCreateClientId,
  saveClientNicknameToStorage,
} from "../lib/clientId.ts";
import { checkIfRoomExists, createRoom } from "../lib/rooms.ts";
import { useLocation, useNavigate } from "react-router-dom";
import NoticeDialog, { type Notice } from "../components/NoticeDialog.tsx";

type Mode = "create" | "join";

const inputClassName =
  "border-2 border-gray-300 rounded-md p-2 text-white";
const linkButtonClassName =
  "self-center rounded-lg px-3 py-1.5 text-(--accent) hover:bg-(--accent-bg) cursor-pointer focus-visible:outline-2 focus-visible:outline-(--text-h)";

export default function Homepage() {
  // Lazy initializer: read storage once on mount instead of on every render
  const [nickname, setNickname] = useState(
    () => getClientNicknameFromStorage() ?? "",
  );
  const navigate = useNavigate();
  const location = useLocation();

  const [notice, setNotice] = useState<Notice | undefined>(
    () => location.state?.notice,
  );


  useEffect(() => {
    if (location.state) {
      navigate(location.pathname, { replace: true, state: null });
    }
  }, [location.state, location.pathname, navigate]);

  const [mode, setMode] = useState<Mode>("create");
  const [roomCode, setRoomCode] = useState("");
  const [nicknameError, setNicknameError] = useState<string | null>(null);
  const [roomCodeError, setRoomCodeError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  function clearErrors() {
    setNicknameError(null);
    setRoomCodeError(null);
    setFormError(null);
  }

  function switchMode(nextMode: Mode) {
    clearErrors();
    setMode(nextMode);
  }

  function validateNickname() {
    const trimmed = nickname.trim();
    if (!trimmed) {
      setNicknameError("Enter a nickname so other players know who you are");
      return null;
    }
    saveClientNicknameToStorage(trimmed);
    return trimmed;
  }

  async function handleCreateRoom() {
    const validNickname = validateNickname();
    if (!validNickname) return;

    const clientId = getOrCreateClientId();
    try {
      const room = await createRoom(clientId, validNickname);
      console.log(room);
      navigate(`/room/${room.code}`);
    } catch (error) {
      if (error instanceof Error) {
        setFormError(error.message);
      } else {
        setFormError("An unknown error occurred");
      }
    }
  }

  async function handleJoinRoom() {
    const validNickname = validateNickname();
    const code = roomCode.trim().toLowerCase();
    if (!code) {
      setRoomCodeError("Enter the room code from your host");
    }
    if (!validNickname || !code) return;

    getOrCreateClientId();
    try {
      const exists = await checkIfRoomExists(code);
      if (!exists) {
        setRoomCodeError("No room with this code. Check it with your host.");
        return;
      }
    } catch {
      setFormError("Couldn't reach the server. Try again.");
      return;
    }
    navigate(`/room/${code}`);
  }

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    clearErrors();
    if (mode === "create") {
      await handleCreateRoom();
    } else {
      await handleJoinRoom();
    }
  }

  return (
    <section className="flex flex-col items-center h-screen">
      <h1 className="text-4xl font-bold ">Music Game</h1>
      <form
        onSubmit={handleSubmit}
        noValidate
        className="flex flex-col justify-center gap-4 w-full max-w-xs text-left"
      >
        <div className="flex flex-col gap-1">
          <label htmlFor="nickname" className="text-(--text-h)">
            Your nickname
          </label>
          <input
            id="nickname"
            type="text"
            autoComplete="nickname"
            className={inputClassName}
            onChange={(e) => setNickname(e.target.value)}
            value={nickname}
            aria-invalid={nicknameError !== null}
            aria-describedby={nicknameError ? "nickname-error" : undefined}
          />
          {nicknameError && (
            <p id="nickname-error" className="text-red-500 text-sm">
              {nicknameError}
            </p>
          )}
        </div>

        {mode === "create" ? (
          <>
            <button type="submit" className="btn-primary">
              Create a room
            </button>
            <button
              type="button"
              className={linkButtonClassName}
              onClick={() => switchMode("join")}
            >
              Have a code? Join a room
            </button>
          </>
        ) : (
          <>
            <div className="flex flex-col gap-1">
              <label htmlFor="room-code" className="text-(--text-h)">
                Room code
              </label>
              <input
                id="room-code"
                type="text"
                autoFocus
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                maxLength={13}
                className={`${inputClassName} tracking-[0.2em]`}
                onChange={(e) => setRoomCode(e.target.value)}
                value={roomCode}
                aria-invalid={roomCodeError !== null}
                aria-describedby={roomCodeError ? "room-code-error" : undefined}
              />
              {roomCodeError && (
                <p id="room-code-error" className="text-red-500 text-sm">
                  {roomCodeError}
                </p>
              )}
            </div>
            <button
              type="submit"
              className="btn-primary [--btn-face:var(--color-blue-400)] [--btn-face-hover:var(--color-blue-300)] [--btn-edge:var(--color-blue-700)] [--btn-text:var(--color-blue-950)]"
            >
              Join room
            </button>
            <button
              type="button"
              className={linkButtonClassName}
              onClick={() => switchMode("create")}
            >
              Create a room instead
            </button>
          </>
        )}

        {formError && (
          <p role="alert" className="text-red-500 text-center">
            {formError}
          </p>
        )}
      </form>
      {notice && (
        <NoticeDialog
          title={notice.title}
          message={notice.message}
          onClose={() => setNotice(undefined)}
        />
      )}
    </section>
  );
}

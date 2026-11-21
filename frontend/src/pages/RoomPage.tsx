import { useNavigate, useParams } from "react-router-dom";
import { useState, useEffect, useRef } from "react";
import { Socket } from "socket.io-client";
import io from "socket.io-client";
import { getOrCreateClientId } from "../lib/clientId.ts";
import { getClientNicknameFromStorage } from "../lib/clientId.ts";
import type { Notice } from "../components/NoticeDialog.tsx";
import type { CurrentSong, Room, Song } from "../types/room.ts";
import CopyCodeButton from "../components/room/CopyCodeButton.tsx";
import PlayerList from "../components/room/PlayerList.tsx";
import ReadyToggleButton from "../components/room/ReadyToggleButton.tsx";
import SongsPerPlayerSetting from "../components/room/SongsPerPlayerSetting.tsx";
import SongSubmissionPanel from "../components/room/SongSubmissionPanel.tsx";
import StartGameButton from "../components/room/StartGameButton.tsx";
import type { NewSong } from "../components/room/SongPicker.tsx";
import YouTubePreview from "../components/room/YouTubePreview.tsx";
import GuessForm from "../components/room/GuessForm.tsx";
import NextSongButton from "../components/room/NextSongButton.tsx";
import Leaderboard from "../components/room/Leaderboard.tsx";
import BackToLobbyButton from "../components/room/BackToLobbyButton.tsx";
import { describeYoutubeError, type YouTubePlayer } from "../lib/youtube.ts";

// Browsers block sound until the user has clicked something on the page.
// After a refresh nobody has, so instead of failing silently we ask for a click.
function tryToPlay(player: YouTubePlayer, onBlocked: () => void) {
  if (navigator.userActivation.hasBeenActive) {
    player.playVideo();
  } else {
    onBlocked();
  }
}

export default function RoomPage() {
  const { code } = useParams<{ code: string }>();
  // A ref, not state: the socket is only used inside event handlers and is
  // never rendered, so changing it shouldn't (and doesn't) trigger a re-render
  const socketRef = useRef<Socket | null>(null);
  const [room, setRoom] = useState<Room | null>(null);
  // Own songs live separately: the public room only has songsSubmitted counts
  const [mySongs, setMySongs] = useState<Song[]>([]);
  // The song the server told us to load; null until the game starts
  const [currentSong, setCurrentSong] = useState<CurrentSong | null>(null);
  // The YouTube player for the current song. A ref (like the socket): we only
  // call methods on it (playVideo, seekTo...), we never render it
  const playerRef = useRef<YouTubePlayer | null>(null);
  // Has the server said "playSong" for the current song? Needed because
  // playSong can arrive BEFORE our player is ready (when rejoining mid-song)
  const shouldPlayRef = useRef(false);
  // True when the browser blocked sound and we show a "click to hear" button
  const [needsSoundClick, setNeedsSoundClick] = useState(false);
  // Same moment as shouldPlayRef, but as state because the UI shows it
  // (the guess box is disabled until the song has started)
  const [songHasStarted, setSongHasStarted] = useState(false);
  // Answer to our last guess for the current song; null = no guess yet
  const [guessResult, setGuessResult] = useState<"correct" | "wrong" | null>(null);
  // Title of the song that just ended (from "songEnded"), shown during the next one
  const [lastSongTitle, setLastSongTitle] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const newSocket = io(import.meta.env.VITE_API_URL, {
      reconnection: true,
    });
    newSocket.on("roomJoined", (data: { room: Room; mySongs: Song[] }) => {
      setRoom(data.room);
      setMySongs(data.mySongs);
    });
    newSocket.on("songSubmitted", (data: { songs: Song[] }) => {
      setMySongs(data.songs);
    });
    newSocket.on("roomUpdated", (updatedRoom: Room) => {
      console.log("roomUpdated", updatedRoom);
      setRoom(updatedRoom);
    });
    newSocket.on("loadSong", (song: CurrentSong) => {
      shouldPlayRef.current = false; // new song: wait for playSong again
      setNeedsSoundClick(false);
      setSongHasStarted(false);
      setGuessResult(null);
      setCurrentSong(song);
    });
    newSocket.on("playSong", () => {
      shouldPlayRef.current = true;
      setSongHasStarted(true);
      const player = playerRef.current;
      // No player yet? Then handlePlayerChange will start it once it's ready
      if (player) {
        tryToPlay(player, () => setNeedsSoundClick(true));
      }
    });
    // Sent only to us, in reply to our own submitGuess
    newSocket.on("guessResult", (data: { correct: boolean }) => {
      setGuessResult(data.correct ? "correct" : "wrong");
    });
    // Sent to everyone when the host moves on: now the answer can be revealed
    newSocket.on("songEnded", (data: { title: string }) => {
      setLastSongTitle(data.title);
    });
    // The host started over. roomUpdated (sent right after) brings the fresh room;
    // here we clear everything we keep OUTSIDE the room, so nothing from the
    // previous game leaks into the next one
    newSocket.on("roomReset", () => {
      setMySongs([]);
      setCurrentSong(null);
      setLastSongTitle(null);
      setGuessResult(null);
      setSongHasStarted(false);
      setNeedsSoundClick(false);
      shouldPlayRef.current = false;
    });
    newSocket.on("error", (error: { message: string }) => {
      console.error(error);
    });
    newSocket.on("joinRejected", (error: { message: string }) => {
      const notice: Notice = {
        title: "Couldn't join the room",
        message: error.message,
      };
      navigate("/", { state: { notice } });
    });
    newSocket.on("kicked", () => {
      const notice: Notice = {
        title: "Removed from room",
        message: "The host removed you from the room. Join another room with a new code.",
      };
      navigate("/", { state: { notice } });
    });
    newSocket.on("roomClosed", () => {
      const notice: Notice = {
        title: "Room closed",
        message: "The host closed the room. Create a new one or join with another code.",
      };
      navigate("/", { state: { notice } });
    });
    newSocket.emit("joinRoom", {
      code: code,
      id: getOrCreateClientId(),
      nickname: getClientNicknameFromStorage(),
    });

    newSocket.on("gameStarted", (data) => {
      console.log("gameStarted", data); // TODO: testing only
    });
    socketRef.current = newSocket;

    return () => {
      newSocket.disconnect();
      socketRef.current = null;
      setRoom(null);
      setMySongs([]);
      setCurrentSong(null);
      setLastSongTitle(null);
    };
  }, [code, navigate]);

  const userId = getOrCreateClientId();
  const me = room?.players[userId];
  const isHost = room?.owner === userId;
  // The server ignores guesses on your own song, so don't offer a guess box for it.
  // We can tell because we know our own songs (mySongs); the title isn't needed.
  const isMySong =
    currentSong !== null &&
    mySongs.some(
      (song) =>
        song.youtubeId === currentSong.youtubeId &&
        song.startTimestamp === currentSong.startTimestamp,
    );
  const everyoneReady =room ? Object.values(room.players).every(player => player.isReady) : false;
  function handleKickPlayer(targetId: string) {
    socketRef.current?.emit("kickPlayer", {
      code: code,
      requesterId: userId,
      targetId: targetId,
    });
  }

  function handleLeaveRoom() {
    // The host can't just leave: leaving as host closes the room for everyone
    socketRef.current?.emit(isHost ? "closeRoom" : "leaveRoom", {
      code: code,
      id: userId,
    });
    navigate("/");
  }

  function handleToggleReady() {
    socketRef.current?.emit("changePlayerReadyStatus", {
      code: code,
      id: userId,
    });
  }

  function handleSubmitSongsPerPlayer(songsPerPlayer: number) {
    // server broadcasts roomUpdated to everyone (us included)
    socketRef.current?.emit("setSongsPerPlayer", {
      code: code,
      requesterId: userId,
      songsPerPlayer: songsPerPlayer,
    });
  }

  function handleStartGame() {
    socketRef.current?.emit("startGame", {
      code: code,
      requesterId: userId,
    });
  }

  // Tell the server this client is ready to play the current song.
  // When every player has sent it, the server emits "playSong" to everyone.
  function reportSongLoaded() {
    socketRef.current?.emit("songLoaded", {
      code: code,
      id: userId,
    });
  }

  // YouTubePreview calls this with the player once it's ready, and with null when it's removed
  function handlePlayerChange(player: YouTubePlayer | null) {
    playerRef.current = player;
    if (player) {
      reportSongLoaded();
      // The song already started while our player was loading (rejoin mid-song)
      if (shouldPlayRef.current) {
        tryToPlay(player, () => setNeedsSoundClick(true));
      }
    }
  }

  function handleEnableSound() {
    setNeedsSoundClick(false);
    // This runs inside a click, so the browser now allows sound
    playerRef.current?.playVideo();
  }

  function handlePlayerError(errorCode: number) {
    console.error("Couldn't play this song:", describeYoutubeError(errorCode));
    // Still report "loaded": otherwise the server would wait for us forever
    // and the song would never start for anyone else either
    reportSongLoaded();
  }

  function handleGuess(guess: string) {
    // We only send the text. The server decides if it's right AND how many
    // seconds it took: the client is never trusted with timing.
    socketRef.current?.emit("submitGuess", {
      code: code,
      id: userId,
      guess: guess,
    });
  }

  function handleNextSong() {
    // The server replies with songEnded (the answer), roomUpdated, and then
    // loadSong for the next song, or status "finished" after the last one
    socketRef.current?.emit("nextSong", {
      code: code,
      requesterId: userId,
    });
  }

  function handleResetRoom() {
    // The server answers with roomReset, then roomUpdated (status "configuring")
    socketRef.current?.emit("resetRoom", {
      code: code,
      requesterId: userId,
    });
  }

  function handleSubmitSong(song: NewSong) {
    socketRef.current?.emit("submitSong", {
      code: code,
      id: userId,
      song: song,
    });
  }

  return (
    <section className="flex flex-col w-full min-h-screen px-4 py-6 text-left">
      <header className="flex items-center justify-between gap-4 mb-8">
        <button
          onClick={handleLeaveRoom}
          className="rounded-lg px-3 py-1.5 -ml-3 hover:bg-(--social-bg) hover:text-(--text-h) cursor-pointer focus-visible:outline-2 focus-visible:outline-(--text-h)"
        >
          {isHost ? "← Close room" : "← Leave room"}
        </button>
        {code && <CopyCodeButton code={code} />}
      </header>

      <div className="grid grid-cols-1 md:grid-cols-[20rem_1fr] gap-8 items-start">
        <aside>
          {room && (
            <PlayerList room={room} userId={userId} onKick={handleKickPlayer} />
          )}

          {room?.status === "configuring" && (
            <div className="mt-4">
              {isHost ? (
                <SongsPerPlayerSetting
                  initialValue={room.songsPerPlayer}
                  onSubmit={handleSubmitSongsPerPlayer}
                />
              ) : (
                <p className="text-sm">The host is choosing how many songs each player adds.</p>
              )}
            </div>
          )}

          <div className="mt-4">
            {me && room?.status === "submitting" && (
              <ReadyToggleButton
                isReady={me.isReady}
                onToggle={handleToggleReady}
              />
            )}
          </div>

          {isHost && everyoneReady && room?.status === "submitting" && (
            <div className="mt-4">
              <StartGameButton onStart={handleStartGame} />
            </div>
          )}

          {isHost && room?.status === "playing" && currentSong && (
            <div className="mt-4">
              <NextSongButton
                isLastSong={currentSong.index === currentSong.total - 1}
                onNext={handleNextSong}
              />
            </div>
          )}
        </aside>

        {/* Game area: song submission now, the player/guess UI once the round starts */}
        {me && room?.status === "submitting" ? (
          <main>
            <SongSubmissionPanel
              songs={mySongs}
              songsPerPlayer={room.songsPerPlayer}
              onSubmitSong={handleSubmitSong}
            />
          </main>
        ) : room?.status === "playing" && currentSong ? (
          <main className="flex flex-col gap-4">
            <h2>Song {currentSong.index + 1} of {currentSong.total}</h2>
            {lastSongTitle && (
              <p className="text-sm">
                Last song was: <span className="font-semibold text-(--text-h)">{lastSongTitle}</span>
              </p>
            )}
            {isMySong ? (
              <p>This is your song! Sit back and watch the others guess.</p>
            ) : guessResult === "correct" ? (
              <p className="text-green-400 font-semibold">✅ You got it!</p>
            ) : (
              <>
                <GuessForm enabled={songHasStarted} onGuess={handleGuess} />
                {guessResult === "wrong" && (
                  <p className="text-sm text-red-400">Not quite, try again.</p>
                )}
              </>
            )}
            {needsSoundClick && (
              <button
                onClick={handleEnableSound}
                className="rounded-xl px-4 py-3 font-semibold cursor-pointer bg-purple-500 hover:bg-purple-400 text-purple-950"
              >
                🔊 Click to hear the song
              </button>
            )}
            {/* Moved off-screen rather than display:none: some browsers won't
                start a hidden iframe player. Players hear it, nobody sees it. */}
            <div aria-hidden="true" className="fixed left-[-9999px] top-0 w-80">
              <YouTubePreview
                key={currentSong.index}
                videoId={currentSong.youtubeId}
                start={currentSong.startTimestamp}
                onPlayerChange={handlePlayerChange}
                onError={handlePlayerError}
              />
            </div>
          </main>
        ) : room?.status === "finished" ? (
          <main className="flex flex-col gap-4">
            {lastSongTitle && (
              <p className="text-sm">
                Last song was: <span className="font-semibold text-(--text-h)">{lastSongTitle}</span>
              </p>
            )}
            <Leaderboard players={Object.values(room.players)} userId={userId} />
            {isHost ? (
              <BackToLobbyButton onReset={handleResetRoom} />
            ) : (
              <p className="text-sm">Waiting for the host to start a new game…</p>
            )}
          </main>
        ) : (
          <main className="flex items-center justify-center min-h-64 rounded-2xl border-2 border-dashed border-(--border) p-8 text-center">
            <p>The game starts when everyone is ready.</p>
          </main>
        )}
      </div>
    </section>
  );
}

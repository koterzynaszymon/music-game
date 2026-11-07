type ReadyStatusProps = {
  isReady: boolean;
};

export default function ReadyStatus({ isReady }: ReadyStatusProps) {
  return isReady ? (
    <span className="flex items-center gap-1.5 text-green-400 font-medium">
      <span aria-hidden="true">✓</span> Ready
    </span>
  ) : (
    <span className="flex items-center gap-1.5 text-(--text)">
      <span aria-hidden="true">○</span> Waiting
    </span>
  );
}

import { useId } from "react";

export function DoorConnectPanel({
  error,
  onRetry,
  onUseLocal,
}: {
  error: string | null;
  onRetry: () => void;
  onUseLocal: () => void;
}) {
  const titleId = useId();
  return (
    <section className="door-connect" aria-labelledby={titleId}>
      <h1 id={titleId}>Connect to the door</h1>
      <p>Your server supplies your identity automatically. Retry to reconnect using your registered session.</p>
      {error ? <p className="chat-error" role="alert">{error}</p> : null}
      <div className="door-connect__actions">
        <button type="button" onClick={onRetry}>Retry connection</button>
        <button type="button" className="door-connect__secondary" onClick={onUseLocal}>
          Use local workbench
        </button>
      </div>
      <p className="sr-only" aria-live="polite" aria-atomic="true">
        Connection unavailable. Retry to resolve your identity from the server.
      </p>
    </section>
  );
}

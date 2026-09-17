import { useId, useState, type FormEvent } from "react";
import type { DoorIdentity } from "../grpc/door";
import { defaultDoorUrl, rememberDoorUrl } from "../chat/door-config";

export interface DoorConnectRequest {
  url: string;
  identity: DoorIdentity;
}

export function DoorConnectPanel({
  connecting,
  error,
  onConnect,
  onUseLocal,
}: {
  connecting: boolean;
  error: string | null;
  onConnect: (request: DoorConnectRequest) => void;
  onUseLocal: () => void;
}) {
  const [url, setUrl] = useState(defaultDoorUrl);
  const [kind, setKind] = useState<DoorIdentity["kind"]>("oia1");
  const [credential, setCredential] = useState("");
  const urlId = useId();
  const kindId = useId();
  const credentialId = useId();

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (connecting) return;
    const trimmedUrl = url.trim();
    rememberDoorUrl(trimmedUrl);
    onConnect({
      url: trimmedUrl,
      identity:
        kind === "oia1"
          ? { kind, assertion: credential }
          : { kind, sealedId: credential },
    });
  };

  return (
    <section className="door-connect" aria-labelledby={`${urlId}-title`}>
      <h1 id={`${urlId}-title`}>Connect to the door</h1>
      <p>
        One TLS door, one credential. Paste the base64 OIA1 assertion issued to you
        by the Oracle, or the SID1 sealed id for a locally registered session.
      </p>
      <form onSubmit={handleSubmit}>
        <label htmlFor={urlId}>Door</label>
        <input
          id={urlId}
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          placeholder="https://10.0.0.3:8090"
          autoComplete="url"
          inputMode="url"
          disabled={connecting}
          required
        />
        <label htmlFor={kindId}>Credential</label>
        <select
          id={kindId}
          value={kind}
          onChange={(event) => setKind(event.target.value as DoorIdentity["kind"])}
          disabled={connecting}
        >
          <option value="oia1">OIA1 — Oracle identity assertion</option>
          <option value="sid1">SID1 — sealed session id</option>
        </select>
        <label htmlFor={credentialId}>{kind === "oia1" ? "Assertion (base64)" : "Sealed id (base64)"}</label>
        <textarea
          id={credentialId}
          value={credential}
          onChange={(event) => setCredential(event.target.value)}
          rows={4}
          spellCheck={false}
          autoComplete="off"
          disabled={connecting}
          required
        />
        {error ? (
          <p className="chat-error" role="alert">
            {error}
          </p>
        ) : null}
        <div className="door-connect__actions">
          <button type="submit" disabled={connecting || !url.trim() || !credential.trim()}>
            {connecting ? "Connecting" : "Connect"}
          </button>
          <button type="button" className="door-connect__secondary" onClick={onUseLocal} disabled={connecting}>
            Use local workbench
          </button>
        </div>
        <p className="sr-only" aria-live="polite" aria-atomic="true">
          {connecting ? "Connecting to the door." : error ?? "Ready to connect."}
        </p>
      </form>
    </section>
  );
}

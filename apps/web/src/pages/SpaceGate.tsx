import { useState } from 'react';
import { apiMessage } from '../services/api';
import { switchSpace, type SessionPayload } from '../services/auth';

/** Shows the space chooser when a member belongs to more than one space. */
export function SpaceGate({
  session,
  onSwitch,
}: {
  session: SessionPayload;
  onSwitch: (session: SessionPayload) => void;
}) {
  const [spaceId, setSpaceId] = useState(session.spaces[0]?.id ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function enter() {
    if (!spaceId || busy) return;
    setBusy(true);
    setError('');
    try {
      onSwitch(await switchSpace(spaceId));
    } catch (failure) {
      setError(apiMessage(failure));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="grid min-h-screen place-items-center bg-canvas px-4">
      <section className="w-full max-w-[420px] bg-surface-warm p-[clamp(24px,5vw,40px)]">
        <h1 className="font-display text-3xl font-normal leading-tight">选择空间</h1>
        <p className="mt-2 text-sm text-muted">
          {session.user.name}，你属于多个空间。选择本次要查看的经营空间。
        </p>
        <label className="dc-field mt-6">
          空间
          <select
            className="dc-control"
            value={spaceId}
            onChange={(event) => setSpaceId(event.target.value)}
          >
            {session.spaces.map((space) => (
              <option key={space.id} value={space.id}>
                {space.name}
              </option>
            ))}
          </select>
        </label>
        <button className="dc-btn dc-btn-primary mt-4" disabled={busy} onClick={enter}>
          {busy ? '进入中…' : '进入空间'}
        </button>
        {error && (
          <p role="alert" className="mt-3 text-sm text-down">
            {error}
          </p>
        )}
      </section>
    </main>
  );
}

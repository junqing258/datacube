import { useState, type FormEvent } from 'react';
import { apiMessage } from '../services/api';
import { login, type SessionPayload } from '../services/auth';

export function LoginPage({ onLogin }: { onLogin: (session: SessionPayload) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const fields = new FormData(event.currentTarget);
    const email = String(fields.get('email') ?? '').trim();
    const password = String(fields.get('password') ?? '');
    setBusy(true);
    setError('');
    try {
      onLogin(await login(email, password));
    } catch (failure) {
      setError(apiMessage(failure));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="grid min-h-screen place-items-center bg-canvas px-4">
      <section className="w-full max-w-[400px] bg-surface-warm p-[clamp(24px,5vw,40px)]">
        <span className="dc-logo" aria-hidden="true">
          <span className="dc-logo-mark" />
        </span>
        <h1 className="mt-6 font-display text-3xl font-normal leading-tight">登录 DataCube</h1>
        <p className="mt-2 text-sm text-muted">使用平台账号查看经营看板与真实业务数据。</p>
        <form className="mt-6 grid gap-4" onSubmit={submit}>
          <label className="dc-field">
            邮箱
            <input
              className="dc-control"
              type="email"
              name="email"
              autoComplete="username"
              required
              placeholder="运营账号邮箱"
            />
          </label>
          <label className="dc-field">
            密码
            <input
              className="dc-control"
              type="password"
              name="password"
              autoComplete="current-password"
              required
            />
          </label>
          <button className="dc-btn dc-btn-primary justify-self-start" disabled={busy}>
            {busy ? '登录中…' : '登录'}
          </button>
          {error && (
            <p role="alert" className="text-sm text-down">
              {error}
            </p>
          )}
        </form>
      </section>
    </main>
  );
}

import { useQuery } from '@tanstack/react-query';
import { KeyRound, LogOut } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Dialog } from '@/components/PageParts';
import { apiMessage } from '@/services/api';
import {
  changePassword,
  getProfile,
  roleLabels,
  type SessionPayload,
  type SessionSpace,
} from '@/services/auth';

const joinedOn = new Intl.DateTimeFormat('zh-CN', {
  dateStyle: 'medium',
  timeZone: 'Asia/Shanghai',
});
const seenAt = new Intl.DateTimeFormat('zh-CN', {
  dateStyle: 'short',
  timeStyle: 'short',
  timeZone: 'Asia/Shanghai',
});

function roleLabel(role: string | null | undefined) {
  if (!role) return '—';
  return roleLabels[role] ?? role;
}

function ProfileRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1">
      <span className="shrink-0 text-xs text-muted">{label}</span>
      <span className="min-w-0 truncate text-right text-xs text-body">{value}</span>
    </div>
  );
}

function PasswordForm({ onClose }: { onClose: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const fields = new FormData(event.currentTarget);
    const current = String(fields.get('currentPassword') ?? '');
    const next = String(fields.get('newPassword') ?? '');
    const confirm = String(fields.get('confirmPassword') ?? '');
    setError('');
    if (next !== confirm) {
      setError('两次输入的新密码不一致。');
      return;
    }
    setBusy(true);
    try {
      await changePassword(current, next);
      setDone(true);
    } catch (failure) {
      setError(apiMessage(failure));
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <>
        <p className="mt-4 text-sm leading-relaxed text-body">
          密码已更新，其他设备上的登录会话已退出，当前登录保持有效。
        </p>
        <div className="mt-6 flex justify-end">
          <button type="button" className="dc-btn dc-btn-primary" onClick={onClose}>
            完成
          </button>
        </div>
      </>
    );
  }

  return (
    <form className="mt-4 grid gap-4" onSubmit={submit}>
      <label className="dc-field">
        当前密码
        <input
          className="dc-control"
          type="password"
          name="currentPassword"
          autoComplete="current-password"
          required
        />
      </label>
      <label className="dc-field">
        新密码
        <input
          className="dc-control"
          type="password"
          name="newPassword"
          autoComplete="new-password"
          minLength={8}
          maxLength={128}
          required
        />
      </label>
      <label className="dc-field">
        确认新密码
        <input
          className="dc-control"
          type="password"
          name="confirmPassword"
          autoComplete="new-password"
          minLength={8}
          maxLength={128}
          required
        />
      </label>
      <p className="text-xs text-muted">新密码 8 至 128 个字符，修改后其他设备需重新登录。</p>
      {error && (
        <p role="alert" className="text-sm text-down">
          {error}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <button type="button" className="dc-btn" onClick={onClose}>
          取消
        </button>
        <button className="dc-btn dc-btn-primary" disabled={busy}>
          {busy ? '保存中…' : '保存'}
        </button>
      </div>
    </form>
  );
}

function ProfilePanel({
  session,
  onChangePassword,
  onLogout,
}: {
  session: SessionPayload;
  onChangePassword: () => void;
  onLogout: () => void;
}) {
  const profile = useQuery({
    queryKey: ['profile'],
    queryFn: getProfile,
    retry: false,
  });
  const panel = useRef<HTMLDivElement>(null);
  const space: SessionSpace | null = profile.data?.space ?? session.space;
  const role = space?.role || session.user.role;

  useEffect(() => {
    panel.current?.focus();
  }, []);

  return (
    <div
      ref={panel}
      tabIndex={-1}
      role="dialog"
      aria-label="用户资料"
      className="absolute bottom-[calc(100%+10px)] left-0 z-30 max-h-[calc(100dvh-6rem)] w-[248px] max-w-[calc(100vw-2rem)] overflow-y-auto rounded-card border border-hairline bg-canvas p-4 text-ink shadow-[0_18px_40px_rgba(33,30,28,0.16)] outline-none"
    >
      <div className="flex items-center gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-primary-soft text-base font-semibold text-primary">
          {session.user.name.slice(0, 1)}
        </span>
        <div className="min-w-0">
          <strong className="block truncate text-sm font-[650] leading-tight">
            {profile.data?.user.name ?? session.user.name}
          </strong>
          <span className="mt-0.5 block truncate text-xs text-muted">
            {profile.data?.user.email ?? session.user.email}
          </span>
        </div>
      </div>
      <div className="mt-3 border-t border-hairline-soft pt-2">
        {profile.isLoading && <p className="py-2 text-xs text-muted">正在读取用户资料…</p>}
        {profile.isError && (
          <p role="alert" className="py-2 text-xs text-down">
            {apiMessage(profile.error)}
          </p>
        )}
        {profile.data && (
          <>
            <ProfileRow label="当前空间" value={space?.name ?? '未选择空间'} />
            <ProfileRow label="空间角色" value={roleLabel(role)} />
            <ProfileRow
              label="加入平台"
              value={joinedOn.format(new Date(profile.data.user.joinedAt))}
            />
            <ProfileRow
              label="最近活跃"
              value={seenAt.format(new Date(profile.data.session.lastSeenAt))}
            />
          </>
        )}
      </div>
      <div className="mt-3 grid gap-0.5 border-t border-hairline-soft pt-2">
        <button
          type="button"
          className="flex min-h-9 items-center gap-2 rounded px-2 text-left text-sm text-body transition-colors hover:bg-surface-soft"
          onClick={onChangePassword}
        >
          <KeyRound className="text-muted" size={15} aria-hidden="true" />
          修改密码
        </button>
        <button
          type="button"
          className="flex min-h-9 items-center gap-2 rounded px-2 text-left text-sm text-body transition-colors hover:bg-surface-soft"
          onClick={onLogout}
        >
          <LogOut className="text-muted" size={15} aria-hidden="true" />
          退出登录
        </button>
      </div>
    </div>
  );
}

export function UserMenu({ session, onLogout }: { session: SessionPayload; onLogout: () => void }) {
  const [open, setOpen] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const wrapper = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const space = session.space!;
  const role = space.role || session.user.role;

  useEffect(() => {
    if (!open) return;
    function close() {
      setOpen(false);
    }
    function onPointerDown(event: PointerEvent) {
      if (!wrapper.current?.contains(event.target as Node)) close();
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;
      close();
      trigger.current?.focus();
    }
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  function startPasswordChange() {
    setOpen(false);
    setPasswordOpen(true);
  }

  function closePasswordDialog() {
    setPasswordOpen(false);
    // Refocus after the modal dialog has closed and released the focus trap.
    window.setTimeout(() => trigger.current?.focus(), 0);
  }

  return (
    <div
      ref={wrapper}
      className="relative mt-auto hidden border-t border-hairline-soft px-2 pt-3.5 min-[701px]:block"
    >
      <div className="flex items-center gap-1">
        <button
          ref={trigger}
          type="button"
          aria-haspopup="dialog"
          aria-expanded={open}
          className="flex min-w-0 flex-1 items-center gap-2.5 rounded-card px-1 py-1 text-left transition-colors hover:bg-surface-soft"
          onClick={() => setOpen((value) => !value)}
        >
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-primary-soft text-sm font-semibold text-primary">
            {session.user.name.slice(0, 1)}
          </span>
          <span className="min-w-0">
            <strong className="block truncate text-sm font-[650] leading-tight">
              {session.user.name}
            </strong>
            <small className="block text-xs leading-tight text-muted">
              {roleLabels[role] ?? role}
            </small>
          </span>
        </button>
        <button
          type="button"
          className="grid size-8 shrink-0 place-items-center rounded-full text-muted hover:bg-surface-soft hover:text-ink"
          aria-label="退出登录"
          title="退出登录"
          onClick={onLogout}
        >
          <LogOut size={15} aria-hidden="true" />
        </button>
      </div>
      {open && (
        <ProfilePanel
          session={session}
          onChangePassword={startPasswordChange}
          onLogout={onLogout}
        />
      )}
      {passwordOpen && (
        <Dialog title="修改密码" onClose={closePasswordDialog}>
          <PasswordForm onClose={closePasswordDialog} />
        </Dialog>
      )}
    </div>
  );
}

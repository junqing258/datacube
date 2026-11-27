import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from './components/AppShell';
import { AiAccessPage, type DemoKey } from './pages/AiAccessPage';
import { ChartsPage } from './pages/ChartsPage';
import { DashboardsPage } from './pages/DashboardsPage';
import { DataSourcesPage } from './pages/DataSourcesPage';
import { HomePage } from './pages/HomePage';
import { KnowledgePage } from './pages/KnowledgePage';
import { LoginPage } from './pages/LoginPage';
import { SpaceGate } from './pages/SpaceGate';
import { apiFailure } from './services/api';
import { getSession, refreshSession, type SessionPayload } from './services/auth';
import ChartEditorPage from './pages/ChartEditorPage';

export function App() {
  const queryClient = useQueryClient();
  const [keys, setKeys] = useState<DemoKey[]>([]);
  // Local override keeps login/logout immediate even if the cached query is removed.
  const [override, setOverride] = useState<SessionPayload | null>();
  const session = useQuery({
    queryKey: ['session'],
    queryFn: getSession,
    retry: false,
  });
  const active = override === undefined ? session.data : override;

  function acceptSession(payload: SessionPayload | null) {
    setOverride(payload);
    if (payload) queryClient.setQueryData(['session'], payload);
    else queryClient.removeQueries({ queryKey: ['session'] });
    void queryClient.invalidateQueries({ queryKey: ['dashboards'] });
    void queryClient.invalidateQueries({ queryKey: ['charts'] });
    void queryClient.invalidateQueries({ queryKey: ['datasets'] });
  }

  const signedInUserId = active?.user.id;
  useEffect(() => {
    if (!signedInUserId) return;
    // Rotate the session token periodically so an active browser stays signed in.
    const timer = window.setInterval(() => {
      void refreshSession()
        .then((next) => acceptSession(next))
        .catch((error: unknown) => {
          if (apiFailure(error).status === 401) acceptSession(null);
        });
    }, 30 * 60_000);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signedInUserId]);

  if (session.isLoading && override === undefined) {
    return (
      <main className="grid min-h-screen place-items-center bg-canvas">
        <p role="status" className="text-muted">
          正在加载会话…
        </p>
      </main>
    );
  }

  if (!active) {
    const failure = apiFailure(session.error);
    if (!override && failure.status !== 401 && failure.status !== undefined) {
      return (
        <main className="grid min-h-screen place-items-center bg-canvas px-4">
          <section className="dc-page-card max-w-[420px]">
            <h1>无法读取会话</h1>
            <p className="mt-2 text-muted">{failure.message}</p>
            <button className="dc-btn mt-4" onClick={() => void session.refetch()}>
              重试
            </button>
          </section>
        </main>
      );
    }
    return <LoginPage onLogin={acceptSession} />;
  }

  if (!active.space) {
    return <SpaceGate session={active} onSwitch={acceptSession} />;
  }

  return (
    <HashRouter>
      <AppShell session={active} onSession={acceptSession} onLogout={() => acceptSession(null)}>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/dashboards" element={<DashboardsPage />} />
          <Route path="/charts" element={<ChartsPage />} />
          <Route path="/charts/new" element={<ChartEditorPage />} />
          <Route path="/charts/:chartId/edit" element={<ChartEditorPage />} />
          <Route path="/knowledge/:topic?/:version?" element={<KnowledgePage />} />
          <Route path="/data-sources" element={<DataSourcesPage />} />
          <Route path="/ai-access" element={<AiAccessPage keys={keys} setKeys={setKeys} />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AppShell>
    </HashRouter>
  );
}

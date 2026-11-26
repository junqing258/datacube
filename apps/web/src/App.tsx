import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from './components/AppShell';
import { dashboards, type Board } from './data/demo';
import { AiAccessPage, type DemoKey } from './pages/AiAccessPage';
import { ChartsPage } from './pages/ChartsPage';
import { DashboardsPage } from './pages/DashboardsPage';
import { DataSourcesPage } from './pages/DataSourcesPage';
import { HomePage } from './pages/HomePage';
import { KnowledgePage } from './pages/KnowledgePage';

import { normalizeScriptDraft, runChartScript } from './data/chartScript';
import { type CustomChart } from './data/customCharts';

const ChartEditorPage = lazy(() => import('./pages/ChartEditorPage'));

const storageKey = 'datacube.dashboards.v1';

interface DashboardState {
  boards: Board[];
  customCharts: CustomChart[];
}

function loadDashboards(): DashboardState {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) ?? 'null');
    if (Array.isArray(saved?.boards) && Array.isArray(saved?.customCharts)) {
      const state: DashboardState = saved;
      return {
        ...state,
        customCharts: state.customCharts.map((chart) => {
          if (!chart.script) return chart;
          const { script } = chart;
          return {
            ...chart,
            script: {
              ...script,
              draft: normalizeScriptDraft(script.draft),
              status: script.status === 'running' ? 'waiting' : script.status,
            },
          };
        }),
      };
    }
  } catch {
    // Start with the demo boards if browser storage is unavailable.
  }
  return { boards: dashboards, customCharts: [] };
}

export function App() {
  const [state, setState] = useState(loadDashboards);
  const { boards, customCharts } = state;
  const [storageError, setStorageError] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(state));
      setStorageError(false);
    } catch {
      setStorageError(true);
    }
  }, [state]);
  const activeRuns = useRef(new Map<string, NonNullable<CustomChart['script']>>());

  const refreshChart = useCallback(async (chart: CustomChart) => {
    const script = chart.script;
    const active = activeRuns.current.get(chart.id);
    if (!script || (active?.version === script.version && active.draft === script.draft)) return;
    activeRuns.current.set(chart.id, script);

    function updateVersion(update: (chart: CustomChart) => CustomChart) {
      setState((current) => ({
        ...current,
        customCharts: current.customCharts.map((item) =>
          item.id === chart.id &&
          item.script?.version === script?.version &&
          item.script?.draft === script?.draft
            ? update(item)
            : item,
        ),
      }));
    }

    updateVersion((item) => ({
      ...item,
      script: { ...script, status: 'running', error: undefined },
    }));
    const interval = script.draft.intervalMinutes * 60_000;
    function nextRefresh(now: number) {
      if (!interval) return undefined;
      const due = script?.nextRefresh;
      if (due === undefined) return now + interval;
      return due > now ? due : due + (Math.floor((now - due) / interval) + 1) * interval;
    }
    try {
      const result = await runChartScript(script.draft, chart.kind, 'refresh');
      const now = Date.now();
      updateVersion((item) => ({
        ...item,
        points: result.points,
        script: {
          ...script,
          status: 'success',
          lastSuccess: now,
          coverage: undefined,
          error: undefined,
          nextRefresh: nextRefresh(now),
        },
      }));
    } catch (error) {
      updateVersion((item) => ({
        ...item,
        script: {
          ...script,
          status: 'failed',
          error: error instanceof Error ? error.message : '刷新失败。',
          nextRefresh: nextRefresh(Date.now()),
        },
      }));
    } finally {
      if (activeRuns.current.get(chart.id) === script) activeRuns.current.delete(chart.id);
    }
  }, []);

  useEffect(() => {
    function refreshDueCharts() {
      const now = Date.now();
      for (const chart of customCharts) {
        const script = chart.script;
        if (
          script &&
          (script.status === 'waiting' ||
            (script.status !== 'running' &&
              script.nextRefresh !== undefined &&
              script.nextRefresh <= now))
        ) {
          void refreshChart(chart);
        }
      }
    }
    if (
      !customCharts.some(
        ({ script }) => script?.status === 'waiting' || script?.nextRefresh !== undefined,
      )
    )
      return;
    refreshDueCharts();
    const timer = window.setInterval(refreshDueCharts, 1000);
    return () => window.clearInterval(timer);
  }, [customCharts, refreshChart]);

  const [keys, setKeys] = useState<DemoKey[]>([]);

  function updateBoard(id: string, changes: Partial<Board>) {
    setState((current) => ({
      ...current,
      boards: current.boards.map((board) => (board.id === id ? { ...board, ...changes } : board)),
    }));
  }

  function createChart(chart: CustomChart) {
    setState((current) => ({ ...current, customCharts: [...current.customCharts, chart] }));
  }

  function saveChart(chart: CustomChart) {
    setState((current) => ({
      ...current,
      customCharts: current.customCharts.map((item) => (item.id === chart.id ? chart : item)),
    }));
  }

  function deleteChart(id: string) {
    setState((current) => ({
      customCharts: current.customCharts.filter((chart) => chart.id !== id),
      boards: current.boards.map((board) =>
        board.cards.includes(id)
          ? {
              ...board,
              cards: board.cards.filter((card) => card !== id),
              version: board.version + 1,
            }
          : board,
      ),
    }));
  }

  return (
    <HashRouter>
      <AppShell>
        {storageError && <p role="alert">浏览器无法保存看板和图表，刷新后本次修改可能丢失。</p>}
        <Routes>
          <Route path="/" element={<HomePage boards={boards} updateBoard={updateBoard} />} />
          <Route
            path="/dashboards"
            element={
              <DashboardsPage
                boards={boards}
                updateBoard={updateBoard}
                addBoard={(board) =>
                  setState((current) => ({ ...current, boards: [...current.boards, board] }))
                }
                customCharts={customCharts}
                refreshChart={refreshChart}
              />
            }
          />
          <Route
            path="/charts"
            element={
              <ChartsPage
                charts={customCharts}
                boards={boards}
                deleteChart={deleteChart}
                refreshChart={refreshChart}
              />
            }
          />
          <Route
            path="/charts/new"
            element={
              <Suspense fallback={<p role="status">正在加载图表编辑器…</p>}>
                <ChartEditorPage charts={customCharts} onSave={createChart} />
              </Suspense>
            }
          />
          <Route
            path="/charts/:chartId/edit"
            element={
              <Suspense fallback={<p role="status">正在加载图表编辑器…</p>}>
                <ChartEditorPage charts={customCharts} onSave={saveChart} />
              </Suspense>
            }
          />
          <Route path="/knowledge/:topic?/:version?" element={<KnowledgePage />} />
          <Route path="/data-sources" element={<DataSourcesPage />} />
          <Route path="/ai-access" element={<AiAccessPage keys={keys} setKeys={setKeys} />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AppShell>
    </HashRouter>
  );
}

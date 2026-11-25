import { useEffect, useState } from 'react';
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from './components/AppShell';
import { dashboards, type Board } from './data/demo';
import { AiAccessPage, type DemoKey } from './pages/AiAccessPage';
import { DashboardsPage } from './pages/DashboardsPage';
import { DataSourcesPage } from './pages/DataSourcesPage';
import { HomePage } from './pages/HomePage';
import { KnowledgePage } from './pages/KnowledgePage';

import { type CustomChart } from './data/customCharts';

const storageKey = 'datacube.dashboards.v1';

interface DashboardState {
  boards: Board[];
  customCharts: CustomChart[];
}

function loadDashboards(): DashboardState {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) ?? 'null');
    if (Array.isArray(saved?.boards) && Array.isArray(saved?.customCharts)) return saved;
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
  const [keys, setKeys] = useState<DemoKey[]>([]);

  function updateBoard(id: string, changes: Partial<Board>) {
    setState((current) => ({
      ...current,
      boards: current.boards.map((board) => (board.id === id ? { ...board, ...changes } : board)),
    }));
  }

  function createChart(boardId: string, chart: CustomChart) {
    setState((current) => {
      if (!current.boards.some((board) => board.id === boardId && !board.archived)) return current;
      return {
        customCharts: [...current.customCharts, chart],
        boards: current.boards.map((board) =>
          board.id === boardId
            ? { ...board, cards: [...board.cards, chart.id], version: board.version + 1 }
            : board,
        ),
      };
    });
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
                createChart={createChart}
              />
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

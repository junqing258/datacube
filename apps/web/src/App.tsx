import { useState } from 'react';
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from './components/AppShell';
import { dashboards, type Board } from './data/demo';
import { AiAccessPage, type DemoKey } from './pages/AiAccessPage';
import { DashboardsPage } from './pages/DashboardsPage';
import { DataSourcesPage } from './pages/DataSourcesPage';
import { HomePage } from './pages/HomePage';
import { KnowledgePage } from './pages/KnowledgePage';

export function App() {
  const [boards, setBoards] = useState(dashboards);
  const [keys, setKeys] = useState<DemoKey[]>([]);

  function updateBoard(id: string, changes: Partial<Board>) {
    setBoards((current) =>
      current.map((board) => (board.id === id ? { ...board, ...changes } : board)),
    );
  }

  return (
    <HashRouter>
      <AppShell>
        <Routes>
          <Route path="/" element={<HomePage boards={boards} updateBoard={updateBoard} />} />
          <Route
            path="/dashboards"
            element={
              <DashboardsPage
                boards={boards}
                updateBoard={updateBoard}
                addBoard={(board) => setBoards((current) => [...current, board])}
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

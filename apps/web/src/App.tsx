import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from './components/AppShell';
import { HomePage } from './pages/HomePage';
import { PlaceholderPage } from './pages/PlaceholderPage';

// 主导航：首页、看板、业务知识、数据接入、AI接入
export function App() {
  return (
    <BrowserRouter>
      <AppShell>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route
            path="/dashboards"
            element={<PlaceholderPage title="团队看板" description="管理团队共享的看板与图表。" />}
          />
          <Route
            path="/knowledge"
            element={
              <PlaceholderPage title="业务知识" description="查阅指标口径、使用规则和数据来源。" />
            }
          />
          <Route
            path="/data-sources"
            element={<PlaceholderPage title="数据接入" description="管理数据库和业务 API 连接。" />}
          />
          <Route
            path="/ai-access"
            element={
              <PlaceholderPage
                title="AI接入"
                description="在外部 AI 工具中分析数据，结果保存到 DataCube。"
              />
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AppShell>
    </BrowserRouter>
  );
}

import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AppShell } from '@/components/layout/AppShell';
import { useBackendSync } from '@/logic/use-backend-sync';

const HomePage = lazy(() => import('@/pages/HomePage'));
const StockPage = lazy(() => import('@/pages/StockPage'));
const OperatorsPage = lazy(() => import('@/pages/OperatorsPage'));
const WeaponsPage = lazy(() => import('@/pages/WeaponsPage'));
const PlannerPage = lazy(() => import('@/pages/PlannerPage'));
const SettingsPage = lazy(() => import('@/pages/SettingsPage'));
const RecognizePage = lazy(() => import('@/pages/RecognizePage'));
const FarmPage = lazy(() => import('@/pages/FarmPage'));

function App() {
  // Always-on cross-browser sync. It falls back to localStorage while the
  // backend is unavailable and resumes on the next successful write.
  useBackendSync();

  return (
    <BrowserRouter>
      <Suspense fallback={<div className="font-mono text-xs text-signal">LOADING...</div>}>
        <Routes>
          <Route element={<AppShell />}>
            <Route index element={<HomePage />} />
            <Route path="/planner" element={<PlannerPage />} />
            <Route path="/stock" element={<StockPage />} />
            <Route path="/operators" element={<OperatorsPage />} />
            <Route path="/weapons" element={<WeaponsPage />} />
            <Route path="/farm" element={<FarmPage />} />
            <Route path="/recognize" element={<RecognizePage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Route>
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}

export default App;

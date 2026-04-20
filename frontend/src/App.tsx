import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AppShell } from '@/components/layout/AppShell';
import HomePage from '@/pages/HomePage';
import StockPage from '@/pages/StockPage';
import OperatorsPage from '@/pages/OperatorsPage';
import WeaponsPage from '@/pages/WeaponsPage';
import PlannerPage from '@/pages/PlannerPage';
import SettingsPage from '@/pages/SettingsPage';
import RecognizePage from '@/pages/RecognizePage';
import FarmPage from '@/pages/FarmPage';
import { useBackendSync } from '@/logic/use-backend-sync';

function App() {
  // Opt-in cross-browser sync: hydrate-from-backend on mount, push debounced
  // on any store change. Gated internally on settings.syncToBackend — this
  // call is effectively a no-op until the user enables the toggle in Settings.
  useBackendSync();

  return (
    <BrowserRouter>
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
    </BrowserRouter>
  );
}

export default App;

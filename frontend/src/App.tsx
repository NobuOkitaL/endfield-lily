import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AppShell } from '@/components/layout/AppShell';
import HomePage from '@/pages/HomePage';
import StockPage from '@/pages/StockPage';
import OperatorsPage from '@/pages/OperatorsPage';
import WeaponsPage from '@/pages/WeaponsPage';
import PlannerPage from '@/pages/PlannerPage';
import SettingsPage from '@/pages/SettingsPage';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<HomePage />} />
          <Route path="/planner" element={<PlannerPage />} />
          <Route path="/stock" element={<StockPage />} />
          <Route path="/operators" element={<OperatorsPage />} />
          <Route path="/weapons" element={<WeaponsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;

import { Outlet } from 'react-router-dom';
import { useEffect } from 'react';
import { Nav } from './Nav';
import { useAppStore } from '@/store/app-store';

export function AppShell() {
  const darkMode = useAppStore((s) => s.settings.darkMode);
  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode);
  }, [darkMode]);

  return (
    <div className="flex h-screen">
      <Nav />
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}

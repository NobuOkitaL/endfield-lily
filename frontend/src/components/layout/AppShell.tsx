import { Outlet } from 'react-router-dom';
import { useEffect } from 'react';
import { Nav } from './Nav';

export function AppShell() {
  // Verge design is always dark — force the class unconditionally.
  useEffect(() => {
    document.documentElement.classList.add('dark');
  }, []);

  return (
    <div className="flex h-screen bg-canvas">
      <Nav />
      <main className="flex-1 overflow-auto px-6 md:px-12 py-6">
        <Outlet />
      </main>
    </div>
  );
}

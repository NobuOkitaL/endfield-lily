import { NavLink } from 'react-router-dom';
import { cn } from '@/lib/utils';

const LINKS = [
  { to: '/', label: '首页' },
  { to: '/planner', label: '规划' },
  { to: '/stock', label: '库存' },
  { to: '/operators', label: '干员' },
  { to: '/weapons', label: '武器' },
  { to: '/settings', label: '设置' },
];

export function Nav() {
  return (
    <nav className="flex flex-col gap-1 p-4 border-r h-full w-48 shrink-0">
      <div className="text-lg font-semibold mb-4">ZMD</div>
      {LINKS.map((l) => (
        <NavLink
          key={l.to}
          to={l.to}
          end={l.to === '/'}
          className={({ isActive }) =>
            cn('px-3 py-2 rounded-md text-sm hover:bg-accent', isActive && 'bg-accent font-medium')
          }
        >
          {l.label}
        </NavLink>
      ))}
    </nav>
  );
}

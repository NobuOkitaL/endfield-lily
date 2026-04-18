import { NavLink } from 'react-router-dom';
import { cn } from '@/lib/utils';

const LINKS = [
  { to: '/', label: '首页' },
  { to: '/planner', label: '规划' },
  { to: '/stock', label: '库存' },
  { to: '/operators', label: '干员' },
  { to: '/weapons', label: '武器' },
  { to: '/recognize', label: '识别' },
  { to: '/settings', label: '设置' },
];

export function Nav() {
  return (
    <nav
      className="flex flex-col gap-1 p-4 h-full w-56 shrink-0 bg-canvas border-r border-white/10"
      style={{ borderRight: '1px dashed rgba(255,255,255,0.15)' }}
    >
      {/* Wordmark */}
      <div className="mb-6 pt-2">
        <div
          className="font-mono text-signal uppercase tracking-widest"
          style={{ fontSize: '10px', letterSpacing: '1.8px' }}
        >
          终末地规划器
        </div>
        <div
          className="font-display text-white"
          style={{ fontSize: '40px', lineHeight: '0.90', letterSpacing: '-0.02em', marginTop: '4px' }}
        >
          ZMD
        </div>
      </div>

      {/* Dashed separator */}
      <div className="mb-3" style={{ borderTop: '1px dashed rgba(255,255,255,0.20)' }} />

      {/* Nav links */}
      {LINKS.map((l) => (
        <NavLink
          key={l.to}
          to={l.to}
          end={l.to === '/'}
          className={({ isActive }) =>
            cn(
              'px-3 py-2 rounded-tag font-mono uppercase transition-colors duration-150',
              'hover:text-military',
              isActive
                ? 'text-signal border-b border-signal'
                : 'text-white/70',
            )
          }
          style={{ fontSize: '12px', letterSpacing: '1.5px' }}
        >
          {l.label}
        </NavLink>
      ))}
    </nav>
  );
}

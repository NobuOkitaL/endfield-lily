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
      {/* Wordmark — 总控核心 Lily (inline) */}
      <div className="mb-6 pt-2">
        <div className="flex items-baseline gap-2">
          <span
            className="font-sans text-signal"
            style={{ fontSize: '20px', fontWeight: 700, letterSpacing: '0.02em', lineHeight: '1' }}
          >
            总控核心
          </span>
          <span
            className="font-display text-white"
            style={{ fontSize: '26px', lineHeight: '1', letterSpacing: '-0.02em' }}
          >
            Lily
          </span>
        </div>
        <div
          className="font-mono text-white/30 uppercase mt-2"
          style={{ fontSize: '9px', letterSpacing: '1.6px' }}
        >
          CENTRAL CORE
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

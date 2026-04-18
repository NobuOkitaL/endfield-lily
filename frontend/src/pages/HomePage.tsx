import { Link } from 'react-router-dom';
import { CornerBrackets } from '@/components/decor/CornerBrackets';

const NAV_CARDS = [
  {
    to: '/planner',
    kicker: 'PLANNER',
    label: '规划',
    sub: '养成目标 / 材料汇算',
  },
  {
    to: '/stock',
    kicker: 'INVENTORY',
    label: '库存',
    sub: '材料持有量管理',
  },
  {
    to: '/operators',
    kicker: 'OPERATORS',
    label: '干员',
    sub: '干员成长状态记录',
  },
  {
    to: '/weapons',
    kicker: 'WEAPONS',
    label: '武器',
    sub: '武器破限 / 等级记录',
  },
];

export default function HomePage() {
  return (
    <div className="relative">
      {/* ── Hero — full viewport height ─────────────────────────── */}
      <div
        className="relative flex flex-col justify-center min-h-[calc(100vh-4rem)] py-16"
        style={{ marginLeft: '-2rem', marginRight: '-2rem', paddingLeft: '2rem', paddingRight: '2rem' }}
      >
        {/* Corner brackets on the whole hero */}
        <CornerBrackets className="border-white/10" />

        {/* Vertical glitch text — left ambient decor */}
        <div
          className="absolute left-0 top-1/2 -translate-y-1/2 font-mono text-white/8 select-none"
          style={{
            fontSize: '8px',
            letterSpacing: '0.1em',
            writingMode: 'vertical-rl',
            textOrientation: 'mixed',
            lineHeight: 1.8,
            paddingLeft: '6px',
            color: 'rgba(255,255,255,0.07)',
          }}
          aria-hidden="true"
        >
          {'終末地規劃系統 // ARKNIGHTS:ENDFIELD // OPERATOR DATA TERMINAL // ZMD v1.2.4 // LIVE BUILD //'.repeat(2)}
        </div>

        {/* Hero content */}
        <div className="relative z-10">
          {/* Subtitle kicker */}
          <div
            className="font-sans text-[#949494] uppercase mb-4"
            style={{ fontSize: '12px', letterSpacing: '3px' }}
          >
            ARKNIGHTS: ENDFIELD
          </div>

          {/* Main title */}
          <div
            className="font-display text-white leading-none"
            style={{ fontSize: 'clamp(72px, 12vw, 160px)', letterSpacing: '-0.02em', lineHeight: '0.88' }}
          >
            ZMD
          </div>

          {/* Chinese subtitle in ZCOOL XiaoWei */}
          <div
            className="font-display text-[#949494] mt-3 tracking-wider"
            style={{ fontSize: '24px', fontFamily: "'ZCOOL XiaoWei', serif", fontWeight: 400 }}
          >
            终末地养成规划器
          </div>

          <p className="text-[#5a5a5a] mt-5 font-sans text-sm max-w-sm leading-relaxed">
            管理你的干员、武器与养成规划。所有数据储存在浏览器本地。
          </p>
        </div>

        {/* Bottom-left version kicker */}
        <div
          className="absolute bottom-6 left-8 font-mono text-signal"
          style={{ fontSize: '10px', letterSpacing: '1.5px' }}
          aria-hidden="true"
        >
          V1.2.4 / LIVE BUILD
        </div>

        {/* Bottom-right timestamp */}
        <div
          className="absolute bottom-6 right-8 font-mono text-white/20"
          style={{ fontSize: '10px', letterSpacing: '1px' }}
          aria-hidden="true"
        >
          TERMINAL:ACTIVE
        </div>
      </div>

      {/* ── Quick-nav cards ──────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 pb-12">
        {NAV_CARDS.map((card) => (
          <Link
            key={card.to}
            to={card.to}
            className="relative block bg-canvas border border-white/15 rounded-card p-6 group
                       transition-all duration-200
                       hover:border-signal/60"
            style={{ textDecoration: 'none' }}
          >
            <CornerBrackets />
            {/* Mono kicker */}
            <div
              className="font-mono uppercase text-[#4a4a4a] mb-3 group-hover:text-signal transition-colors duration-200"
              style={{ fontSize: '10px', letterSpacing: '2px' }}
            >
              {card.kicker}
            </div>
            {/* Label */}
            <div
              className="font-display text-white group-hover:opacity-90 transition-opacity"
              style={{ fontSize: '42px', lineHeight: '0.88' }}
            >
              {card.label}
            </div>
            {/* Sub-label */}
            <div
              className="font-sans text-[#4a4a4a] mt-2 group-hover:text-[#6a6a6a] transition-colors"
              style={{ fontSize: '11px', letterSpacing: '0.5px' }}
            >
              {card.sub}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

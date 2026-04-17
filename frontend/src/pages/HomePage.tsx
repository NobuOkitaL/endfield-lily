import { Link } from 'react-router-dom';

const TILES = [
  {
    to: '/planner',
    kicker: 'PLANNER',
    label: '规划',
    bg: '#3cffd0',
    textColor: '#000000',
    kickerColor: 'rgba(0,0,0,0.6)',
  },
  {
    to: '/stock',
    kicker: 'INVENTORY',
    label: '库存',
    bg: '#5200ff',
    textColor: '#ffffff',
    kickerColor: 'rgba(255,255,255,0.7)',
  },
  {
    to: '/operators',
    kicker: 'OPERATORS',
    label: '干员',
    bg: '#ffffff',
    textColor: '#000000',
    kickerColor: 'rgba(0,0,0,0.5)',
  },
  {
    to: '/weapons',
    kicker: 'WEAPONS',
    label: '武器',
    bg: '#2d2d2d',
    textColor: '#ffffff',
    kickerColor: 'rgba(255,255,255,0.6)',
  },
];

export default function HomePage() {
  return (
    <div className="py-8">
      {/* Hero */}
      <div className="mb-12">
        <div
          className="font-sans font-light uppercase text-white/70"
          style={{ fontSize: '19px', letterSpacing: '1.9px' }}
        >
          终末地养成规划器
        </div>
        <div
          className="font-display text-white"
          style={{ fontSize: '96px', lineHeight: '0.90', letterSpacing: '-0.02em', marginTop: '8px' }}
        >
          ZMD
        </div>
        <p className="text-[#949494] mt-4 font-sans text-base max-w-md">
          管理你的干员、武器与养成规划。所有数据储存在浏览器本地。
        </p>
      </div>

      {/* Accent tile grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {TILES.map((tile) => (
          <Link
            key={tile.to}
            to={tile.to}
            className="block rounded-feature p-8 transition-all duration-150 group"
            style={{ backgroundColor: tile.bg, textDecoration: 'none' }}
          >
            <div
              className="font-mono uppercase mb-3"
              style={{ fontSize: '11px', letterSpacing: '1.8px', color: tile.kickerColor }}
            >
              {tile.kicker}
            </div>
            <div
              className="font-display group-hover:opacity-80 transition-opacity"
              style={{ fontSize: '40px', lineHeight: '0.90', color: tile.textColor }}
            >
              {tile.label}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

// frontend/src/pages/StockPage.tsx
import { StockGrid } from '@/components/stock/StockGrid';

export default function StockPage() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <div
          className="font-mono uppercase text-mint"
          style={{ fontSize: '11px', letterSpacing: '1.8px' }}
        >
          MATERIAL INVENTORY / 库存管理
        </div>
        <h1
          className="font-display text-white"
          style={{ fontSize: '60px', lineHeight: '0.90', letterSpacing: '-0.01em' }}
        >
          库存
        </h1>
      </div>
      <p className="text-[#949494] font-sans text-[15px] -mt-2">
        输入各材料的持有数量，数据自动保存在浏览器本地。EXP 项为计算值，由对应卡片数量自动求出。
      </p>
      <StockGrid />
    </div>
  );
}

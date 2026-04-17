// frontend/src/pages/StockPage.tsx
import { StockGrid } from '@/components/stock/StockGrid';

export default function StockPage() {
  return (
    <div className="p-6 space-y-4">
      <h2 className="text-2xl font-semibold">库存</h2>
      <p className="text-sm text-muted-foreground">
        输入各材料的持有数量，数据自动保存在浏览器本地。EXP 项为计算值，由对应卡片数量自动求出。
      </p>
      <StockGrid />
    </div>
  );
}

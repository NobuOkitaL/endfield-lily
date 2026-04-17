# 终末地数据源审计（2026-04-17）

关闭两个 backlog task：
- **#5** ：搜索终末地 datamine repo
- **#36**：end.wiki 数据源核对

---

## 现状回顾

当前前端的游戏数据（25 干员 / 66 武器 / 39 材料 / 481 行升级成本）由 `frontend/scripts/port-data.mjs` 从 **`CaffuChin0/zmdgraph`**（单人手工维护的表格）转译而来。

## 调研结果

### 1. 社区 datamine repo

| 仓库 | 状态 | 备注 |
|------|------|------|
| [`daydreamer-json/ak-endfield-api-archive`](https://github.com/daydreamer-json/ak-endfield-api-archive) | **活跃**，39★，240 commits，GitHub Actions 自动更新 | 存的是 **CDN 文件清单 + 加密 raw 包**，不是解码后的 JSON。仓库内 `pages-v2/` 是个 Vite+React viewer，运行时解密。想从这里拿"干员"、"升级成本"得自己跑解密管线——工作量大。 |
| [`wuyilingwei/EndfieldGameData`](https://github.com/wuyilingwei/EndfieldGameData) | **已归档**（2025-01-18），22★ | 只有 CBT1 数据。过期。 |
| `Kengxxiao/EndfieldGameData` | **不存在** | 明日方舟那套命名约定在终末地上没人做 |

**结论**：无"开箱即用的结构化 JSON"datamine 仓库存在。想要原始数据得自己解。

### 2. end.wiki 审计

- **架构**：Next.js SSG/SSR（非纯 SPA），locale 前缀路由（`/zh-Hans/`、`/en/`、`/ja/`），无公开 API（`/api/` 返回 404）
- **新鲜度**：对齐到游戏 **v1.2.4**（2026-04-17 09:52 UTC）——比 zmdgraph 快
- **覆盖度** vs 我们：
  - 干员 **27** vs 25（多了 庄方宜、骏卫）
  - 武器 **68** vs 66（v1.2.4 新增 2 件）
  - 材料 ~220 vs 39（我们的 39 是养成相关子集，完全被覆盖）
- **成本表**：
  - ✅ 精英阶段、等级 EXP、装备适配 — 在角色页 HTML 里直接可爬
  - ⚠️ **技能升级成本表**（skill 1→12 每级材料）— 角色主页面没见着，可能在子页或 JS 动态加载，需要浏览器验证
- **爬取难度**：2/5（大部分 SSG HTML），估计 4-8 小时写完整 scraper；若技能表要浏览器 automation 再加 4-6 小时

### 3. 其他未探索

- BWiki / PRTS 终末地版块 — 未审计
- 社区 GitHub awesome list — agent 被 kill 前未跑完

---

## 推荐

**保持 zmdgraph 为主源，加 end.wiki 做校验 / 增量数据源。**

### 为什么不立即切换

1. 已有 481 行升级成本跑通测试了，切换就要重新校准所有测试期望值
2. end.wiki 的技能成本表可用性还没完全确认
3. zmdgraph 维护者会继续跟版本，不至于立刻过时

### 建议做法（真要做的话，新开 Task）

1. **写 `scripts/sync-from-endwiki.mjs`**（≈4h）：拉角色 / 武器列表 + 精英成本 + EXP 表
2. 跑 **diff 脚本** 比对 end.wiki 和当前 zmdgraph-ported 数据，输出差异报告
3. 差异里的新增干员/武器 → 合并进 `src/data/*.ts`
4. 成本数字出入的地方 → 以 end.wiki 为准（因为它对齐到最新游戏版本）
5. **技能成本表**：用真实浏览器抓一个角色页的完整渲染 DOM，确认技能成本在哪里；若没有就继续用 zmdgraph 的技能表

### 不推荐的方案

- ❌ 从 `daydreamer-json/ak-endfield-api-archive` 解游戏包——ROI 太低，除非要做竞品级全功能（干员立绘、剧情文本等）
- ❌ 完全切换到 end.wiki 作为单一源——除非 end.wiki 能 100% 覆盖技能成本，否则会缺数据

---

## 关闭状态

- Task #5：**已完成**（结论：无成熟 datamine repo 可用）
- Task #36：**已完成**（结论：end.wiki 可作次要校验源，v1.2.4 新干员可合并，但不推荐现在切主源）

两个 task 的"继续推进"都当 backlog 留着，非阻塞 Plan A/B。

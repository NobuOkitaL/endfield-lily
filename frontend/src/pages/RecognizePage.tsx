// frontend/src/pages/RecognizePage.tsx
import { useEffect, useState } from 'react';
import { UploadDropzone } from '@/components/recognize/UploadDropzone';
import { InventoryResultEditor } from '@/components/recognize/InventoryResultEditor';
import { OperatorResultEditor } from '@/components/recognize/OperatorResultEditor';
import { WeaponResultEditor } from '@/components/recognize/WeaponResultEditor';
import {
  checkBackendHealth,
  recognizeInventory,
  recognizeOperators,
  recognizeWeapons,
} from '@/api/recognition';
import type { InventoryResponse, OperatorsResponse, WeaponsResponse } from '@/api/recognition';
import {
  mergeInventoryResponses,
  mergeOperatorsResponses,
  mergeWeaponsResponses,
} from '@/logic/recognition-merge';

export default function RecognizePage() {
  const [backendOk, setBackendOk] = useState<boolean | null>(null);

  // Inventory section state
  const [invBusy, setInvBusy] = useState(false);
  const [invProgress, setInvProgress] = useState<{ done: number; total: number } | null>(null);
  const [invError, setInvError] = useState<string | null>(null);
  const [invResult, setInvResult] = useState<InventoryResponse | null>(null);
  const [invMsg, setInvMsg] = useState<string | null>(null);

  // Operator section state
  const [opBusy, setOpBusy] = useState(false);
  const [opProgress, setOpProgress] = useState<{ done: number; total: number } | null>(null);
  const [opError, setOpError] = useState<string | null>(null);
  const [opResult, setOpResult] = useState<OperatorsResponse | null>(null);
  const [opMsg, setOpMsg] = useState<string | null>(null);

  // Weapon section state
  const [wpBusy, setWpBusy] = useState(false);
  const [wpProgress, setWpProgress] = useState<{ done: number; total: number } | null>(null);
  const [wpError, setWpError] = useState<string | null>(null);
  const [wpResult, setWpResult] = useState<WeaponsResponse | null>(null);
  const [wpMsg, setWpMsg] = useState<string | null>(null);

  useEffect(() => {
    void checkBackendHealth().then(setBackendOk);
  }, []);

  async function handleInventoryFiles(files: File[]) {
    setInvBusy(true);
    setInvError(null);
    setInvResult(null);
    setInvMsg(null);
    setInvProgress({ done: 0, total: files.length });
    const results: InventoryResponse[] = [];
    try {
      for (let i = 0; i < files.length; i++) {
        const r = await recognizeInventory(files[i]);
        results.push(r);
        setInvProgress({ done: i + 1, total: files.length });
      }
      setInvResult(mergeInventoryResponses(results));
    } catch (e) {
      setInvError(e instanceof Error ? e.message : String(e));
    } finally {
      setInvBusy(false);
      setInvProgress(null);
    }
  }

  async function handleOperatorFiles(files: File[]) {
    setOpBusy(true);
    setOpError(null);
    setOpResult(null);
    setOpMsg(null);
    setOpProgress({ done: 0, total: files.length });
    const results: OperatorsResponse[] = [];
    try {
      for (let i = 0; i < files.length; i++) {
        const r = await recognizeOperators(files[i]);
        results.push(r);
        setOpProgress({ done: i + 1, total: files.length });
      }
      setOpResult(mergeOperatorsResponses(results));
    } catch (e) {
      setOpError(e instanceof Error ? e.message : String(e));
    } finally {
      setOpBusy(false);
      setOpProgress(null);
    }
  }

  async function handleWeaponFiles(files: File[]) {
    setWpBusy(true);
    setWpError(null);
    setWpResult(null);
    setWpMsg(null);
    setWpProgress({ done: 0, total: files.length });
    const results: WeaponsResponse[] = [];
    try {
      for (let i = 0; i < files.length; i++) {
        const r = await recognizeWeapons(files[i]);
        results.push(r);
        setWpProgress({ done: i + 1, total: files.length });
      }
      setWpResult(mergeWeaponsResponses(results));
    } catch (e) {
      setWpError(e instanceof Error ? e.message : String(e));
    } finally {
      setWpBusy(false);
      setWpProgress(null);
    }
  }

  return (
    <div className="space-y-10">
      {/* Page header */}
      <div>
        <div
          className="font-mono uppercase text-signal"
          style={{ fontSize: '11px', letterSpacing: '1.8px' }}
        >
          SCREENSHOT RECOGNITION / 截图识别
        </div>
        <h1
          className="font-display text-white"
          style={{ fontSize: '60px', lineHeight: '0.90', letterSpacing: '-0.01em' }}
        >
          识别
        </h1>
      </div>

      {/* Backend health banner */}
      {backendOk === false && (
        <div className="border border-alert/60 rounded-card p-6 space-y-3">
          <div
            className="font-mono uppercase text-alert"
            style={{ fontSize: '11px', letterSpacing: '1.8px' }}
          >
            BACKEND OFFLINE / 后端未启动
          </div>
          <p className="font-sans text-[#949494] text-sm">
            识别功能需要本地后端服务。请在终端运行：
          </p>
          <pre
            className="font-mono text-white/80 bg-white/5 rounded-sm px-4 py-3 text-xs overflow-x-auto"
            style={{ letterSpacing: '0.02em' }}
          >
            cd backend && source .venv/bin/activate && uvicorn app.main:app --port 8000
          </pre>
        </div>
      )}

      <div className="max-w-2xl space-y-12">
        {/* ── Inventory section ──────────────────────────────────── */}
        <section className="space-y-4">
          <div>
            <div
              className="font-mono uppercase text-signal mb-1"
              style={{ fontSize: '11px', letterSpacing: '1.8px' }}
            >
              MATERIAL INVENTORY / 库存截图
            </div>
            <h2
              className="font-display text-white"
              style={{ fontSize: '32px', lineHeight: '0.90' }}
            >
              库存截图
            </h2>
          </div>

          {!invResult && (
            <UploadDropzone
              onFiles={handleInventoryFiles}
              label="上传库存截图，自动识别材料数量（支持多张，同名取最大值）"
            />
          )}

          {invBusy && (
            <div
              className="font-mono uppercase text-signal"
              style={{ fontSize: '11px', letterSpacing: '1.8px' }}
            >
              PROCESSING{invProgress ? ` ${invProgress.done}/${invProgress.total}` : ''}...
            </div>
          )}

          {invError && (
            <div
              className="font-mono uppercase text-alert"
              style={{ fontSize: '11px', letterSpacing: '1.8px' }}
            >
              {invError}
            </div>
          )}

          {invMsg && (
            <div
              className="font-mono uppercase text-signal"
              style={{ fontSize: '11px', letterSpacing: '1.8px' }}
            >
              {invMsg}
            </div>
          )}

          {invResult && (
            <div className="space-y-4">
              <InventoryResultEditor
                result={invResult}
                onApplied={() => {
                  setInvResult(null);
                  setInvMsg('已合并到库存');
                }}
              />
              <button
                onClick={() => {
                  setInvResult(null);
                  setInvMsg(null);
                  setInvError(null);
                }}
                className="font-mono uppercase text-white/40 hover:text-white/70 transition-colors text-xs"
                style={{ letterSpacing: '1.5px' }}
              >
                取消 / CANCEL
              </button>
            </div>
          )}
        </section>

        {/* ── Operators section ──────────────────────────────────── */}
        <section className="space-y-4">
          <div>
            <div
              className="font-mono uppercase text-signal mb-1"
              style={{ fontSize: '11px', letterSpacing: '1.8px' }}
            >
              OPERATOR LIST / 干员列表截图
            </div>
            <h2
              className="font-display text-white"
              style={{ fontSize: '32px', lineHeight: '0.90' }}
            >
              干员截图
            </h2>
          </div>

          {!opResult && (
            <UploadDropzone
              onFiles={handleOperatorFiles}
              label="上传干员列表截图，自动识别干员等级（支持多张，同名取最大值）"
            />
          )}

          {opBusy && (
            <div
              className="font-mono uppercase text-signal"
              style={{ fontSize: '11px', letterSpacing: '1.8px' }}
            >
              PROCESSING{opProgress ? ` ${opProgress.done}/${opProgress.total}` : ''}...
            </div>
          )}

          {opError && (
            <div
              className="font-mono uppercase text-alert"
              style={{ fontSize: '11px', letterSpacing: '1.8px' }}
            >
              {opError}
            </div>
          )}

          {opMsg && (
            <div
              className="font-mono uppercase text-signal"
              style={{ fontSize: '11px', letterSpacing: '1.8px' }}
            >
              {opMsg}
            </div>
          )}

          {opResult && (
            <div className="space-y-4">
              <OperatorResultEditor
                result={opResult}
                onApplied={() => {
                  setOpResult(null);
                  setOpMsg('已合并到干员');
                }}
              />
              <button
                onClick={() => {
                  setOpResult(null);
                  setOpMsg(null);
                  setOpError(null);
                }}
                className="font-mono uppercase text-white/40 hover:text-white/70 transition-colors text-xs"
                style={{ letterSpacing: '1.5px' }}
              >
                取消 / CANCEL
              </button>
            </div>
          )}
        </section>

        {/* ── Weapons section ──────────────────────────────────── */}
        <section className="space-y-4">
          <div>
            <div
              className="font-mono uppercase text-signal mb-1"
              style={{ fontSize: '11px', letterSpacing: '1.8px' }}
            >
              WEAPON ROSTER / 武器列表截图
            </div>
            <h2
              className="font-display text-white"
              style={{ fontSize: '32px', lineHeight: '0.90' }}
            >
              武器截图
            </h2>
          </div>

          {!wpResult && (
            <UploadDropzone
              onFiles={handleWeaponFiles}
              label="上传武器列表截图，自动识别武器等级（支持多张，同名取最大值）"
            />
          )}

          {wpBusy && (
            <div
              className="font-mono uppercase text-signal"
              style={{ fontSize: '11px', letterSpacing: '1.8px' }}
            >
              PROCESSING{wpProgress ? ` ${wpProgress.done}/${wpProgress.total}` : ''}...
            </div>
          )}

          {wpError && (
            <div
              className="font-mono uppercase text-alert"
              style={{ fontSize: '11px', letterSpacing: '1.8px' }}
            >
              {wpError}
            </div>
          )}

          {wpMsg && (
            <div
              className="font-mono uppercase text-signal"
              style={{ fontSize: '11px', letterSpacing: '1.8px' }}
            >
              {wpMsg}
            </div>
          )}

          {wpResult && (
            <div className="space-y-4">
              <WeaponResultEditor
                result={wpResult}
                onApplied={() => {
                  setWpResult(null);
                  setWpMsg('已合并到武器');
                }}
              />
              <button
                onClick={() => {
                  setWpResult(null);
                  setWpMsg(null);
                  setWpError(null);
                }}
                className="font-mono uppercase text-white/40 hover:text-white/70 transition-colors text-xs"
                style={{ letterSpacing: '1.5px' }}
              >
                取消 / CANCEL
              </button>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

#!/usr/bin/env node
/**
 * 跨平台启动器（macOS / Linux / Windows 通用）。
 *   用法：  node start.mjs
 *
 * 首次运行会：
 *   - 建 Python venv + 装 backend/requirements.txt 的依赖
 *   - 跑 pnpm install
 * 然后同时起 uvicorn（后端 :8000）和 vite（前端 :5173）。
 * Ctrl+C 时会清理两个子进程。
 */

import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = dirname(fileURLToPath(import.meta.url));
const IS_WIN = process.platform === 'win32';

// ─── Pick a working python ──────────────────────────────────────────────────
function detectPython() {
  const candidates = IS_WIN ? ['py', 'python', 'python3'] : ['python3', 'python'];
  for (const cmd of candidates) {
    try {
      const r = spawnSync(cmd, ['--version'], { encoding: 'utf8' });
      const out = `${r.stdout || ''}${r.stderr || ''}`;
      const m = out.match(/Python (\d+)\.(\d+)/);
      if (m && (Number(m[1]) > 3 || (Number(m[1]) === 3 && Number(m[2]) >= 11))) {
        return cmd;
      }
    } catch {}
  }
  return null;
}

function venvPython() {
  return IS_WIN
    ? join(REPO, 'backend', '.venv', 'Scripts', 'python.exe')
    : join(REPO, 'backend', '.venv', 'bin', 'python');
}

function hasCommand(cmd) {
  try {
    const r = spawnSync(cmd, ['--version'], { encoding: 'utf8' });
    return r.status === 0;
  } catch {
    return false;
  }
}

// Run a command synchronously, inheriting stdio, die on failure
function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, {
    stdio: 'inherit',
    shell: IS_WIN, // pnpm / pip scripts on Windows are .cmd files — need shell
    ...opts,
  });
  if (r.status !== 0) {
    console.error(`[start.mjs] Command failed: ${cmd} ${args.join(' ')}`);
    process.exit(r.status || 1);
  }
}

// ─── Backend setup ──────────────────────────────────────────────────────────
const py = detectPython();
if (!py) {
  console.error('[start.mjs] Python 3.11+ not found. Install from https://www.python.org/');
  console.error('                Windows users: check "Add Python to PATH" during install.');
  process.exit(1);
}
console.log(`[start.mjs] Using Python: ${py}`);

const venvPy = venvPython();
if (!existsSync(venvPy)) {
  console.log('[start.mjs] Creating backend venv (first-run, ~3-5 min)...');
  run(py, ['-m', 'venv', '.venv'], { cwd: join(REPO, 'backend') });
  run(venvPy, ['-m', 'pip', 'install', '--upgrade', 'pip']);
  run(venvPy, ['-m', 'pip', 'install', '-r', 'requirements.txt'], {
    cwd: join(REPO, 'backend'),
  });
}

// ─── Frontend setup ─────────────────────────────────────────────────────────
if (!hasCommand('pnpm')) {
  console.error('[start.mjs] pnpm not found. Install via: npm install -g pnpm');
  console.error('                (or enable corepack: corepack enable)');
  process.exit(1);
}
if (!existsSync(join(REPO, 'frontend', 'node_modules'))) {
  console.log('[start.mjs] Installing frontend deps (pnpm install)...');
  run('pnpm', ['install'], { cwd: join(REPO, 'frontend') });
}

// ─── Launch backend + frontend in parallel ─────────────────────────────────
const children = [];

function launch(label, cmd, args, cwd, color = '\x1b[36m') {
  const child = spawn(cmd, args, {
    cwd,
    shell: IS_WIN,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const tag = `${color}[${label}]\x1b[0m`;

  child.stdout.on('data', (d) => {
    process.stdout.write(
      d.toString()
        .split(/\r?\n/)
        .filter((l) => l.length > 0)
        .map((l) => `${tag} ${l}`)
        .join('\n') + '\n',
    );
  });
  child.stderr.on('data', (d) => {
    process.stderr.write(
      d.toString()
        .split(/\r?\n/)
        .filter((l) => l.length > 0)
        .map((l) => `${tag} ${l}`)
        .join('\n') + '\n',
    );
  });
  child.on('exit', (code) => {
    console.log(`${tag} exited with code ${code}`);
  });

  children.push(child);
  return child;
}

console.log('');
console.log('[start.mjs] Launching services...');
launch('backend', venvPy, ['-m', 'uvicorn', 'app.main:app', '--port', '8000', '--reload'], join(REPO, 'backend'), '\x1b[35m');
launch('frontend', 'pnpm', ['dev'], join(REPO, 'frontend'), '\x1b[36m');

console.log('');
console.log('[start.mjs] Ready:');
console.log('   Frontend: http://localhost:5173');
console.log('   Backend:  http://localhost:8000/docs');
console.log('');
console.log('Press Ctrl+C to stop both.');
console.log('');

// ─── Cleanup on Ctrl+C / SIGTERM / main exit ───────────────────────────────
function shutdown() {
  console.log('\n[start.mjs] Stopping services...');
  for (const c of children) {
    try {
      if (IS_WIN) {
        // taskkill is the reliable way to stop the whole tree on Windows
        spawnSync('taskkill', ['/pid', String(c.pid), '/f', '/t'], { stdio: 'ignore' });
      } else {
        c.kill('SIGTERM');
      }
    } catch {}
  }
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

#!/usr/bin/env node
/**
 * Cross-platform service launcher for 总控核心 Lily.
 *
 * Usage:
 *   node start.mjs                         # backend + frontend + label-tool
 *   node start.mjs all                     # backend + frontend + label-tool
 *   node start.mjs backend
 *   node start.mjs frontend label-tool
 */

import { spawn, spawnSync } from 'node:child_process';
import { statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = dirname(fileURLToPath(import.meta.url));
const IS_WIN = process.platform === 'win32';
const SERVICES = ['backend', 'frontend', 'label-tool'];
const COLORS = {
  backend: '\x1b[35m',
  frontend: '\x1b[36m',
  'label-tool': '\x1b[32m',
  reset: '\x1b[0m',
};

const children = [];
let shuttingDown = false;

function usage() {
  console.log('Usage: node start.mjs [all|backend|frontend|label-tool] [...]');
  console.log('');
  console.log('Examples:');
  console.log('  node start.mjs');
  console.log('  node start.mjs backend');
  console.log('  node start.mjs backend frontend');
  console.log('  node start.mjs label-tool');
}

function fileExists(path) {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

function dirExists(path) {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

function parseServices(argv) {
  const args = argv.length === 0 ? ['all'] : argv;
  const normalized = args.map((arg) => arg.trim()).filter(Boolean);
  if (normalized.length === 0) {
    return SERVICES;
  }
  if (normalized.includes('all')) {
    if (normalized.length > 1) {
      console.log('[start.mjs] "all" includes backend, frontend, and label-tool; ignoring other service args.');
    }
    return SERVICES;
  }

  const unknown = normalized.filter((arg) => !SERVICES.includes(arg));
  if (unknown.length > 0) {
    console.error(`[start.mjs] Unknown service: ${unknown.join(', ')}`);
    usage();
    process.exit(1);
  }

  return [...new Set(normalized)];
}

function hasCommand(cmd) {
  try {
    const result = spawnSync(cmd, ['--version'], {
      encoding: 'utf8',
      shell: needsShell(cmd),
    });
    return result.status === 0;
  } catch {
    return false;
  }
}

function run(cmd, args, opts = {}) {
  const result = spawnSync(cmd, args, {
    stdio: 'inherit',
    shell: needsShell(cmd),
    ...opts,
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`${cmd} ${args.join(' ')} exited with code ${result.status}`);
  }
}

function detectPython() {
  const candidates = IS_WIN ? ['py', 'python', 'python3'] : ['python3', 'python'];
  for (const cmd of candidates) {
    try {
      const result = spawnSync(cmd, ['--version'], {
        encoding: 'utf8',
        shell: false,
      });
      const output = `${result.stdout || ''}${result.stderr || ''}`;
      const match = output.match(/Python (\d+)\.(\d+)/);
      if (match && (Number(match[1]) > 3 || (Number(match[1]) === 3 && Number(match[2]) >= 11))) {
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

function backendDepsReady(pythonPath) {
  if (!fileExists(pythonPath)) {
    return false;
  }

  const result = spawnSync(
    pythonPath,
    ['-m', 'pip', 'show', 'fastapi', 'uvicorn', 'opencv-python', 'rapidocr-onnxruntime'],
    {
      cwd: join(REPO, 'backend'),
      encoding: 'utf8',
      shell: false,
    },
  );
  return result.status === 0;
}

function ensureBackend() {
  const python = detectPython();
  if (!python) {
    throw new Error('Python 3.11+ not found. Install from https://www.python.org/ and add it to PATH.');
  }

  const pythonPath = venvPython();
  if (backendDepsReady(pythonPath)) {
    console.log(`[start.mjs] backend deps ready (${pythonPath})`);
    return;
  }

  console.log(`[start.mjs] Preparing backend venv with ${python}...`);
  run(python, ['-m', 'venv', '.venv'], { cwd: join(REPO, 'backend') });
  run(pythonPath, ['-m', 'pip', 'install', '--upgrade', 'pip']);
  run(pythonPath, ['-m', 'pip', 'install', '-r', 'requirements.txt'], {
    cwd: join(REPO, 'backend'),
  });
}

function nodeModulesReady(serviceDir) {
  const nodeModules = join(serviceDir, 'node_modules');
  return (
    dirExists(nodeModules) &&
    fileExists(join(nodeModules, '.modules.yaml')) &&
    dirExists(join(nodeModules, '.pnpm'))
  );
}

function ensurePnpm() {
  if (!hasCommand('pnpm')) {
    throw new Error('pnpm not found. Install via: npm install -g pnpm (or run: corepack enable).');
  }
}

function needsShell(cmd) {
  return IS_WIN && cmd === 'pnpm';
}

function ensureNodeService(serviceName) {
  ensurePnpm();
  const serviceDir = join(REPO, serviceName);
  if (nodeModulesReady(serviceDir)) {
    console.log(`[start.mjs] ${serviceName} deps ready`);
    return;
  }

  console.log(`[start.mjs] Installing ${serviceName} deps (pnpm install)...`);
  run('pnpm', ['install'], { cwd: serviceDir });
}

function prefixStream(stream, target, tag) {
  let buffer = '';
  stream.on('data', (chunk) => {
    buffer += chunk.toString();
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() || '';
    for (const line of lines) {
      if (line.length > 0) {
        target.write(`${tag} ${line}\n`);
      }
    }
  });
  stream.on('end', () => {
    if (buffer.length > 0) {
      target.write(`${tag} ${buffer}\n`);
      buffer = '';
    }
  });
}

function launch(serviceName, cmd, args, cwd) {
  const tag = `${COLORS[serviceName]}[${serviceName}]${COLORS.reset}`;
  const child = spawn(cmd, args, {
    cwd,
    shell: needsShell(cmd),
    detached: !IS_WIN,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  child.serviceName = serviceName;
  prefixStream(child.stdout, process.stdout, tag);
  prefixStream(child.stderr, process.stderr, tag);

  child.on('error', (error) => {
    console.error(`${tag} failed to start: ${error.message}`);
  });

  child.on('exit', (code, signal) => {
    const index = children.indexOf(child);
    if (index >= 0) {
      children.splice(index, 1);
    }
    const reason = signal ? `signal ${signal}` : `code ${code}`;
    console.log(`${tag} exited with ${reason}`);
    if (!shuttingDown && children.length === 0) {
      process.exit(code || 0);
    }
  });

  children.push(child);
  return child;
}

const SERVICE_CONFIG = {
  backend: {
    setup: ensureBackend,
    launch: () =>
      launch(
        'backend',
        venvPython(),
        ['-m', 'uvicorn', 'app.main:app', '--port', '8000', '--reload'],
        join(REPO, 'backend'),
      ),
    url: 'Backend:    http://localhost:8000/docs',
  },
  frontend: {
    setup: () => ensureNodeService('frontend'),
    launch: () => launch('frontend', 'pnpm', ['dev'], join(REPO, 'frontend')),
    url: 'Frontend:   http://localhost:5173',
  },
  'label-tool': {
    setup: () => ensureNodeService('label-tool'),
    launch: () => launch('label-tool', 'pnpm', ['dev'], join(REPO, 'label-tool')),
    url: 'Label tool: http://localhost:5174',
  },
};

function terminateChild(child) {
  if (!child.pid) {
    return;
  }

  try {
    if (IS_WIN) {
      spawnSync('taskkill', ['/pid', String(child.pid), '/f', '/t'], { stdio: 'ignore' });
    } else {
      process.kill(-child.pid, 'SIGTERM');
    }
  } catch {}
}

function shutdown() {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  console.log('\n[start.mjs] Stopping services...');

  for (const child of [...children].reverse()) {
    terminateChild(child);
  }

  const forceTimer = setTimeout(() => {
    for (const child of [...children].reverse()) {
      try {
        if (IS_WIN) {
          spawnSync('taskkill', ['/pid', String(child.pid), '/f', '/t'], { stdio: 'ignore' });
        } else {
          process.kill(-child.pid, 'SIGKILL');
        }
      } catch {}
    }
    process.exit(0);
  }, 2500);

  const waitTimer = setInterval(() => {
    if (children.length === 0) {
      clearInterval(waitTimer);
      clearTimeout(forceTimer);
      process.exit(0);
    }
  }, 100);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

const selectedServices = parseServices(process.argv.slice(2));
const launched = [];

console.log(`[start.mjs] Repo: ${REPO}`);
console.log(`[start.mjs] Services: ${selectedServices.join(', ')}`);

for (const serviceName of selectedServices) {
  const service = SERVICE_CONFIG[serviceName];
  try {
    service.setup();
    service.launch();
    launched.push(serviceName);
  } catch (error) {
    console.error(`[start.mjs] ${serviceName} failed: ${error.message}`);
  }
}

if (launched.length === 0) {
  console.error('[start.mjs] No services were started.');
  process.exit(1);
}

console.log('');
console.log('[start.mjs] Ready:');
for (const serviceName of launched) {
  console.log(`  ${SERVICE_CONFIG[serviceName].url}`);
}
console.log('');
console.log('Press Ctrl+C to stop.');
console.log('');

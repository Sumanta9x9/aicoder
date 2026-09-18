#!/usr/bin/env node

const readline = require('readline');
const fs = require('fs');
const path = require('path');
const os = require('os');
const https = require('https');

// ── Color helpers ──────────────────────────────────────────────────────────────
const C = {
  magenta: (s) => `\x1b[35m${s}\x1b[0m`,
  bright:  (s) => `\x1b[97m${s}\x1b[0m`,
  yellow:  (s) => `\x1b[33m${s}\x1b[0m`,
  red:     (s) => `\x1b[31m${s}\x1b[0m`,
  dim:     (s) => `\x1b[2m${s}\x1b[0m`,
  purple:  (s) => `\x1b[38;5;141m${s}\x1b[0m`,
  bold:    (s) => `\x1b[1m${s}\x1b[0m`,
};

const API_BASE = 'https://api.brocode.live';
const SETTINGS_PATH = path.join(os.homedir(), '.claude', 'settings.json');

// The env keys this wizard manages — written on setup, removed on uninstall.
const MANAGED_ENV_KEYS = [
  'ANTHROPIC_AUTH_TOKEN',
  'ANTHROPIC_BASE_URL',
  'ANTHROPIC_MODEL',
  'ANTHROPIC_SMALL_FAST_MODEL',
  'ANTHROPIC_DEFAULT_SONNET_MODEL',
  'ANTHROPIC_DEFAULT_OPUS_MODEL',
  'ANTHROPIC_DEFAULT_HAIKU_MODEL',
  'CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC',
];

// ── JSON helpers ───────────────────────────────────────────────────────────────
function readJson(filePath) {
  try { return JSON.parse(fs.readFileSync(filePath, 'utf8')); }
  catch { return {}; }
}

function writeJson(filePath, data) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n');
}

// ── Readline helper ────────────────────────────────────────────────────────────
function ask(rl, question) {
  return new Promise((resolve) => rl.question(question, resolve));
}

// ── Connection check ───────────────────────────────────────────────────────────
function verifyConnection(apiKey) {
  return new Promise((resolve) => {
    const url = new URL(`${API_BASE}/v1/models`);
    const req = https.request(
      {
        hostname: url.hostname,
        port: url.port || 443,
        path: url.pathname,
        method: 'GET',
        headers: { 'x-api-key': apiKey },
        timeout: 10000,
      },
      (res) => {
        let body = '';
        res.on('data', (c) => { body += c; });
        res.on('end', () => resolve({ status: res.statusCode, body }));
      },
    );
    req.on('error', (err) => resolve({ status: 0, error: err.message }));
    req.on('timeout', () => { req.destroy(); resolve({ status: 0, error: 'timeout' }); });
    req.end();
  });
}

// ── Setup ────────────────────────────────────────────────────────────────────
function applyConfig(apiKey) {
  const settings = readJson(SETTINGS_PATH);
  if (!settings.env) settings.env = {};
  // Start clean — drop anything an older version of this wizard wrote.
  for (const k of MANAGED_ENV_KEYS) delete settings.env[k];
  Object.assign(settings.env, {
    ANTHROPIC_AUTH_TOKEN: apiKey,
    ANTHROPIC_BASE_URL: API_BASE,
    // No model pins — Claude Code reads the lineup from /v1/models.
    CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
  });
  settings.hasCompletedOnboarding = true;
  writeJson(SETTINGS_PATH, settings);
}

// ── Uninstall ────────────────────────────────────────────────────────────────
function removeConfig() {
  if (!fs.existsSync(SETTINGS_PATH)) return { existed: false, removed: 0 };
  const settings = readJson(SETTINGS_PATH);
  let removed = 0;
  if (settings.env) {
    for (const key of MANAGED_ENV_KEYS) {
      if (key in settings.env) { delete settings.env[key]; removed++; }
    }
    if (Object.keys(settings.env).length === 0) delete settings.env;
  }
  writeJson(SETTINGS_PATH, settings);
  return { existed: true, removed };
}

// ── UI ─────────────────────────────────────────────────────────────────────────
function banner() {
  const c256 = (n) => (s) => `\x1b[38;5;${n}m${s}\x1b[0m`;
  const L = {
    A: ['  █████╗ ', ' ██╔══██╗', '███████║', '██╔══██║', '██║  ██║', '╚═╝  ╚═╝'],
    I: ['██╗', '██║', '██║', '██║', '██║', '╚═╝'],
    _: ['  ', '  ', '  ', '  ', '  ', '  '],
    C: [' ██████╗', '██╔════╝', '██║     ', '██║     ', '╚██████╗', ' ╚═════╝'],
    O: [' ██████╗ ', '██╔═══██╗', '██║   ██║', '██║   ██║', '╚██████╔╝', ' ╚═════╝ '],
    D: ['██████╗ ', '██╔══██╗', '██║  ██║', '██║  ██║', '██████╔╝', '╚═════╝ '],
    E: ['███████╗', '██╔════╝', '█████╗  ', '██╔══╝  ', '███████╗', '╚══════╝'],
    R: ['██████╗ ', '██╔══██╗', '██████╔╝', '██╔══██╗', '██║  ██║', '╚═╝  ╚═╝'],
  };
  const word = ['A', 'I', '_', 'C', 'O', 'D', 'E', 'R'];
  const colors = [226, 214, 214, 199, 129, 75, 45, 48].map(c256);
  const cols = process.stdout.columns || 80;

  console.log('');
  if (cols >= 70) {
    for (let row = 0; row < 6; row++) {
      let line = '  ';
      for (let i = 0; i < word.length; i++) line += colors[i](L[word[i]][row]);
      console.log(line);
    }
  } else {
    console.log('  ' + colors[0]('AI') + colors[3]('-Coder'));
  }
  console.log('  ' + C.dim('unlimited Claude · setup wizard'));
  console.log('');
}

async function runSetup(rl, target) {
  let apiKey = '';
  while (!apiKey.trim()) {
    apiKey = await ask(rl, C.bold('  Enter your AI-Coder API key: '));
    if (!apiKey.trim()) console.log(C.red('  ✗ API key cannot be empty.\n'));
  }
  apiKey = apiKey.trim();

  console.log('');
  applyConfig(apiKey);
  console.log(`  ${C.purple('✓')} Wrote ${C.magenta(SETTINGS_PATH)}`);

  process.stdout.write(`  ${C.dim('Verifying connection…')}\r`);
  const res = await verifyConnection(apiKey);
  if (res.status === 200) {
    console.log(`  ${C.purple('✓')} Connected — your API key is valid.        `);
  } else if (res.status > 0) {
    console.log(`  ${C.yellow('⚠')} HTTP ${res.status} — server responded, but the key may be invalid.`);
  } else {
    console.log(`  ${C.yellow('⚠')} Couldn't reach the API (${res.error}). Config saved anyway.`);
  }

  console.log('');
  console.log(C.purple('  ┌────────────────────────────────────────────┐'));
  console.log(C.purple('  │') + C.bold('  ✓ Setup complete                            ') + C.purple('│'));
  if (target === 'desktop') {
    console.log(C.purple('  │') + '  Fully quit & reopen the Claude app to apply. ' + C.purple('│'));
  } else {
    console.log(C.purple('  │') + '  Run ' + C.bold('claude') + ' in your terminal to start.          ' + C.purple('│'));
  }
  console.log(C.purple('  └────────────────────────────────────────────┘'));
  console.log('');
}

function runUninstall() {
  console.log('');
  const { existed, removed } = removeConfig();
  if (!existed) {
    console.log(`  ${C.yellow('⚠')} No AI-Coder config found at ${C.magenta(SETTINGS_PATH)}.`);
  } else if (removed === 0) {
    console.log(`  ${C.yellow('⚠')} No AI-Coder settings were present — nothing to remove.`);
  } else {
    console.log(`  ${C.purple('✓')} Removed AI-Coder config (${removed} setting${removed === 1 ? '' : 's'}) from ${C.magenta(SETTINGS_PATH)}.`);
    console.log(`  ${C.dim('Claude is back to its default Anthropic settings.')}`);
  }
  console.log('');
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  const arg = (process.argv[2] || '').toLowerCase();
  banner();

  if (['uninstall', 'remove', '3'].includes(arg)) { runUninstall(); return; }

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  let choice = arg;
  if (!['1', '2', 'claude', 'desktop'].includes(choice)) {
    console.log(C.bold('  What would you like to set up?\n'));
    console.log(`    ${C.purple('[1]')} Claude            ${C.dim('· Claude Code in your terminal')}`);
    console.log(`    ${C.purple('[2]')} Claude Desktop App`);
    console.log(`    ${C.purple('[3]')} Uninstall         ${C.dim('· remove AI-Coder config')}`);
    console.log('');
    choice = (await ask(rl, C.bold('  Your choice [1]: '))).trim() || '1';
  }

  if (choice === '3' || choice === 'uninstall') {
    runUninstall();
  } else if (choice === '2' || choice === 'desktop') {
    await runSetup(rl, 'desktop');
  } else if (choice === '1' || choice === 'claude') {
    await runSetup(rl, 'cli');
  } else {
    console.log(C.yellow('  ⚠ Invalid choice. Run again and pick 1, 2 or 3.\n'));
  }

  rl.close();
}

main().catch((err) => {
  console.error(C.red(`\n  Fatal error: ${err.message}`));
  process.exit(1);
});
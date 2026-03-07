const express = require('express');
const cors = require('cors');
const { spawn } = require('child_process');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const AUTH_TOKEN = process.env.AUTH_TOKEN;
const CLAUDE_CWD = process.env.CLAUDE_CWD || '/Users/jarvis/Downloads/Projects';

// Allowed commands whitelist
const ALLOWED_COMMANDS = [
  '/ideas',
  '/waterfall',
  '/save',
  '/weekly-review',
  '/email',
  '/ig-post',
  '/skool-post',
  '/extract-units',
  '/reels-batch'
];

// Rate limiting: max 3 requests per minute
const rateLimit = {};
const RATE_LIMIT_WINDOW = 60000;
const RATE_LIMIT_MAX = 3;

function checkRateLimit(ip) {
  const now = Date.now();
  if (!rateLimit[ip]) rateLimit[ip] = [];
  rateLimit[ip] = rateLimit[ip].filter(t => now - t < RATE_LIMIT_WINDOW);
  if (rateLimit[ip].length >= RATE_LIMIT_MAX) return false;
  rateLimit[ip].push(now);
  return true;
}

app.use(cors());
app.use(express.json());

// Auth middleware
app.use('/run', (req, res, next) => {
  const token = req.headers['authorization']?.replace('Bearer ', '') || req.body.auth;
  if (!AUTH_TOKEN || token !== AUTH_TOKEN) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }
  next();
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Execute Claude Code command
app.post('/run', (req, res) => {
  const ip = req.ip;
  if (!checkRateLimit(ip)) {
    return res.status(429).json({ success: false, error: 'Rate limit exceeded. Max 3 requests per minute.' });
  }

  const { command, args } = req.body;
  if (!command) {
    return res.status(400).json({ success: false, error: 'Missing command' });
  }

  // Validate command is in whitelist
  const baseCommand = command.split(' ')[0];
  if (!ALLOWED_COMMANDS.includes(baseCommand)) {
    return res.status(403).json({ success: false, error: `Command not allowed: ${baseCommand}` });
  }

  // Sanitize args: only allow Chinese, English, numbers, spaces, basic punctuation
  const fullPrompt = args ? `${command} ${args}` : command;
  if (args && !/^[\u4e00-\u9fff\u3400-\u4dbfa-zA-Z0-9\s.,!?_\-/]+$/.test(args)) {
    return res.status(400).json({ success: false, error: 'Invalid characters in args' });
  }

  console.log(`[Bridge] Executing: ${fullPrompt}`);

  // Clean env: remove CLAUDECODE to avoid nested session detection
  const cleanEnv = { ...process.env };
  delete cleanEnv.CLAUDECODE;

  const claude = spawn('claude', ['-p', fullPrompt, '--dangerously-skip-permissions', '--mcp-config', '{"mcpServers":{}}', '--strict-mcp-config'], {
    cwd: CLAUDE_CWD,
    env: cleanEnv
  });

  let stdout = '';
  let stderr = '';
  let finished = false;

  // Manual timeout (5 min)
  const timer = setTimeout(() => {
    if (!finished) {
      console.log(`[Bridge] Timeout after 5 min, killing process`);
      claude.kill('SIGTERM');
    }
  }, 300000);

  claude.stdout.on('data', (data) => {
    const chunk = data.toString();
    stdout += chunk;
    console.log(`[Bridge] stdout chunk (${chunk.length} chars)`);
  });

  claude.stderr.on('data', (data) => {
    const chunk = data.toString();
    stderr += chunk;
    console.log(`[Bridge] stderr: ${chunk.trim()}`);
  });

  claude.on('close', (code, signal) => {
    finished = true;
    clearTimeout(timer);
    console.log(`[Bridge] Done (code ${code}, signal ${signal}), stdout: ${stdout.length}, stderr: ${stderr.length}`);
    if (code === 0) {
      res.json({ success: true, output: stdout, command: fullPrompt });
    } else {
      const errDetail = stderr || `Process exited with code ${code}` + (signal ? `, signal ${signal}` : '');
      res.json({ success: false, output: stdout, error: errDetail, command: fullPrompt });
    }
  });

  claude.on('error', (err) => {
    finished = true;
    clearTimeout(timer);
    console.error(`[Bridge] Spawn error:`, err);
    res.status(500).json({ success: false, error: err.message });
  });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[RayOS Bridge] Running on port ${PORT}`);
  console.log(`[RayOS Bridge] Allowed commands: ${ALLOWED_COMMANDS.join(', ')}`);
  console.log(`[RayOS Bridge] Claude CWD: ${CLAUDE_CWD}`);
});

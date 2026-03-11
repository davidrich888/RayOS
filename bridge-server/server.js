const express = require('express');
const cors = require('cors');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const AUTH_TOKEN = process.env.AUTH_TOKEN;
const CLAUDE_CWD = process.env.CLAUDE_CWD || '/Users/jarvis/Downloads/Projects';
const COMMANDS_DIR = path.join(CLAUDE_CWD, '.claude', 'commands');

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
  '/reels-batch',
  '/research'
];

// Expand slash command: read .md file and replace $ARGUMENTS
function expandCommand(command, args) {
  const cmdName = command.replace('/', '');
  const mdPath = path.join(COMMANDS_DIR, `${cmdName}.md`);

  try {
    let content = fs.readFileSync(mdPath, 'utf-8');
    content = content.replace(/\$ARGUMENTS/g, args || '');
    return content.trim();
  } catch (e) {
    console.log(`[Bridge] No .md file for ${command}, using raw command`);
    return args ? `${command} ${args}` : command;
  }
}

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

// YouTube subtitle extraction via youtube-transcript-api (Python)
app.get('/yt-subtitle', (req, res) => {
  const token = req.headers['authorization']?.replace('Bearer ', '') || req.query.token;
  if (!AUTH_TOKEN || token !== AUTH_TOKEN) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }

  const videoId = req.query.id;
  if (!videoId || !/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
    return res.status(400).json({ success: false, error: 'Invalid video ID' });
  }

  const { execSync } = require('child_process');
  const scriptPath = path.join(__dirname, 'fetch_subtitles.py');

  try {
    const output = execSync(`python3 "${scriptPath}" "${videoId}"`, {
      timeout: 150000,
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: '/bin/bash',
      env: { ...process.env, APIFY_API_TOKEN: process.env.APIFY_API_TOKEN || '' }
    });

    const result = JSON.parse(output.toString('utf-8'));
    console.log(`[yt-subtitle] ${videoId}: hasSubtitles=${result.hasSubtitles}, lang=${result.language || 'N/A'}, segments=${result.transcription?.length || 0}`);
    res.json(result);
  } catch (e) {
    console.error(`[yt-subtitle] Error for ${videoId}:`, e.message?.slice(0, 300));
    // Try to parse stderr for useful info
    const stderr = e.stderr?.toString('utf-8') || '';
    res.json({
      success: true,
      videoId,
      hasSubtitles: false,
      transcription: [],
      message: `Subtitle fetch failed: ${stderr.slice(0, 200) || e.message?.slice(0, 200)}`
    });
  }
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

  // Sanitize args: allow Chinese, English, numbers, spaces, CJK punctuation, common symbols
  // Block shell-dangerous chars: ` $ ; | & > < \ { } ( ) but allow fullwidth variants
  if (args && !/^[\u4e00-\u9fff\u3400-\u4dbf\u3000-\u303f\uff00-\uffef\u2010-\u2027\u2030-\u205ea-zA-Z0-9\s.,!?_\-/:'"@#%^*+=~\[\]]+$/.test(args)) {
    return res.status(400).json({ success: false, error: 'Invalid characters in args' });
  }

  // Expand slash command → full prompt from .md file
  const fullPrompt = expandCommand(command, args);
  console.log(`[Bridge] Executing: ${command} (expanded: ${fullPrompt.length} chars)`);

  // Clean env: remove CLAUDECODE to avoid nested session detection
  const cleanEnv = { ...process.env };
  delete cleanEnv.CLAUDECODE;

  const claude = spawn('claude', ['-p', fullPrompt, '--dangerously-skip-permissions'], {
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
  }, 600000); // 10 min

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

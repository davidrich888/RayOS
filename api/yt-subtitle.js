/**
 * Vercel Serverless Function: YouTube Subtitle Proxy
 *
 * Fetches YouTube video page on Vercel's infrastructure (different IP) →
 * extracts caption track URLs → fetches subtitle content → returns JSON.
 *
 * This bypasses YouTube's IP-based rate limiting on the timedtext API
 * since Vercel's edge network uses different IPs than the local machine.
 *
 * GET /api/yt-subtitle?id=VIDEO_ID&token=AUTH_TOKEN
 */

const AUTH_TOKEN = 'rayos-yt-sub-2026';

const LANG_PRIORITIES = [
  ['zh-Hant', 'zh-Hans', 'zh-TW', 'zh'],
  ['en'],
];

module.exports = async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  // Auth check
  const token = req.headers['authorization']?.replace('Bearer ', '') || req.query.token;
  if (token !== AUTH_TOKEN) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }

  const videoId = req.query.id;
  if (!videoId || !/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
    return res.status(400).json({ success: false, error: 'Invalid video ID' });
  }

  try {
    const result = await fetchSubtitles(videoId);
    return res.status(200).json(result);
  } catch (e) {
    return res.status(200).json({
      success: true,
      videoId,
      hasSubtitles: false,
      transcription: [],
      message: `Proxy error: ${e.message}`,
    });
  }
};

async function fetchSubtitles(videoId) {
  // Step 1: Fetch YouTube video page
  const pageResp = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      'Accept-Language': 'en-US,en;q=0.9,zh-TW;q=0.8',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    },
  });

  if (!pageResp.ok) {
    return noSubs(videoId, `Page fetch failed: ${pageResp.status}`);
  }

  const pageHtml = await pageResp.text();

  // Check for consent/bot detection pages
  const titleMatch = pageHtml.match(/<title>(.*?)<\/title>/);
  const pageTitle = titleMatch ? titleMatch[1] : 'unknown';
  const hasConsent = pageHtml.includes('consent.youtube.com') || pageHtml.includes('CONSENT');

  // Step 2: Extract ytInitialPlayerResponse
  const playerMatch = pageHtml.match(/var ytInitialPlayerResponse\s*=\s*/);
  if (!playerMatch) {
    return noSubs(videoId, `No player response in page (title: ${pageTitle}, len: ${pageHtml.length}, consent: ${hasConsent})`);
  }

  const startIdx = playerMatch.index + playerMatch[0].length;
  let depth = 0;
  let endIdx = startIdx;
  for (let i = startIdx; i < startIdx + 200000 && i < pageHtml.length; i++) {
    if (pageHtml[i] === '{') depth++;
    else if (pageHtml[i] === '}') depth--;
    if (depth === 0) {
      endIdx = i + 1;
      break;
    }
  }

  let playerResponse;
  try {
    playerResponse = JSON.parse(pageHtml.substring(startIdx, endIdx));
  } catch {
    return noSubs(videoId, 'Failed to parse player response');
  }

  // Step 3: Extract caption tracks
  const hasCaptions = !!playerResponse?.captions;
  const hasTracklistRenderer = !!playerResponse?.captions?.playerCaptionsTracklistRenderer;
  const tracks = playerResponse?.captions?.playerCaptionsTracklistRenderer?.captionTracks || [];
  if (tracks.length === 0) {
    const playabilityStatus = playerResponse?.playabilityStatus?.status || 'unknown';
    return noSubs(videoId, `No caption tracks (hasCaptions: ${hasCaptions}, hasRenderer: ${hasTracklistRenderer}, playability: ${playabilityStatus}, title: ${pageTitle})`);
  }

  // Step 4: Find preferred language
  let selectedTrack = null;
  for (const langGroup of LANG_PRIORITIES) {
    for (const track of tracks) {
      if (langGroup.includes(track.languageCode)) {
        selectedTrack = track;
        break;
      }
    }
    if (selectedTrack) break;
  }
  if (!selectedTrack) selectedTrack = tracks[0];

  // Step 5: Fetch subtitle content (json3 format)
  const subUrl = selectedTrack.baseUrl + '&fmt=json3';
  const subResp = await fetch(subUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      'Referer': `https://www.youtube.com/watch?v=${videoId}`,
    },
  });

  if (subResp.ok) {
    const subData = await subResp.json();
    return parseJson3(videoId, selectedTrack.languageCode, subData);
  }

  // Fallback: try XML format
  const subResp2 = await fetch(selectedTrack.baseUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      'Referer': `https://www.youtube.com/watch?v=${videoId}`,
    },
  });

  if (subResp2.ok) {
    const xmlText = await subResp2.text();
    return parseXml(videoId, selectedTrack.languageCode, xmlText);
  }

  return noSubs(videoId, `Subtitle fetch failed: ${subResp.status} (json3), ${subResp2.status} (xml)`);
}

function parseJson3(videoId, language, subData) {
  const events = (subData.events || []).filter(e => e.segs && e.segs.length > 0);
  const segments = [];
  let prevText = null;

  for (const event of events) {
    const text = event.segs.map(s => s.utf8 || '').join('').trim();
    if (text && text !== '\n' && text !== prevText) {
      segments.push({
        start: Math.round((event.tStartMs || 0) / 10) / 100,
        text,
      });
      prevText = text;
    }
  }

  if (segments.length === 0) return noSubs(videoId, 'json3 parse yielded no segments');

  const lastEvent = events[events.length - 1];
  const lengthInSeconds = Math.round((lastEvent.tStartMs + (lastEvent.dDurationMs || 0)) / 1000);

  return {
    success: true,
    videoId,
    hasSubtitles: true,
    language,
    transcription: segments,
    lengthInSeconds,
    source: 'vercel-proxy',
  };
}

function parseXml(videoId, language, xmlText) {
  const segments = [];
  const regex = /<text start="([^"]*)" dur="([^"]*)"[^>]*>([\s\S]*?)<\/text>/g;
  let match;
  let prevText = null;

  while ((match = regex.exec(xmlText)) !== null) {
    const start = parseFloat(match[1]) || 0;
    let text = match[3]
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/<[^>]+>/g, '')
      .trim();

    if (text && text !== prevText) {
      segments.push({ start: Math.round(start * 100) / 100, text });
      prevText = text;
    }
  }

  if (segments.length === 0) return noSubs(videoId, 'XML parse yielded no segments');

  return {
    success: true,
    videoId,
    hasSubtitles: true,
    language,
    transcription: segments,
    lengthInSeconds: Math.round(segments[segments.length - 1].start),
    source: 'vercel-proxy',
  };
}

function noSubs(videoId, message) {
  return {
    success: true,
    videoId,
    hasSubtitles: false,
    transcription: [],
    message,
  };
}

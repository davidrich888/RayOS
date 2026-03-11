/**
 * Cloudflare Worker: YouTube Subtitle Proxy
 *
 * Fetches YouTube video page → extracts caption track URLs →
 * fetches subtitle content → returns structured JSON.
 *
 * Runs on Cloudflare's global network (different IPs from local machine),
 * bypassing YouTube's IP-based rate limiting on timedtext API.
 */

const LANG_PRIORITIES = [
  ['zh-Hant', 'zh-Hans', 'zh-TW', 'zh'],
  ['en'],
];

export default {
  async fetch(request, env) {
    // CORS headers
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    const url = new URL(request.url);

    // Health check
    if (url.pathname === '/health') {
      return Response.json({ status: 'ok', service: 'yt-subtitle-proxy' }, { headers: corsHeaders });
    }

    // Auth check
    const token = request.headers.get('Authorization')?.replace('Bearer ', '') || url.searchParams.get('token');
    if (env.AUTH_TOKEN && token !== env.AUTH_TOKEN) {
      return Response.json({ success: false, error: 'Unauthorized' }, { status: 401, headers: corsHeaders });
    }

    // Get video ID
    const videoId = url.searchParams.get('id');
    if (!videoId || !/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
      return Response.json({ success: false, error: 'Invalid video ID' }, { status: 400, headers: corsHeaders });
    }

    try {
      const result = await fetchSubtitles(videoId);
      return Response.json(result, { headers: corsHeaders });
    } catch (e) {
      return Response.json({
        success: true,
        videoId,
        hasSubtitles: false,
        transcription: [],
        message: `Worker error: ${e.message}`,
      }, { headers: corsHeaders });
    }
  },
};

async function fetchSubtitles(videoId) {
  // Step 1: Fetch the YouTube video page
  const pageResp = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      'Accept-Language': 'en-US,en;q=0.9,zh-TW;q=0.8',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    },
  });

  if (!pageResp.ok) {
    return { success: true, videoId, hasSubtitles: false, transcription: [], message: `Page fetch failed: ${pageResp.status}` };
  }

  const pageHtml = await pageResp.text();

  // Step 2: Extract ytInitialPlayerResponse
  const playerMatch = pageHtml.match(/var ytInitialPlayerResponse\s*=\s*/);
  if (!playerMatch) {
    return { success: true, videoId, hasSubtitles: false, transcription: [], message: 'No player response in page' };
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
    return { success: true, videoId, hasSubtitles: false, transcription: [], message: 'Failed to parse player response' };
  }

  // Step 3: Extract caption tracks
  const tracks = playerResponse?.captions?.playerCaptionsTracklistRenderer?.captionTracks || [];
  if (tracks.length === 0) {
    return { success: true, videoId, hasSubtitles: false, transcription: [], message: 'No caption tracks available' };
  }

  // Step 4: Find preferred language track
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
  if (!selectedTrack) {
    selectedTrack = tracks[0]; // fallback to first available
  }

  // Step 5: Fetch subtitle content using the signed URL
  const subUrl = selectedTrack.baseUrl + '&fmt=json3';
  const subResp = await fetch(subUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      'Accept-Language': 'en-US,en;q=0.9',
      'Referer': `https://www.youtube.com/watch?v=${videoId}`,
    },
  });

  if (!subResp.ok) {
    // Try without fmt parameter (gets XML instead)
    const subResp2 = await fetch(selectedTrack.baseUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Referer': `https://www.youtube.com/watch?v=${videoId}`,
      },
    });

    if (!subResp2.ok) {
      return {
        success: true, videoId, hasSubtitles: false, transcription: [],
        message: `Subtitle fetch failed: ${subResp.status} (json3), ${subResp2.status} (xml)`,
      };
    }

    // Parse XML response
    const xmlText = await subResp2.text();
    return parseXmlSubtitles(videoId, selectedTrack.languageCode, xmlText);
  }

  // Step 6: Parse json3 format
  const subData = await subResp.json();
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

  const lengthInSeconds = segments.length > 0
    ? Math.round((events[events.length - 1].tStartMs + (events[events.length - 1].dDurationMs || 0)) / 1000)
    : 0;

  return {
    success: true,
    videoId,
    hasSubtitles: true,
    language: selectedTrack.languageCode,
    transcription: segments,
    lengthInSeconds,
    source: 'cloudflare-worker',
  };
}

function parseXmlSubtitles(videoId, language, xmlText) {
  // Simple XML parser for YouTube's subtitle format: <text start="0" dur="5.2">Hello</text>
  const segments = [];
  const regex = /<text start="([^"]*)" dur="([^"]*)"[^>]*>([\s\S]*?)<\/text>/g;
  let match;
  let prevText = null;

  while ((match = regex.exec(xmlText)) !== null) {
    const start = parseFloat(match[1]) || 0;
    // Decode HTML entities
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

  if (segments.length === 0) {
    return { success: true, videoId, hasSubtitles: false, transcription: [], message: 'XML parse yielded no segments' };
  }

  return {
    success: true,
    videoId,
    hasSubtitles: true,
    language,
    transcription: segments,
    lengthInSeconds: Math.round(segments[segments.length - 1].start),
    source: 'cloudflare-worker',
  };
}

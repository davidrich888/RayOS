/**
 * Vercel Serverless Function: YouTube Subtitle Proxy
 *
 * Fallback chain:
 *   1. YouTube watch page (free, fast)
 *   2. Innertube WEB client (free)
 *   3. youtube-nocookie.com (free)
 *   4. RapidAPI YouTube Transcriptor (paid, ~$0.001/req)
 *   5. Apify YouTube Transcripts Actor (paid, ~$0.005/video)
 *
 * Note: YouTube blocks cloud provider IPs (Vercel/AWS/GCP), so strategies
 * 1-3 may all fail. Apify (strategy 4) is the reliable fallback.
 *
 * GET /api/yt-subtitle?id=VIDEO_ID&token=AUTH_TOKEN
 */

const AUTH_TOKEN = 'rayos-yt-sub-2026';
const APIFY_TOKEN = process.env.APIFY_API_TOKEN || '';
const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY || '';

const LANG_PRIORITIES = [
  ['zh-Hant', 'zh-Hans', 'zh-TW', 'zh'],
  ['en'],
];

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ success: false, error: 'Method not allowed' });

  const token = req.headers['authorization']?.replace('Bearer ', '') || req.query.token;
  if (token !== AUTH_TOKEN) return res.status(401).json({ success: false, error: 'Unauthorized' });

  const videoId = req.query.id;
  if (!videoId || !/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
    return res.status(400).json({ success: false, error: 'Invalid video ID' });
  }

  try {
    const result = await fetchSubtitles(videoId);
    return res.status(200).json(result);
  } catch (e) {
    return res.status(200).json(noSubs(videoId, `Proxy error: ${e.message}`));
  }
};

async function fetchSubtitles(videoId) {
  // Strategy: Fetch the watch page with CONSENT cookie to bypass consent screen
  // and get player data even from cloud IPs
  const cookieValue = 'CONSENT=YES+cb; SOCS=CAISNQgDEitib3FfaWRlbnRpdHlmcm9udGVuZHVpc2VydmVyXzIwMjMwODI5LjA3X3AxGgJlbiACGgYIgJnZpwY';

  // Try multiple approaches
  const strategies = [
    () => fetchViaWatchPage(videoId, cookieValue),
    () => fetchViaInnertubePlayer(videoId),
    () => fetchViaYouTubeNoCookie(videoId, cookieValue),
  ];

  for (let i = 0; i < strategies.length; i++) {
    try {
      const result = await strategies[i]();
      if (result && result.hasSubtitles) return result;
    } catch (e) {
      // Continue to next strategy
    }
  }

  // Strategy 4: RapidAPI YouTube Transcriptor (paid, fast)
  if (RAPIDAPI_KEY) {
    try {
      const result = await fetchViaRapidAPI(videoId);
      if (result && result.hasSubtitles) return result;
    } catch (e) {
      // Fall through
    }
  }

  // Strategy 5: Apify (paid, last resort — works from any IP)
  if (APIFY_TOKEN) {
    try {
      const result = await fetchViaApify(videoId);
      if (result && result.hasSubtitles) return result;
    } catch (e) {
      // Fall through
    }
  }

  return noSubs(videoId, 'All proxy strategies failed (including RapidAPI + Apify)');
}

async function fetchViaWatchPage(videoId, cookie) {
  const resp = await fetch(`https://www.youtube.com/watch?v=${videoId}&hl=en&has_verified=1`, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Cookie': cookie,
    },
    redirect: 'follow',
  });

  if (!resp.ok) return null;
  const html = await resp.text();

  // Extract ytInitialPlayerResponse
  const match = html.match(/var ytInitialPlayerResponse\s*=\s*/);
  if (!match) return null;

  const startIdx = match.index + match[0].length;
  let depth = 0, endIdx = startIdx;
  for (let i = startIdx; i < startIdx + 200000 && i < html.length; i++) {
    if (html[i] === '{') depth++;
    else if (html[i] === '}') depth--;
    if (depth === 0) { endIdx = i + 1; break; }
  }

  const player = JSON.parse(html.substring(startIdx, endIdx));
  const status = player?.playabilityStatus?.status;
  if (status === 'LOGIN_REQUIRED') return null;

  const tracks = player?.captions?.playerCaptionsTracklistRenderer?.captionTracks || [];
  if (tracks.length === 0) return null;

  return await fetchFromTracks(videoId, tracks, cookie);
}

async function fetchViaInnertubePlayer(videoId) {
  // Use Innertube /player endpoint (ANDROID client bypasses some restrictions)
  const resp = await fetch('https://www.youtube.com/youtubei/v1/player?prettyPrint=false', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': 'com.google.android.youtube/19.09.37 (Linux; U; Android 11) gzip',
      'X-Youtube-Client-Name': '3',
      'X-Youtube-Client-Version': '19.09.37',
    },
    body: JSON.stringify({
      context: {
        client: {
          clientName: 'ANDROID',
          clientVersion: '19.09.37',
          androidSdkVersion: 30,
          hl: 'en',
          gl: 'US',
        },
      },
      videoId,
      contentCheckOk: true,
      racyCheckOk: true,
    }),
  });

  if (!resp.ok) return null;
  const data = await resp.json();

  const tracks = data?.captions?.playerCaptionsTracklistRenderer?.captionTracks || [];
  if (tracks.length === 0) return null;

  return await fetchFromTracks(videoId, tracks);
}

async function fetchViaYouTubeNoCookie(videoId, cookie) {
  // Try youtube-nocookie.com (privacy-enhanced mode, sometimes less restricted)
  const resp = await fetch(`https://www.youtube-nocookie.com/watch?v=${videoId}&hl=en`, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      'Accept-Language': 'en-US,en;q=0.9',
      'Cookie': cookie,
    },
    redirect: 'follow',
  });

  if (!resp.ok) return null;
  const html = await resp.text();

  const match = html.match(/var ytInitialPlayerResponse\s*=\s*/);
  if (!match) return null;

  const startIdx = match.index + match[0].length;
  let depth = 0, endIdx = startIdx;
  for (let i = startIdx; i < startIdx + 200000 && i < html.length; i++) {
    if (html[i] === '{') depth++;
    else if (html[i] === '}') depth--;
    if (depth === 0) { endIdx = i + 1; break; }
  }

  const player = JSON.parse(html.substring(startIdx, endIdx));
  const tracks = player?.captions?.playerCaptionsTracklistRenderer?.captionTracks || [];
  if (tracks.length === 0) return null;

  return await fetchFromTracks(videoId, tracks, cookie);
}

async function fetchFromTracks(videoId, tracks, cookie) {
  // Find preferred language track
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

  // Fetch subtitle content
  const fetchHeaders = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'Referer': `https://www.youtube.com/watch?v=${videoId}`,
  };
  if (cookie) fetchHeaders['Cookie'] = cookie;

  // Try json3 format
  const subResp = await fetch(selectedTrack.baseUrl + '&fmt=json3', { headers: fetchHeaders });
  if (subResp.ok) {
    const data = await subResp.json();
    return parseJson3(videoId, selectedTrack.languageCode, data);
  }

  // Try XML format
  const subResp2 = await fetch(selectedTrack.baseUrl, { headers: fetchHeaders });
  if (subResp2.ok) {
    const xml = await subResp2.text();
    if (!xml.includes('<html')) return parseXml(videoId, selectedTrack.languageCode, xml);
  }

  return noSubs(videoId, `Caption URL returned ${subResp.status}`);
}

function parseJson3(videoId, language, subData) {
  const events = (subData.events || []).filter(e => e.segs && e.segs.length > 0);
  const segments = [];
  let prevText = null;

  for (const event of events) {
    const text = event.segs.map(s => s.utf8 || '').join('').trim();
    if (text && text !== '\n' && text !== prevText) {
      segments.push({ start: Math.round((event.tStartMs || 0) / 10) / 100, text });
      prevText = text;
    }
  }

  if (segments.length === 0) return noSubs(videoId, 'json3 yielded no segments');

  const lastEvent = events[events.length - 1];
  return {
    success: true, videoId, hasSubtitles: true, language,
    transcription: segments,
    lengthInSeconds: Math.round((lastEvent.tStartMs + (lastEvent.dDurationMs || 0)) / 1000),
    source: 'vercel-proxy',
  };
}

function parseXml(videoId, language, xmlText) {
  const segments = [];
  const regex = /<text start="([^"]*)" dur="([^"]*)"[^>]*>([\s\S]*?)<\/text>/g;
  let match, prevText = null;

  while ((match = regex.exec(xmlText)) !== null) {
    const start = parseFloat(match[1]) || 0;
    let text = match[3]
      .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/<[^>]+>/g, '')
      .trim();
    if (text && text !== prevText) {
      segments.push({ start: Math.round(start * 100) / 100, text });
      prevText = text;
    }
  }

  if (segments.length === 0) return noSubs(videoId, 'XML yielded no segments');

  return {
    success: true, videoId, hasSubtitles: true, language,
    transcription: segments,
    lengthInSeconds: Math.round(segments[segments.length - 1].start),
    source: 'vercel-proxy',
  };
}

async function fetchViaRapidAPI(videoId) {
  const langs = ['zh-Hant', 'en', 'zh', 'ja'];
  for (const lang of langs) {
    try {
      const resp = await fetch(
        `https://youtube-transcriptor.p.rapidapi.com/transcript?video_id=${videoId}&lang=${lang}`,
        {
          headers: {
            'x-rapidapi-host': 'youtube-transcriptor.p.rapidapi.com',
            'x-rapidapi-key': RAPIDAPI_KEY,
          },
          signal: AbortSignal.timeout(30000),
        }
      );
      if (!resp.ok) continue;
      const data = await resp.json();

      // Parse response — array of transcript objects
      const items = Array.isArray(data) ? data : [data];
      for (const item of items) {
        if (typeof item !== 'object' || !item) continue;
        const segs = item.transcription || item.subtitles || [];
        if (!Array.isArray(segs) || segs.length === 0) continue;

        const segments = segs
          .filter(s => s && (s.subtitle || s.text))
          .map(s => ({
            start: Math.round(parseFloat(s.start || s.startTime || 0) * 100) / 100,
            text: (s.subtitle || s.text || '').trim(),
          }))
          .filter(s => s.text);

        if (segments.length > 0) {
          const last = segments[segments.length - 1];
          return {
            success: true, videoId, hasSubtitles: true, language: lang,
            transcription: segments,
            lengthInSeconds: Math.round(last.start),
            source: 'rapidapi',
          };
        }
      }
    } catch (e) {
      continue;
    }
  }
  return null;
}

async function fetchViaApify(videoId) {
  const resp = await fetch(
    'https://api.apify.com/v2/acts/karamelo~youtube-transcripts/run-sync-get-dataset-items',
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${APIFY_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        urls: [`https://www.youtube.com/watch?v=${videoId}`],
        outputFormat: 'captions',
        maxRetries: 3,
      }),
      signal: AbortSignal.timeout(55000), // Vercel function timeout ~60s
    }
  );

  if (!resp.ok) return null;
  const items = await resp.json();
  if (!items || items.length === 0) return null;

  const item = items[0];
  const captions = item.captions || item.transcript || [];
  const language = item.language || item.lang || 'unknown';

  if (typeof captions === 'string' && captions.length > 0) {
    return {
      success: true, videoId, hasSubtitles: true, language,
      transcription: [{ start: 0, text: captions }],
      lengthInSeconds: 0, source: 'apify',
    };
  }

  if (Array.isArray(captions) && captions.length > 0) {
    const segments = captions
      .filter(c => c && (c.text || c.content))
      .map(c => ({
        start: Math.round((parseFloat(c.start || c.offset || c.startTime || 0)) * 100) / 100,
        text: (c.text || c.content || '').trim(),
      }))
      .filter(s => s.text);

    if (segments.length > 0) {
      const last = segments[segments.length - 1];
      return {
        success: true, videoId, hasSubtitles: true, language,
        transcription: segments,
        lengthInSeconds: Math.round(last.start),
        source: 'apify',
      };
    }
  }

  return null;
}

function noSubs(videoId, message) {
  return { success: true, videoId, hasSubtitles: false, transcription: [], message };
}

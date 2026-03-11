"""YouTube Subtitle Proxy — Fly.io deployment.

Fetches YouTube video page → extracts signed caption URLs →
fetches subtitle content → returns structured JSON.

All requests happen from Fly.io's IP (not blocked by YouTube).
"""
import json
import os
import re
from http.server import HTTPServer, BaseHTTPRequestHandler
from http.cookiejar import CookieJar
from urllib.parse import urlparse, parse_qs
from urllib.request import Request, urlopen, build_opener, HTTPCookieProcessor
from urllib.error import HTTPError

AUTH_TOKEN = os.environ.get('AUTH_TOKEN', 'rayos-yt-sub-2026')
PORT = int(os.environ.get('PORT', '8080'))

LANG_PRIORITIES = [
    ['zh-Hant', 'zh-Hans', 'zh-TW', 'zh'],
    ['en'],
]

HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
}

CONSENT_COOKIE = 'CONSENT=YES+cb; SOCS=CAISNQgDEitib3FfaWRlbnRpdHlmcm9udGVuZHVpc2VydmVyXzIwMjMwODI5LjA3X3AxGgJlbiACGgYIgJnZpwY'


def http_get(url: str, extra_headers: dict = None) -> tuple:
    """Simple HTTP GET, returns (status, body_str)."""
    headers = dict(HEADERS)
    if extra_headers:
        headers.update(extra_headers)
    req = Request(url, headers=headers)
    try:
        resp = urlopen(req, timeout=15)
        return resp.status, resp.read().decode('utf-8', errors='replace')
    except HTTPError as e:
        return e.code, e.read().decode('utf-8', errors='replace') if e.fp else ''
    except Exception as e:
        return 0, str(e)


def fetch_subtitles(video_id: str) -> dict:
    # Step 1: Fetch YouTube watch page with consent cookie
    url = f'https://www.youtube.com/watch?v={video_id}&hl=en'
    status, html = http_get(url, {'Cookie': CONSENT_COOKIE})

    if status != 200:
        return no_subs(video_id, f'Page fetch HTTP {status}')

    # Step 2: Extract ytInitialPlayerResponse
    match = re.search(r'var ytInitialPlayerResponse\s*=\s*', html)
    if not match:
        title_m = re.search(r'<title>(.*?)</title>', html)
        title = title_m.group(1) if title_m else 'unknown'
        return no_subs(video_id, f'No player response (title: {title}, len: {len(html)})')

    start = match.end()
    depth = 0
    end = start
    for i, c in enumerate(html[start:start + 200000]):
        if c == '{':
            depth += 1
        elif c == '}':
            depth -= 1
        if depth == 0:
            end = start + i + 1
            break

    try:
        player = json.loads(html[start:end])
    except json.JSONDecodeError:
        return no_subs(video_id, 'Failed to parse player response')

    playability = player.get('playabilityStatus', {}).get('status', 'unknown')
    if playability == 'LOGIN_REQUIRED':
        return no_subs(video_id, f'LOGIN_REQUIRED from Fly.io IP')

    # Step 3: Extract caption tracks
    tracks = (player.get('captions') or {}).get('playerCaptionsTracklistRenderer', {}).get('captionTracks', [])
    if not tracks:
        return no_subs(video_id, f'No caption tracks (playability: {playability})')

    # Step 4: Find preferred language
    selected = None
    for lang_group in LANG_PRIORITIES:
        for track in tracks:
            if track.get('languageCode') in lang_group:
                selected = track
                break
        if selected:
            break
    if not selected:
        selected = tracks[0]

    # Step 5: Fetch subtitle content
    # Try multiple formats: json3 first, then srv3, then default (xml)
    base_url = selected['baseUrl']

    # First try: default format (usually XML/srv1)
    sub_status, sub_body = http_get(base_url, {
        'Cookie': CONSENT_COOKIE,
        'Referer': f'https://www.youtube.com/watch?v={video_id}',
    })

    if sub_status == 200 and sub_body.strip() and '<text' in sub_body:
        result = parse_xml(video_id, selected['languageCode'], sub_body)
        if result.get('hasSubtitles'):
            return result

    # Second try: json3 format
    sub_url = base_url + '&fmt=json3'
    sub_status, sub_body = http_get(sub_url, {
        'Cookie': CONSENT_COOKIE,
        'Referer': f'https://www.youtube.com/watch?v={video_id}',
    })

    if sub_status == 200:
        if sub_body.strip().startswith('<'):
            # Got HTML instead of JSON - might be error page
            return no_subs(video_id, f'json3 returned HTML (len: {len(sub_body)}, preview: {sub_body[:100]})')
        try:
            sub_data = json.loads(sub_body)
            events = sub_data.get('events', [])
            events_with_segs = [e for e in events if e.get('segs')]
            if not events_with_segs:
                return no_subs(video_id, f'json3 parsed but 0 events with segs (total events: {len(events)}, keys: {list(sub_data.keys())[:5]})')
            result = parse_json3(video_id, selected['languageCode'], sub_data)
            if result.get('hasSubtitles'):
                return result
            return no_subs(video_id, f'json3 parse returned no segments from {len(events_with_segs)} events')
        except json.JSONDecodeError as e:
            return no_subs(video_id, f'json3 decode error: {e}, preview: {sub_body[:100]}')

    # Third try: srv3 format
    sub_url3 = base_url + '&fmt=srv3'
    sub_status3, sub_body3 = http_get(sub_url3, {
        'Cookie': CONSENT_COOKIE,
        'Referer': f'https://www.youtube.com/watch?v={video_id}',
    })

    if sub_status3 == 200 and sub_body3.strip() and '<' in sub_body3:
        result = parse_xml(video_id, selected['languageCode'], sub_body3)
        if result.get('hasSubtitles'):
            return result

    return no_subs(video_id, f'All formats failed. Default: {sub_status}(len:{len(sub_body) if sub_body else 0}), json3: {sub_status}(len:{len(sub_body) if sub_body else 0}), srv3: {sub_status3}(len:{len(sub_body3) if sub_body3 else 0})')


def parse_json3(video_id: str, language: str, data: dict) -> dict:
    events = [e for e in data.get('events', []) if e.get('segs')]
    segments = []
    prev = None
    for e in events:
        text = ''.join(s.get('utf8', '') for s in e['segs']).strip()
        if text and text != '\n' and text != prev:
            segments.append({
                'start': round((e.get('tStartMs', 0)) / 1000, 2),
                'text': text,
            })
            prev = text

    if not segments:
        return no_subs(video_id, 'json3 yielded no segments')

    last_e = events[-1]
    return {
        'success': True, 'videoId': video_id, 'hasSubtitles': True,
        'language': language, 'transcription': segments,
        'lengthInSeconds': round((last_e.get('tStartMs', 0) + last_e.get('dDurationMs', 0)) / 1000),
        'source': 'fly-proxy',
    }


def parse_xml(video_id: str, language: str, xml_text: str) -> dict:
    segments = []
    prev = None
    for m in re.finditer(r'<text start="([^"]*)" dur="([^"]*)"[^>]*>([\s\S]*?)</text>', xml_text):
        start = float(m.group(1) or 0)
        text = (m.group(3)
                .replace('&amp;', '&').replace('&lt;', '<').replace('&gt;', '>')
                .replace('&quot;', '"').replace('&#39;', "'"))
        text = re.sub(r'<[^>]+>', '', text).strip()
        if text and text != prev:
            segments.append({'start': round(start, 2), 'text': text})
            prev = text

    if not segments:
        return no_subs(video_id, 'XML yielded no segments')

    return {
        'success': True, 'videoId': video_id, 'hasSubtitles': True,
        'language': language, 'transcription': segments,
        'lengthInSeconds': round(segments[-1]['start']),
        'source': 'fly-proxy',
    }


def no_subs(video_id: str, message: str) -> dict:
    return {'success': True, 'videoId': video_id, 'hasSubtitles': False,
            'transcription': [], 'message': message}


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        parsed = urlparse(self.path)
        params = parse_qs(parsed.query)

        if parsed.path == '/health':
            self._json(200, {'status': 'ok', 'service': 'yt-subtitle-fly'})
            return

        # Auth
        token = params.get('token', [None])[0]
        auth_header = self.headers.get('Authorization', '')
        if auth_header.startswith('Bearer '):
            token = auth_header[7:]
        if token != AUTH_TOKEN:
            self._json(401, {'success': False, 'error': 'Unauthorized'})
            return

        video_id = params.get('id', [None])[0]
        if not video_id or not re.match(r'^[a-zA-Z0-9_-]{11}$', video_id):
            self._json(400, {'success': False, 'error': 'Invalid video ID'})
            return

        result = fetch_subtitles(video_id)
        self._json(200, result)

    def _json(self, status: int, data: dict):
        body = json.dumps(data, ensure_ascii=False).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, fmt, *args):
        print(f'[{self.address_string()}] {fmt % args}')


if __name__ == '__main__':
    print(f'Starting yt-subtitle-fly on port {PORT}')
    server = HTTPServer(('0.0.0.0', PORT), Handler)
    server.serve_forever()

#!/usr/bin/env python3
"""Fetch YouTube subtitles with multi-layer fallback.
Called by bridge-server/server.js as a subprocess.

Fallback chain:
  1. youtube-transcript-api (free, fast)
  2. Apify YouTube Transcript Actor (paid ~$0.005/video, 99.5%+ success rate)

Usage: python3 fetch_subtitles.py <video_id>
Output: JSON to stdout
"""
import sys
import json
import os
import time
from typing import Optional

APIFY_API_TOKEN = os.environ.get('APIFY_API_TOKEN', '')
VERCEL_PROXY_URL = os.environ.get('VERCEL_PROXY_URL', 'https://ray-os.vercel.app/api/yt-subtitle')
VERCEL_PROXY_TOKEN = os.environ.get('VERCEL_PROXY_TOKEN', 'rayos-yt-sub-2026')

LANG_PRIORITIES = [
    ['zh-Hant', 'zh-Hans', 'zh-TW', 'zh'],
    ['en'],
]


def _dedup_segments(segments: list) -> list:
    """Remove consecutive identical text segments."""
    deduped = []
    prev_text = None
    for seg in segments:
        if seg['text'] and seg['text'] != prev_text:
            deduped.append(seg)
            prev_text = seg['text']
    return deduped


def _format_result(video_id: str, language: str, segments: list, source: str) -> dict:
    """Format segments into standard output."""
    deduped = _dedup_segments(segments)
    length = round(deduped[-1]['start'] + deduped[-1].get('duration', 0)) if deduped else 0
    return {
        'success': True,
        'videoId': video_id,
        'hasSubtitles': True,
        'language': language,
        'transcription': [{'start': s['start'], 'text': s['text']} for s in deduped],
        'lengthInSeconds': length,
        'source': source,
    }


def _is_ip_blocked(error: Exception) -> bool:
    """Check if the error indicates an IP block by YouTube."""
    err_str = str(error).lower()
    return any(kw in err_str for kw in ['ip', 'blocked', '429', 'too many requests', 'requestblocked'])


def fetch_via_transcript_api(video_id: str) -> Optional[dict]:
    """Layer 1: youtube-transcript-api (free, fast)."""
    try:
        from youtube_transcript_api import YouTubeTranscriptApi
    except ImportError:
        return None

    api = YouTubeTranscriptApi()

    for langs in LANG_PRIORITIES:
        try:
            transcript = api.fetch(video_id, languages=langs)
            segments = [{
                'start': round(s.start, 2),
                'text': s.text.strip(),
                'duration': round(s.duration, 2),
            } for s in transcript.snippets]
            return _format_result(video_id, transcript.language, segments, 'youtube-transcript-api')
        except Exception as e:
            if _is_ip_blocked(e):
                print(f'[Layer 1] IP blocked, skipping remaining languages', file=sys.stderr)
                return None
            continue

    # Try any available language
    try:
        transcript_list = api.list(video_id)
        for t in transcript_list:
            try:
                transcript = api.fetch(video_id, languages=[t.language_code])
                segments = [{
                    'start': round(s.start, 2),
                    'text': s.text.strip(),
                    'duration': round(s.duration, 2),
                } for s in transcript.snippets]
                return _format_result(video_id, transcript.language, segments, 'youtube-transcript-api')
            except Exception:
                continue
    except Exception as e:
        if _is_ip_blocked(e):
            return None

    return None


def fetch_via_apify(video_id: str) -> Optional[dict]:
    """Layer 2: Apify YouTube Transcript Actor (paid, reliable)."""
    if not APIFY_API_TOKEN:
        print('[Layer 3] No APIFY_API_TOKEN, skipping', file=sys.stderr)
        return None

    import requests

    actor_id = 'karamelo~youtube-transcripts'
    url = f'https://api.apify.com/v2/acts/{actor_id}/run-sync-get-dataset-items'

    try:
        resp = requests.post(
            url,
            headers={
                'Authorization': f'Bearer {APIFY_API_TOKEN}',
                'Content-Type': 'application/json',
            },
            json={
                'urls': [f'https://www.youtube.com/watch?v={video_id}'],
                'outputFormat': 'captions',
                'maxRetries': 3,
            },
            timeout=120,
        )

        if resp.status_code != 200:
            print(f'[Layer 3] Apify HTTP {resp.status_code}: {resp.text[:200]}', file=sys.stderr)
            return None

        items = resp.json()
        if not items or len(items) == 0:
            print('[Layer 3] Apify returned empty result', file=sys.stderr)
            return None

        item = items[0]

        # Parse Apify response format
        captions = item.get('captions') or item.get('transcript') or []
        language = item.get('language', item.get('lang', 'unknown'))

        if isinstance(captions, str):
            # Plain text transcript - no timestamps
            return {
                'success': True,
                'videoId': video_id,
                'hasSubtitles': True,
                'language': language,
                'transcription': [{'start': 0, 'text': captions}],
                'lengthInSeconds': 0,
                'source': 'apify',
            }

        if isinstance(captions, list) and len(captions) > 0:
            segments = []
            for c in captions:
                if isinstance(c, dict):
                    text = c.get('text', c.get('content', '')).strip()
                    start = c.get('start', c.get('offset', c.get('startTime', 0)))
                    duration = c.get('duration', c.get('dur', 0))
                    if isinstance(start, str):
                        try:
                            start = float(start)
                        except ValueError:
                            start = 0
                    if text:
                        segments.append({
                            'start': round(float(start), 2),
                            'text': text,
                            'duration': round(float(duration), 2) if duration else 0,
                        })
                elif isinstance(c, str) and c.strip():
                    segments.append({'start': 0, 'text': c.strip(), 'duration': 0})

            if segments:
                return _format_result(video_id, language, segments, 'apify')

        print(f'[Layer 3] Apify response has no usable captions. Keys: {list(item.keys())}', file=sys.stderr)
        return None

    except requests.Timeout:
        print('[Layer 3] Apify timeout (120s)', file=sys.stderr)
        return None
    except Exception as e:
        print(f'[Layer 3] Apify error: {e}', file=sys.stderr)
        return None


def fetch_via_vercel_proxy(video_id: str) -> Optional[dict]:
    """Layer 2: Vercel serverless proxy (free, different IP)."""
    if not VERCEL_PROXY_URL:
        print('[Layer 2] No VERCEL_PROXY_URL, skipping', file=sys.stderr)
        return None

    import requests

    try:
        resp = requests.get(
            VERCEL_PROXY_URL,
            params={'id': video_id, 'token': VERCEL_PROXY_TOKEN},
            timeout=30,
        )

        if resp.status_code != 200:
            print(f'[Layer 2] Vercel proxy HTTP {resp.status_code}', file=sys.stderr)
            return None

        data = resp.json()
        if data.get('hasSubtitles') and data.get('transcription'):
            data['source'] = 'vercel-proxy'
            return data

        print(f'[Layer 2] Vercel proxy: {data.get("message", "no subtitles")}', file=sys.stderr)
        return None

    except Exception as e:
        print(f'[Layer 2] Vercel proxy error: {e}', file=sys.stderr)
        return None


def fetch(video_id: str) -> dict:
    """Main fetch function with multi-layer fallback.

    Chain:
      1. youtube-transcript-api (free, fast, local)
      2. Vercel serverless proxy (free, different IP)
      3. Apify (paid, last resort)
    """

    # Layer 1: youtube-transcript-api (free)
    print(f'[fetch] Trying Layer 1: youtube-transcript-api for {video_id}', file=sys.stderr)
    result = fetch_via_transcript_api(video_id)
    if result:
        print(f'[fetch] Layer 1 success: {len(result["transcription"])} segments', file=sys.stderr)
        return result

    # Layer 2: Vercel proxy (free, different IP)
    print(f'[fetch] Layer 1 failed, trying Layer 2: Vercel proxy', file=sys.stderr)
    result = fetch_via_vercel_proxy(video_id)
    if result:
        print(f'[fetch] Layer 2 success: {len(result["transcription"])} segments', file=sys.stderr)
        return result

    # Layer 3: Apify (paid fallback)
    print(f'[fetch] Layer 2 failed, trying Layer 3: Apify', file=sys.stderr)
    result = fetch_via_apify(video_id)
    if result:
        print(f'[fetch] Layer 3 success: {len(result["transcription"])} segments', file=sys.stderr)
        return result

    # All layers failed
    print(f'[fetch] All layers failed for {video_id}', file=sys.stderr)
    return {
        'success': True,
        'videoId': video_id,
        'hasSubtitles': False,
        'transcription': [],
        'message': 'All subtitle fetch methods failed (L1: IP blocked, L2: Vercel proxy failed, L3: Apify failed)',
    }


if __name__ == '__main__':
    if len(sys.argv) != 2:
        print(json.dumps({'success': False, 'error': 'Usage: fetch_subtitles.py <video_id>'}))
        sys.exit(1)

    video_id = sys.argv[1]
    import re
    if not re.match(r'^[a-zA-Z0-9_-]{11}$', video_id):
        print(json.dumps({'success': False, 'error': 'Invalid video ID'}))
        sys.exit(1)

    result = fetch(video_id)
    print(json.dumps(result, ensure_ascii=False))

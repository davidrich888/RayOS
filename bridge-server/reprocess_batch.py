#!/usr/bin/env python3
"""Batch reprocess YouTube videos using Apify batch subtitle fetch.
Step 1: Query Notion for videos with bad highlights
Step 2: Batch fetch subtitles via Apify (one call, many URLs)
Step 3: Generate AI summaries for videos that have subtitles
Step 4: Update Notion
"""
import json
import os
import re
import sys
import time
import requests

ANTHROPIC_API_KEY = os.environ.get('ANTHROPIC_API_KEY', '')
NOTION_TOKEN = os.environ.get('NOTION_TOKEN', '')
APIFY_API_TOKEN = os.environ.get('APIFY_API_TOKEN', '')
NOTION_DB_ID = '76fb8600-ae96-49bc-b6c4-75f75f0ec818'

GOOD_HIGHLIGHT_RE = re.compile(r'^\d+:\d+\s*[-–]\s*.+', re.MULTILINE)


def fetch_all_videos() -> list:
    """Fetch all videos from Notion YouTube 研究庫."""
    videos = []
    next_cursor = None
    while True:
        body = {'page_size': 100}
        if next_cursor:
            body['start_cursor'] = next_cursor
        resp = requests.post(
            f'https://api.notion.com/v1/databases/{NOTION_DB_ID}/query',
            headers={'Authorization': f'Bearer {NOTION_TOKEN}', 'Notion-Version': '2022-06-28', 'Content-Type': 'application/json'},
            json=body, timeout=15,
        )
        if resp.status_code != 200:
            break
        data = resp.json()
        for page in data['results']:
            props = page['properties']
            title = props.get('影片標題', {}).get('title', [{}])
            title = title[0]['plain_text'] if title else ''
            url = props.get('網址', {}).get('url', '') or ''
            channel_rt = props.get('頻道', {}).get('rich_text', [])
            channel = channel_rt[0]['plain_text'] if channel_rt else ''
            hl_rt = props.get('精華片段', {}).get('rich_text', [])
            highlights = hl_rt[0]['plain_text'] if hl_rt else ''
            videos.append({
                'page_id': page['id'], 'title': title, 'url': url,
                'channel': channel, 'highlights': highlights,
            })
        if not data.get('has_more'):
            break
        next_cursor = data['next_cursor']
    return videos


def extract_video_id(url: str) -> str:
    if not url:
        return ''
    m = re.search(r'(?:v=|youtu\.be/|shorts/|embed/)([a-zA-Z0-9_-]{11})', url)
    return m.group(1) if m else ''


def has_good_highlights(highlights: str) -> bool:
    if not highlights:
        return False
    # Highlights with <br> are malformed — each line should be separate
    if '<br>' in highlights:
        return False
    return bool(GOOD_HIGHLIGHT_RE.search(highlights))


def batch_fetch_subtitles_apify(video_ids: list) -> dict:
    """Fetch subtitles for multiple videos in one Apify call.
    Returns dict: {video_id: timestamped_text} for videos that have subtitles.
    """
    urls = [f'https://www.youtube.com/watch?v={vid}' for vid in video_ids]
    print(f'  Sending {len(urls)} URLs to Apify...')

    resp = requests.post(
        f'https://api.apify.com/v2/acts/karamelo~youtube-transcripts/run-sync-get-dataset-items?token={APIFY_API_TOKEN}',
        json={'urls': urls, 'outputFormat': 'textWithTimestamps'},
        timeout=300,  # 5 min for batch
    )

    if resp.status_code not in (200, 201):
        print(f'  Apify error: {resp.status_code}')
        return {}

    try:
        items = resp.json()
    except Exception:
        return {}

    if not isinstance(items, list):
        return {}

    results = {}
    for item in items:
        vid = item.get('videoId', '')
        if not vid:
            continue
        captions = item.get('captions') or []
        captions = [c for c in captions if c is not None]
        if not captions:
            continue

        # Format with timestamps
        lines = []
        for cap in captions:
            start = cap.get('start', 0)
            text = cap.get('text', '').strip()
            if not text:
                continue
            mins = int(start // 60)
            secs = int(start % 60)
            lines.append(f'[{mins}:{secs:02d}] {text}')

        if lines:
            results[vid] = '\n'.join(lines)

    return results


def generate_ai_summary(title: str, channel: str, transcript: str) -> dict:
    truncated = transcript[:8000]
    prompt = f"""你是 Ray 的 YouTube 研究庫助手。請分析以下影片字幕，用繁體中文回覆。

影片標題：{title}
頻道：{channel}

字幕內容：
{truncated}

請提供以下四個欄位（用 JSON 格式回覆，key 用英文）：

1. "summary" — AI 摘要（5 個重點，每點一句話，用 <br> 分隔）
2. "one_liner" — 一句話學到（最核心的一個收穫，一句話）
3. "highlights" — 精華片段（3-5 個關鍵段落重點，格式：「時間碼 - 重點描述」，每段用換行分隔（不要用 <br>）。時間碼從字幕中取最接近的時間點，格式 M:SS 或 MM:SS，例如 "2:15 - 解釋風控的核心邏輯"）
4. "priority" — 優先度建議（"🔥 必看" / "⭐ 重要" / "📌 一般" 三選一）

只回覆 JSON，不要其他文字。"""

    resp = requests.post(
        'https://api.anthropic.com/v1/messages',
        headers={'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json'},
        json={'model': 'claude-haiku-4-5-20251001', 'max_tokens': 1024, 'messages': [{'role': 'user', 'content': prompt}]},
        timeout=30,
    )
    if resp.status_code != 200:
        return None
    content = resp.json()['content'][0]['text']
    try:
        json_match = re.search(r'\{[\s\S]*\}', content)
        if json_match:
            return json.loads(json_match.group())
    except json.JSONDecodeError:
        pass
    return None


def update_notion(page_id: str, ai_data: dict) -> bool:
    properties = {
        'AI 摘要': {'rich_text': [{'type': 'text', 'text': {'content': ai_data['summary'][:2000]}}]},
        '一句話學到': {'rich_text': [{'type': 'text', 'text': {'content': ai_data['one_liner'][:2000]}}]},
        '精華片段': {'rich_text': [{'type': 'text', 'text': {'content': ai_data['highlights'][:2000]}}]},
    }
    if ai_data.get('priority'):
        properties['優先度'] = {'select': {'name': ai_data['priority']}}

    resp = requests.patch(
        f'https://api.notion.com/v1/pages/{page_id}',
        headers={'Authorization': f'Bearer {NOTION_TOKEN}', 'Notion-Version': '2022-06-28', 'Content-Type': 'application/json'},
        json={'properties': properties}, timeout=15,
    )
    return resp.status_code == 200


def main():
    if not ANTHROPIC_API_KEY or not NOTION_TOKEN or not APIFY_API_TOKEN:
        print('ERROR: Missing env vars (ANTHROPIC_API_KEY, NOTION_TOKEN, APIFY_API_TOKEN)')
        sys.exit(1)

    # Step 1: Get videos with bad highlights
    print('Step 1: Fetching all videos from Notion...')
    all_videos = fetch_all_videos()
    print(f'Total: {len(all_videos)}')

    bad_videos = []
    for v in all_videos:
        vid = extract_video_id(v['url'])
        if vid and not has_good_highlights(v['highlights']):
            bad_videos.append({**v, 'video_id': vid})
    print(f'Need reprocessing: {len(bad_videos)}')

    if not bad_videos:
        print('Nothing to do!')
        return

    # Step 2: Batch fetch subtitles via Apify (batches of 50)
    print('\nStep 2: Batch fetching subtitles via Apify...')
    all_subs = {}
    batch_size = 50
    video_ids = [v['video_id'] for v in bad_videos]

    for i in range(0, len(video_ids), batch_size):
        batch = video_ids[i:i + batch_size]
        print(f'\n  Batch {i // batch_size + 1}: {len(batch)} videos')
        subs = batch_fetch_subtitles_apify(batch)
        print(f'  Got subtitles for {len(subs)}/{len(batch)} videos')
        all_subs.update(subs)
        if i + batch_size < len(video_ids):
            time.sleep(5)

    print(f'\nTotal with subtitles: {len(all_subs)}/{len(bad_videos)}')

    if not all_subs:
        print('No subtitles found for any video!')
        return

    # Step 3 & 4: Generate AI summaries and update Notion
    print('\nStep 3: Generating AI summaries and updating Notion...')
    success_count = 0
    fail_count = 0

    videos_with_subs = [v for v in bad_videos if v['video_id'] in all_subs]
    for i, v in enumerate(videos_with_subs):
        print(f'\n  [{i+1}/{len(videos_with_subs)}] {v["title"][:50]}...')

        transcript = all_subs[v['video_id']]
        ai_data = generate_ai_summary(v['title'], v['channel'], transcript)
        if not ai_data:
            print('    FAIL: AI summary')
            fail_count += 1
            continue

        ok = update_notion(v['page_id'], ai_data)
        if ok:
            print(f'    ✅ {ai_data.get("one_liner", "")[:50]}')
            success_count += 1
        else:
            print('    ❌ Notion update failed')
            fail_count += 1

        time.sleep(0.5)

    print(f'\n=== COMPLETE ===')
    print(f'Total bad: {len(bad_videos)} | Had subtitles: {len(all_subs)} | Success: {success_count} | Failed: {fail_count} | No subs: {len(bad_videos) - len(all_subs)}')


if __name__ == '__main__':
    main()

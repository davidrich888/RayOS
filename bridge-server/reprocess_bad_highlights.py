#!/usr/bin/env python3
"""Scan YouTube 研究庫 for videos with bad highlights and reprocess them.
Bad = no proper "M:SS - description" format in highlights field.
"""
import json
import os
import re
import sys
import time
import requests

ANTHROPIC_API_KEY = os.environ.get('ANTHROPIC_API_KEY', '')
NOTION_TOKEN = os.environ.get('NOTION_TOKEN', '')
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
            headers={
                'Authorization': f'Bearer {NOTION_TOKEN}',
                'Notion-Version': '2022-06-28',
                'Content-Type': 'application/json',
            },
            json=body,
            timeout=15,
        )

        if resp.status_code != 200:
            print(f'Notion query error: {resp.status_code}')
            break

        data = resp.json()
        for page in data['results']:
            props = page['properties']
            title = ''
            if props.get('影片標題', {}).get('title'):
                title = props['影片標題']['title'][0]['plain_text']

            url = props.get('網址', {}).get('url', '') or ''
            channel = ''
            if props.get('頻道', {}).get('rich_text'):
                channel = props['頻道']['rich_text'][0]['plain_text']

            highlights = ''
            if props.get('精華片段', {}).get('rich_text'):
                highlights = props['精華片段']['rich_text'][0]['plain_text']

            summary = ''
            if props.get('AI 摘要', {}).get('rich_text'):
                summary = props['AI 摘要']['rich_text'][0]['plain_text']

            videos.append({
                'page_id': page['id'],
                'title': title,
                'url': url,
                'channel': channel,
                'highlights': highlights,
                'summary': summary,
            })

        if not data.get('has_more'):
            break
        next_cursor = data['next_cursor']

    return videos


def extract_video_id(url: str) -> str:
    """Extract YouTube video ID from URL."""
    if not url:
        return ''
    m = re.search(r'(?:v=|youtu\.be/|shorts/|embed/)([a-zA-Z0-9_-]{11})', url)
    return m.group(1) if m else ''


def has_good_highlights(highlights: str) -> bool:
    """Check if highlights have proper timestamp format."""
    if not highlights:
        return False
    return bool(GOOD_HIGHLIGHT_RE.search(highlights))


def fetch_subtitles(video_id: str) -> dict:
    """Fetch subtitles with timestamps."""
    from youtube_transcript_api import YouTubeTranscriptApi
    api = YouTubeTranscriptApi()

    def format_with_timestamps(transcript):
        parts = []
        for s in transcript.snippets:
            mins = int(s.start // 60)
            secs = int(s.start % 60)
            parts.append(f'[{mins}:{secs:02d}] {s.text.strip()}')
        return '\n'.join(parts)

    lang_priorities = [['zh-Hant', 'zh-Hans', 'zh-TW', 'zh'], ['en']]
    for langs in lang_priorities:
        try:
            transcript = api.fetch(video_id, languages=langs)
            return {
                'success': True,
                'language': transcript.language,
                'text': format_with_timestamps(transcript),
                'length': len(transcript.snippets),
            }
        except Exception:
            continue

    try:
        transcript_list = api.list(video_id)
        for t in transcript_list:
            try:
                transcript = api.fetch(video_id, languages=[t.language_code])
                return {
                    'success': True,
                    'language': transcript.language,
                    'text': format_with_timestamps(transcript),
                    'length': len(transcript.snippets),
                }
            except Exception:
                continue
    except Exception:
        pass

    return {'success': False, 'text': '', 'language': '', 'length': 0}


def generate_ai_summary(title: str, channel: str, transcript: str) -> dict:
    """Generate AI summary with proper highlight format."""
    truncated = transcript[:8000]

    prompt = f"""你是 Ray 的 YouTube 研究庫助手。請分析以下影片字幕，用繁體中文回覆。

影片標題：{title}
頻道：{channel}

字幕內容：
{truncated}

請提供以下四個欄位（用 JSON 格式回覆，key 用英文）：

1. "summary" — AI 摘要（5 個重點，每點一句話，用 <br> 分隔）
2. "one_liner" — 一句話學到（最核心的一個收穫，一句話）
3. "highlights" — 精華片段（3-5 個關鍵段落重點，格式：「時間碼 - 重點描述」，每段用 <br> 分隔。時間碼從字幕中取最接近的時間點，格式 M:SS 或 MM:SS，例如 "2:15 - 解釋風控的核心邏輯"）
4. "priority" — 優先度建議（"🔥 必看" / "⭐ 重要" / "📌 一般" 三選一）

只回覆 JSON，不要其他文字。"""

    resp = requests.post(
        'https://api.anthropic.com/v1/messages',
        headers={
            'x-api-key': ANTHROPIC_API_KEY,
            'anthropic-version': '2023-06-01',
            'content-type': 'application/json',
        },
        json={
            'model': 'claude-haiku-4-5-20251001',
            'max_tokens': 1024,
            'messages': [{'role': 'user', 'content': prompt}],
        },
        timeout=30,
    )

    if resp.status_code != 200:
        print(f'  Claude API error: {resp.status_code} {resp.text[:200]}')
        return None

    content = resp.json()['content'][0]['text']
    try:
        json_match = re.search(r'\{[\s\S]*\}', content)
        if json_match:
            return json.loads(json_match.group())
    except json.JSONDecodeError:
        pass

    print(f'  Failed to parse Claude response: {content[:200]}')
    return None


def update_notion(page_id: str, ai_data: dict) -> bool:
    """Update Notion page with AI summary."""
    properties = {
        'AI 摘要': {
            'rich_text': [{'type': 'text', 'text': {'content': ai_data['summary'][:2000]}}]
        },
        '一句話學到': {
            'rich_text': [{'type': 'text', 'text': {'content': ai_data['one_liner'][:2000]}}]
        },
        '精華片段': {
            'rich_text': [{'type': 'text', 'text': {'content': ai_data['highlights'][:2000]}}]
        },
    }

    if ai_data.get('priority'):
        properties['優先度'] = {'select': {'name': ai_data['priority']}}

    resp = requests.patch(
        f'https://api.notion.com/v1/pages/{page_id}',
        headers={
            'Authorization': f'Bearer {NOTION_TOKEN}',
            'Notion-Version': '2022-06-28',
            'Content-Type': 'application/json',
        },
        json={'properties': properties},
        timeout=15,
    )

    if resp.status_code != 200:
        print(f'  Notion update error: {resp.status_code} {resp.text[:200]}')
        return False
    return True


def main():
    if not ANTHROPIC_API_KEY:
        print('ERROR: ANTHROPIC_API_KEY not set')
        sys.exit(1)
    if not NOTION_TOKEN:
        print('ERROR: NOTION_TOKEN not set')
        sys.exit(1)

    # Step 1: Fetch all videos from Notion
    print('Fetching all videos from Notion...')
    all_videos = fetch_all_videos()
    print(f'Total videos in DB: {len(all_videos)}')

    # Step 2: Filter for bad highlights
    bad_videos = []
    for v in all_videos:
        video_id = extract_video_id(v['url'])
        if not video_id:
            continue
        if not has_good_highlights(v['highlights']):
            bad_videos.append({**v, 'video_id': video_id})

    print(f'Videos with bad/missing highlights: {len(bad_videos)}')

    if not bad_videos:
        print('Nothing to reprocess!')
        return

    # Step 3: Reprocess each video
    success_count = 0
    fail_count = 0
    skip_count = 0

    for i, v in enumerate(bad_videos):
        print(f'\n[{i+1}/{len(bad_videos)}] {v["title"][:60]}... ({v["video_id"]})')

        print('  [1/3] Fetching subtitles...')
        subs = fetch_subtitles(v['video_id'])
        if not subs['success']:
            print('  SKIP: No subtitles available')
            skip_count += 1
            continue
        print(f'  Got {subs["length"]} segments ({subs["language"]})')

        print('  [2/3] Generating AI summary...')
        ai_data = generate_ai_summary(v['title'], v['channel'], subs['text'])
        if not ai_data:
            print('  FAIL: AI summary generation failed')
            fail_count += 1
            continue
        print(f'  One-liner: {ai_data.get("one_liner", "")[:60]}')

        print('  [3/3] Updating Notion...')
        ok = update_notion(v['page_id'], ai_data)
        if ok:
            print('  ✅ Done!')
            success_count += 1
        else:
            print('  ❌ Notion update failed')
            fail_count += 1

        time.sleep(1)

    print(f'\n=== COMPLETE ===')
    print(f'Success: {success_count} | Failed: {fail_count} | Skipped: {skip_count}')


if __name__ == '__main__':
    main()

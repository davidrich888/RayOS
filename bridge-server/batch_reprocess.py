#!/usr/bin/env python3
"""Batch reprocess YouTube videos that failed subtitle fetching.
Fetches subtitles → Claude AI summary → Updates Notion.
"""
import json
import os
import sys
import time
import re
import requests

# Config
ANTHROPIC_API_KEY = os.environ.get('ANTHROPIC_API_KEY', '')
NOTION_TOKEN = os.environ.get('NOTION_TOKEN', '')

# Videos to reprocess: (notion_page_id, video_id, title, channel)
VIDEOS = [
    ("31f629ef-6a13-812f-bd50-fe2d40ad7349", "FfR-wy4Iiaw", "The NEW way to build a PRO YouTube Studio with AI", "James Kelly"),
    ("31f629ef-6a13-81e5-ab19-e981f9c7e10d", "eRbNFeXh8xc", "Helping 100 Skool Owners Make $4,611,900 in 90 Days", "Synthesizer"),
    ("31f629ef-6a13-8153-ae49-ecb3ab864678", "KybZ2TTseCM", "潜入全球顶级的数字游民圈子，寻找赚钱的新出路", "游牧夫妻"),
    ("31f629ef-6a13-8178-a957-c5616e11330b", "d25fcWem0ME", "我用 OpenClaw 搭了一支 AI 团队｜这可能是 AI 时代最强的个人外挂", "木子不写代码"),
    ("31f629ef-6a13-8128-aaa3-fad8b37f6d39", "4rtKow3hsmQ", "claude code is literally changing my life...", "Liam Ottley VLOGs"),
    ("31f629ef-6a13-8140-899c-ed83673f47c8", "OFyECKgWXo8", "10 Claude Code Plugins to 10X Your Projects", "Chase AI"),
    ("31e629ef-6a13-81a5-b047-e23c05897159", "R4ub94mJBvA", "你以為她在玩你？其實不是｜《500 Days》結局讓男人醒來的一課", "Loveguard"),
    ("31f629ef-6a13-8199-93cc-ee9d86f2fd44", "_zFie0QLn3g", "軟體巨頭的噩夢來了！Adobe、Salesforce市值暴跌、Anthropic親手埋葬傳統SaaS？", "真實未來錄"),
    ("31f629ef-6a13-810a-822a-ca0b4f878732", "1Z1aECGwJh0", "Google's New CLI Just Made Claude Code Unstoppable", "Mark Kashef"),
    ("31f629ef-6a13-8101-8fe4-cb0071ec8401", "fn0KW379Xkk", "比特幣早該15萬？市場爆料有人在壓盤！真相越看越不對勁！", "邦妮區塊鏈"),
    ("31f629ef-6a13-8168-b746-da32da3a286e", "lsI5hP3Nq28", "How To Scrape Any Website With Claude Cowork", "Andrew Dunn"),
    ("31f629ef-6a13-815f-99af-e6eb41494a3c", "OV5eK91YY68", "I gave OpenClaw one job: go viral (it worked?)", "Greg Isenberg"),
    ("31f629ef-6a13-8134-927a-d07eef6b0842", "etmXgQux4IY", "Everything I Learned From Being Around The Top 0.01%", "The Mindset Mentor Podcast"),
    ("31f629ef-6a13-8133-823c-eca9149ff70b", "D_YzcH0VsGY", "The most powerful AI Agent I've ever used in my life", "Dan Martell"),
]


def fetch_subtitles(video_id: str) -> dict:
    """Fetch subtitles using youtube-transcript-api."""
    from youtube_transcript_api import YouTubeTranscriptApi
    api = YouTubeTranscriptApi()

    lang_priorities = [
        ['zh-Hant', 'zh-Hans', 'zh-TW', 'zh'],
        ['en'],
    ]

    for langs in lang_priorities:
        try:
            transcript = api.fetch(video_id, languages=langs)
            text_parts = []
            for s in transcript.snippets:
                text_parts.append(s.text.strip())
            full_text = ' '.join(text_parts)
            return {
                'success': True,
                'language': transcript.language,
                'text': full_text,
                'length': len(transcript.snippets),
            }
        except Exception:
            continue

    # Try any available language
    try:
        transcript_list = api.list(video_id)
        for t in transcript_list:
            try:
                transcript = api.fetch(video_id, languages=[t.language_code])
                text_parts = [s.text.strip() for s in transcript.snippets]
                return {
                    'success': True,
                    'language': transcript.language,
                    'text': ' '.join(text_parts),
                    'length': len(transcript.snippets),
                }
            except Exception:
                continue
    except Exception:
        pass

    return {'success': False, 'text': '', 'language': '', 'length': 0}


def generate_ai_summary(title: str, channel: str, transcript: str) -> dict:
    """Generate AI summary using Claude API."""
    # Truncate transcript to ~8000 chars to stay within token limits
    truncated = transcript[:8000]

    prompt = f"""你是 Ray 的 YouTube 研究庫助手。請分析以下影片字幕，用繁體中文回覆。

影片標題：{title}
頻道：{channel}

字幕內容：
{truncated}

請提供以下四個欄位（用 JSON 格式回覆，key 用英文）：

1. "summary" — AI 摘要（5 個重點，每點一句話，用 <br> 分隔）
2. "one_liner" — 一句話學到（最核心的一個收穫，一句話）
3. "highlights" — 精華片段（3-5 個關鍵時間點和重點，格式：重點描述，用 <br> 分隔。注意：因為是從字幕萃取，不一定有精確時間碼，盡量標註大概位置如「開頭」「中段」「結尾」）
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
    # Extract JSON from response
    try:
        # Try to find JSON in the response
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

    # Only update priority if current is 一般
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

    success_count = 0
    fail_count = 0
    skip_count = 0

    for page_id, video_id, title, channel in VIDEOS:
        print(f'\n--- {title[:50]}... ({video_id})')

        # Step 1: Fetch subtitles
        print('  [1/3] Fetching subtitles...')
        subs = fetch_subtitles(video_id)
        if not subs['success']:
            print(f'  SKIP: No subtitles available')
            skip_count += 1
            continue
        print(f'  Got {subs["length"]} segments ({subs["language"]}), {len(subs["text"])} chars')

        # Step 2: Generate AI summary
        print('  [2/3] Generating AI summary...')
        ai_data = generate_ai_summary(title, channel, subs['text'])
        if not ai_data:
            print(f'  FAIL: AI summary generation failed')
            fail_count += 1
            continue
        print(f'  Summary: {ai_data["one_liner"][:60]}...')

        # Step 3: Update Notion
        print('  [3/3] Updating Notion...')
        ok = update_notion(page_id, ai_data)
        if ok:
            print(f'  ✅ Done!')
            success_count += 1
        else:
            print(f'  ❌ Notion update failed')
            fail_count += 1

        # Rate limit: small delay between requests
        time.sleep(1)

    print(f'\n=== COMPLETE ===')
    print(f'Success: {success_count} | Failed: {fail_count} | Skipped: {skip_count}')
    return success_count, fail_count, skip_count


if __name__ == '__main__':
    main()

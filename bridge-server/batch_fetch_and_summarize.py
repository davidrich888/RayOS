#!/usr/bin/env python3
"""Batch fetch subtitles and generate AI summaries.
Outputs JSON for each video, to be used by Notion MCP updates.
"""
import json
import os
import sys
import re
import time
import requests

ANTHROPIC_API_KEY = os.environ.get('ANTHROPIC_API_KEY', '')

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
    from youtube_transcript_api import YouTubeTranscriptApi
    api = YouTubeTranscriptApi()
    lang_priorities = [['zh-Hant', 'zh-Hans', 'zh-TW', 'zh'], ['en']]
    def format_with_timestamps(transcript):
        parts = []
        for s in transcript.snippets:
            mins = int(s.start // 60)
            secs = int(s.start % 60)
            parts.append(f'[{mins}:{secs:02d}] {s.text.strip()}')
        return '\n'.join(parts)

    for langs in lang_priorities:
        try:
            transcript = api.fetch(video_id, languages=langs)
            return {'success': True, 'language': transcript.language, 'text': format_with_timestamps(transcript), 'length': len(transcript.snippets)}
        except Exception:
            continue
    try:
        transcript_list = api.list(video_id)
        for t in transcript_list:
            try:
                transcript = api.fetch(video_id, languages=[t.language_code])
                return {'success': True, 'language': transcript.language, 'text': format_with_timestamps(transcript), 'length': len(transcript.snippets)}
            except Exception:
                continue
    except Exception:
        pass
    return {'success': False, 'text': '', 'language': '', 'length': 0}


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
3. "highlights" — 精華片段（3-5 個關鍵段落重點，格式：「時間碼 - 重點描述」，每段用 <br> 分隔。時間碼從字幕中取最接近的時間點，格式 M:SS 或 MM:SS，例如 "2:15 - 解釋風控的核心邏輯"）
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


def main():
    if not ANTHROPIC_API_KEY:
        print('ERROR: Set ANTHROPIC_API_KEY', file=sys.stderr)
        sys.exit(1)

    results = []
    for page_id, video_id, title, channel in VIDEOS:
        print(f'Processing: {title[:50]}... ({video_id})', file=sys.stderr)

        subs = fetch_subtitles(video_id)
        if not subs['success']:
            print(f'  SKIP: No subtitles', file=sys.stderr)
            results.append({'page_id': page_id, 'video_id': video_id, 'title': title, 'status': 'no_subs'})
            continue

        print(f'  Subs: {subs["length"]} segs ({subs["language"]})', file=sys.stderr)

        ai_data = generate_ai_summary(title, channel, subs['text'])
        if not ai_data:
            print(f'  FAIL: AI summary', file=sys.stderr)
            results.append({'page_id': page_id, 'video_id': video_id, 'title': title, 'status': 'ai_fail'})
            continue

        results.append({
            'page_id': page_id,
            'video_id': video_id,
            'title': title,
            'status': 'ok',
            'summary': ai_data.get('summary', ''),
            'one_liner': ai_data.get('one_liner', ''),
            'highlights': ai_data.get('highlights', ''),
            'priority': ai_data.get('priority', '📌 一般'),
        })
        print(f'  OK: {ai_data.get("one_liner", "")[:60]}', file=sys.stderr)
        time.sleep(0.5)

    # Output JSON to stdout
    print(json.dumps(results, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()

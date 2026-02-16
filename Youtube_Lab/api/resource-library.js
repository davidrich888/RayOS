const NOTION_DB_ID = '397a6457-079c-419e-ba44-df992b6ba1d4';

const TAG_EMOJI_MAP = {
  'Money/Business': '💰 Money/Business',
  'AI/Tech': '🤖 AI/Tech',
  'Trading': '📈 Trading',
  'Content Creation': '📹 Content Creation',
  'Mindset': '🧠 Mindset',
  'Tools': '🔧 Tools',
  'Learning': '📚 Learning',
};

function notionHeaders() {
  return {
    'Authorization': `Bearer ${process.env.NOTION_TOKEN}`,
    'Notion-Version': '2022-06-28',
    'Content-Type': 'application/json',
  };
}

function getTitle(p) {
  if (!p || !p.title || !Array.isArray(p.title)) return '';
  return p.title.map(t => t.plain_text || '').join('');
}

function getRichText(p) {
  if (!p || !p.rich_text || !Array.isArray(p.rich_text)) return '';
  return p.rich_text.map(t => t.plain_text || '').join('');
}

function getUrl(p) {
  return p?.url || '';
}

function getSelect(p) {
  return p?.select?.name || '';
}

function getMultiSelect(p) {
  if (!p || !p.multi_select) return [];
  return p.multi_select.map(s => s.name);
}

function formatResource(page) {
  const props = page.properties || {};
  return {
    id: page.id,
    title: getTitle(props['標題']),
    url: getUrl(props['URL']),
    source_type: getSelect(props['來源類型']),
    content: getRichText(props['原始內容']),
    summary: getRichText(props['AI 摘要']),
    key_takeaway: getRichText(props['一句話重點']),
    tags: getMultiSelect(props['分類標籤']),
    source: getSelect(props['來源']),
    created_time: page.created_time || '',
  };
}

async function fetchResources(res) {
  const allResults = [];
  let hasMore = true;
  let startCursor = undefined;

  while (hasMore) {
    const body = { page_size: 100 };
    if (startCursor) body.start_cursor = startCursor;

    const resp = await fetch(`https://api.notion.com/v1/databases/${NOTION_DB_ID}/query`, {
      method: 'POST',
      headers: notionHeaders(),
      body: JSON.stringify(body),
    });

    if (!resp.ok) {
      const err = await resp.json();
      return res.status(resp.status).json(err);
    }

    const data = await resp.json();
    allResults.push(...data.results);
    hasMore = data.has_more;
    startCursor = data.next_cursor;
  }

  const resources = allResults.map(formatResource);
  resources.sort((a, b) => new Date(b.created_time) - new Date(a.created_time));

  return res.status(200).json(resources);
}

async function fetchXContent(url) {
  try {
    const oembedUrl = `https://publish.twitter.com/oembed?url=${encodeURIComponent(url)}&omit_script=true`;
    const resp = await fetch(oembedUrl);
    if (!resp.ok) return null;
    const data = await resp.json();
    // Extract text from HTML
    const html = data.html || '';
    const text = html.replace(/<[^>]*>/g, '').replace(/&mdash;/g, '—').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim();
    return text || null;
  } catch {
    return null;
  }
}

function extractAIField(text, tag) {
  const regex = new RegExp('【' + tag + '】\\s*(.+?)(?=\\n【|$)', 's');
  const match = text.match(regex);
  return match ? match[1].trim() : '';
}

async function classifyWithAI(content, url, sourceType) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  const prompt = `你是一個知識管理助手。分析以下內容並用繁體中文回答。

原始內容：
${content}

來源網址：${url || '無'}
來源類型：${sourceType}

請嚴格按照以下格式回答（每個標籤各佔一行，不要加其他內容）：

【標題】用一句話概括此內容（15字以內，不加標點）
【AI摘要】2-3句話摘要核心內容
【一句話重點】最核心的收穫，用一句話表達
【分類標籤】從以下選項中選擇1-3個，用逗號分隔：Money/Business, AI/Tech, Trading, Content Creation, Mindset, Tools, Learning`;

  try {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!resp.ok) return null;
    const data = await resp.json();
    const aiText = data.content?.[0]?.text || '';

    const title = extractAIField(aiText, '標題');
    const summary = extractAIField(aiText, 'AI摘要');
    const keyTakeaway = extractAIField(aiText, '一句話重點');
    const tagsRaw = extractAIField(aiText, '分類標籤');
    const tags = tagsRaw.split(',').map(t => t.trim()).filter(Boolean).map(t => TAG_EMOJI_MAP[t] || t);

    return { title, summary, keyTakeaway, tags };
  } catch {
    return null;
  }
}

async function addResource(req, res) {
  const { data } = req.body;
  if (!data) return res.status(400).json({ error: 'Missing data' });

  let content = data.content || '';
  const url = data.url || '';
  const sourceType = data.source_type || 'Note';
  const source = data.source || 'manual';

  // Auto-fetch X/Twitter content if empty
  if (!content && url && (url.includes('twitter.com') || url.includes('x.com'))) {
    const xContent = await fetchXContent(url);
    if (xContent) content = xContent;
  }

  if (!content && !url) {
    return res.status(400).json({ error: 'Content or URL required' });
  }

  // AI classification
  const ai = await classifyWithAI(content || url, url, sourceType);
  const title = ai?.title || (content || url).substring(0, 20) + '...';
  const summary = ai?.summary || '';
  const keyTakeaway = ai?.keyTakeaway || '';
  const tags = ai?.tags || [];

  // Store in Notion
  const properties = {
    '標題': { title: [{ type: 'text', text: { content: title } }] },
    '原始內容': { rich_text: [{ type: 'text', text: { content: content.substring(0, 2000) } }] },
    'AI 摘要': { rich_text: [{ type: 'text', text: { content: summary.substring(0, 2000) } }] },
    '一句話重點': { rich_text: [{ type: 'text', text: { content: keyTakeaway.substring(0, 2000) } }] },
    '來源類型': { select: { name: sourceType } },
    '來源': { select: { name: source } },
    '分類標籤': { multi_select: tags.map(name => ({ name })) },
  };

  if (url) {
    properties['URL'] = { url: url };
  }

  try {
    const resp = await fetch('https://api.notion.com/v1/pages', {
      method: 'POST',
      headers: notionHeaders(),
      body: JSON.stringify({
        parent: { database_id: NOTION_DB_ID },
        properties,
      }),
    });

    if (!resp.ok) {
      const err = await resp.json();
      return res.status(resp.status).json(err);
    }

    const page = await resp.json();

    return res.status(200).json({
      id: page.id,
      title,
      url,
      content,
      source_type: sourceType,
      summary,
      key_takeaway: keyTakeaway,
      tags,
      source,
      created_time: page.created_time || new Date().toISOString(),
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}

async function deleteResource(req, res) {
  const { pageId } = req.body;
  if (!pageId) return res.status(400).json({ error: 'Missing pageId' });

  try {
    const resp = await fetch(`https://api.notion.com/v1/pages/${pageId}`, {
      method: 'PATCH',
      headers: notionHeaders(),
      body: JSON.stringify({ archived: true }),
    });

    const data = await resp.json();
    if (!resp.ok) return res.status(resp.status).json(data);

    return res.status(200).json({ success: true });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const token = process.env.NOTION_TOKEN;
  if (!token) return res.status(500).json({ error: 'NOTION_TOKEN not configured' });

  const { type } = req.body;

  switch (type) {
    case 'fetch_resources':
      return fetchResources(res);
    case 'add_resource':
      return addResource(req, res);
    case 'delete_resource':
      return deleteResource(req, res);
    default:
      return res.status(400).json({ error: `Unknown type: ${type}` });
  }
};

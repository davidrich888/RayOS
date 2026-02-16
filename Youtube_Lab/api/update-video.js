module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const token = process.env.NOTION_TOKEN;
  if (!token) return res.status(500).json({ error: 'NOTION_TOKEN not configured' });

  const { pageId, rating, status, categories, notes, thumbnailSaved } = req.body;
  if (!pageId) return res.status(400).json({ error: 'Missing pageId' });

  const properties = {};

  if (rating !== undefined) {
    properties['我的評分'] = { number: rating };
  }

  if (status !== undefined) {
    properties['狀態'] = { select: { name: status } };
  }

  if (categories !== undefined) {
    const cats = categories.split(',').map(c => c.trim()).filter(Boolean);
    properties['分類'] = { multi_select: cats.map(name => ({ name })) };
  }

  if (notes !== undefined) {
    properties['我的筆記'] = {
      rich_text: [{ type: 'text', text: { content: notes } }],
    };
  }

  if (thumbnailSaved !== undefined) {
    properties['收藏縮圖'] = { checkbox: thumbnailSaved };
  }

  try {
    const resp = await fetch(`https://api.notion.com/v1/pages/${pageId}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ properties }),
    });

    const data = await resp.json();
    if (!resp.ok) return res.status(resp.status).json(data);

    return res.status(200).json({ success: true });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};

#!/usr/bin/env node

// ==================== 清理 Notion Daily Habits 重複項目 ====================
// 用法：
//   node cleanup-duplicates.js                  → dry-run 模式（只列出，不刪除）
//   node cleanup-duplicates.js --execute        → 實際 archive 重複項目
//
// 需要環境變數：
//   NOTION_TOKEN=ntn_xxxxx
//
// 邏輯：按 Date title 分組，每組保留最早建立的那筆，其餘 archive

const NOTION_DB_ID = '58da82d689ed42029274234183f77bb6';
const NOTION_API = 'https://api.notion.com/v1';

const token = process.env.NOTION_TOKEN;
if (!token) {
    console.error('❌ 請設定環境變數 NOTION_TOKEN');
    console.error('   例如：NOTION_TOKEN=ntn_xxxxx node cleanup-duplicates.js');
    process.exit(1);
}

const dryRun = !process.argv.includes('--execute');

async function notionFetch(path, method, body) {
    const res = await fetch(`${NOTION_API}${path}`, {
        method: method || 'POST',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Notion-Version': '2022-06-28',
            'Content-Type': 'application/json'
        },
        body: body ? JSON.stringify(body) : undefined
    });
    if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`Notion API ${res.status}: ${text.substring(0, 200)}`);
    }
    return res.json();
}

async function getAllPages() {
    const pages = [];
    let cursor = undefined;
    while (true) {
        const body = { page_size: 100 };
        if (cursor) body.start_cursor = cursor;
        const data = await notionFetch(`/databases/${NOTION_DB_ID}/query`, 'POST', body);
        pages.push(...data.results);
        if (!data.has_more) break;
        cursor = data.next_cursor;
    }
    return pages;
}

async function main() {
    console.log(dryRun ? '🔍 DRY-RUN 模式（不會刪除任何東西）' : '⚡ EXECUTE 模式（將會 archive 重複項目）');
    console.log('');

    // 1. 拉取所有項目
    console.log('📥 正在從 Notion 拉取所有 Daily Habits 項目...');
    const pages = await getAllPages();
    console.log(`   共 ${pages.length} 筆項目`);

    // 2. 按 Date title 分組
    const groups = {};
    for (const page of pages) {
        const titleArr = page.properties?.Date?.title;
        const dateStr = titleArr?.[0]?.plain_text || '';
        if (!dateStr.match(/^\d{4}-\d{2}-\d{2}$/)) {
            console.log(`   ⚠️ 略過無效日期格式: "${dateStr}" (${page.id})`);
            continue;
        }
        if (!groups[dateStr]) groups[dateStr] = [];
        groups[dateStr].push({
            id: page.id,
            created: page.created_time,
            dateStr
        });
    }

    // 3. 找出重複
    const duplicates = [];
    let keepCount = 0;
    for (const [dateStr, items] of Object.entries(groups)) {
        if (items.length <= 1) {
            keepCount++;
            continue;
        }
        // 按建立時間排序，保留最早的
        items.sort((a, b) => a.created.localeCompare(b.created));
        const keep = items[0];
        const toRemove = items.slice(1);
        console.log(`📅 ${dateStr}: ${items.length} 筆 → 保留 ${keep.id.substring(0, 8)}... (${keep.created})`);
        for (const item of toRemove) {
            console.log(`   ❌ 要刪除: ${item.id.substring(0, 8)}... (${item.created})`);
            duplicates.push(item);
        }
        keepCount++;
    }

    console.log('');
    console.log(`📊 統計：`);
    console.log(`   日期數：${Object.keys(groups).length}`);
    console.log(`   保留：${keepCount} 筆`);
    console.log(`   重複需刪除：${duplicates.length} 筆`);

    if (duplicates.length === 0) {
        console.log('');
        console.log('✅ 沒有重複項目，不需要清理！');
        return;
    }

    // 4. 執行清理
    if (dryRun) {
        console.log('');
        console.log('💡 這是 dry-run 模式。要實際刪除，請執行：');
        console.log('   NOTION_TOKEN=你的token node cleanup-duplicates.js --execute');
        return;
    }

    console.log('');
    console.log('🗑️ 正在 archive 重複項目...');
    let archived = 0;
    let errors = 0;
    for (const item of duplicates) {
        try {
            await notionFetch(`/pages/${item.id}`, 'PATCH', { archived: true });
            archived++;
            console.log(`   ✅ Archived: ${item.dateStr} (${item.id.substring(0, 8)}...)`);
        } catch (e) {
            errors++;
            console.error(`   ❌ 失敗: ${item.dateStr} (${item.id.substring(0, 8)}...): ${e.message}`);
        }
    }

    console.log('');
    console.log(`🏁 完成！已 archive ${archived} 筆，失敗 ${errors} 筆`);
}

main().catch(e => {
    console.error('❌ 執行錯誤:', e.message);
    process.exit(1);
});

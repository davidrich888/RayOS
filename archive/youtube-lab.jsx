import React, { useState, useMemo } from 'react';

const sampleVideos = [
  {
    id: 1,
    title: "TopStep vs FTMO 完整比較：哪個 Prop Firm 最適合你？",
    channel: "Trading Hub",
    duration: "24:35",
    category: "交易",
    status: "待看",
    priority: 3,
    dateAdded: "2025-01-28",
    summary: null,
    url: "https://youtube.com/watch?v=example1"
  },
  {
    id: 2,
    title: "用 Claude AI 打造自動化工作流程｜完整教學",
    channel: "AI 工具王",
    duration: "18:22",
    category: "AI 自動化",
    status: "進行中",
    priority: 2,
    dateAdded: "2025-01-25",
    summary: "• API 串接基礎設定\n• 提示詞工程技巧\n• 實戰案例：自動整理 Email",
    keyTakeaway: "自動化的核心是「重複性任務 + 明確規則 = 交給 AI」",
    url: "https://youtube.com/watch?v=example2"
  },
  {
    id: 3,
    title: "YouTube Shorts 爆紅公式｜2024 演算法完整解析",
    channel: "自媒體研究所",
    duration: "32:10",
    category: "自媒體",
    status: "已完成",
    priority: 1,
    dateAdded: "2025-01-20",
    summary: "• Hook 的前 3 秒決定 90% 成敗\n• 留言互動率比觀看時長更重要\n• 最佳發布時間：晚上 8-10 點",
    keyTakeaway: "Shorts 的本質是「情緒觸發器」，不是「資訊傳遞」",
    url: "https://youtube.com/watch?v=example3"
  },
  {
    id: 4,
    title: "科學減脂：為什麼你一直瘦不下來？",
    channel: "健身教練 Ryan",
    duration: "15:48",
    category: "健身",
    status: "待看",
    priority: 2,
    dateAdded: "2025-01-30",
    summary: null,
    url: "https://youtube.com/watch?v=example4"
  },
  {
    id: 5,
    title: "Prop Firm 新手常見的 5 個致命錯誤",
    channel: "期貨交易室",
    duration: "21:05",
    category: "交易",
    status: "待看",
    priority: 3,
    dateAdded: "2025-01-31",
    summary: null,
    url: "https://youtube.com/watch?v=example5"
  },
];

const categories = ["全部", "交易", "AI 自動化", "自媒體", "健身"];
const statuses = ["全部", "待看", "進行中", "已完成"];

const categoryConfig = {
  "交易": { bg: "#fef3c7", text: "#b45309", icon: "📈" },
  "AI 自動化": { bg: "#ede9fe", text: "#7c3aed", icon: "🤖" },
  "自媒體": { bg: "#fce7f3", text: "#be185d", icon: "🎬" },
  "健身": { bg: "#d1fae5", text: "#047857", icon: "💪" },
};

const statusConfig = {
  "待看": { bg: "#fee2e2", text: "#dc2626", dot: "#ef4444" },
  "進行中": { bg: "#fef9c3", text: "#a16207", dot: "#eab308" },
  "已完成": { bg: "#dcfce7", text: "#15803d", dot: "#22c55e" },
};

export default function YouTubeLab() {
  const [selectedCategory, setSelectedCategory] = useState("全部");
  const [selectedStatus, setSelectedStatus] = useState("全部");
  const [searchQuery, setSearchQuery] = useState("");
  const [showAddModal, setShowAddModal] = useState(false);

  const filteredVideos = useMemo(() => {
    return sampleVideos.filter(video => {
      const matchCategory = selectedCategory === "全部" || video.category === selectedCategory;
      const matchStatus = selectedStatus === "全部" || video.status === selectedStatus;
      const matchSearch = video.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         video.channel.toLowerCase().includes(searchQuery.toLowerCase());
      return matchCategory && matchStatus && matchSearch;
    });
  }, [selectedCategory, selectedStatus, searchQuery]);

  const stats = useMemo(() => {
    return {
      total: sampleVideos.length,
      pending: sampleVideos.filter(v => v.status === "待看").length,
      inProgress: sampleVideos.filter(v => v.status === "進行中").length,
      completed: sampleVideos.filter(v => v.status === "已完成").length,
      summarized: sampleVideos.filter(v => v.summary).length,
    };
  }, []);

  return (
    <div className="min-h-screen text-slate-200" style={{
      background: 'linear-gradient(135deg, #0f0f1a 0%, #1a1a2e 50%, #16213e 100%)',
      fontFamily: "'Noto Sans TC', 'SF Pro Display', -apple-system, sans-serif",
    }}>
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-white/5 bg-black/20 backdrop-blur-xl">
        <div className="max-w-6xl mx-auto px-4 py-5">
          <div className="flex justify-between items-center mb-5">
            <div>
              <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
                📚 Ray 的學習研究庫
              </h1>
              <p className="text-slate-500 text-sm mt-1">把資訊焦慮轉化為系統學習</p>
            </div>
            <button
              onClick={() => setShowAddModal(true)}
              className="bg-gradient-to-r from-blue-500 to-purple-500 hover:from-blue-600 hover:to-purple-600 text-white font-semibold px-5 py-2.5 rounded-xl transition-all hover:scale-105 hover:shadow-lg hover:shadow-blue-500/25 flex items-center gap-2"
            >
              <span className="text-lg">+</span> 新增影片
            </button>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-5 gap-3">
            {[
              { label: '總共', value: stats.total, color: 'text-blue-400' },
              { label: '待看', value: stats.pending, color: 'text-red-400' },
              { label: '進行中', value: stats.inProgress, color: 'text-yellow-400' },
              { label: '已完成', value: stats.completed, color: 'text-green-400' },
              { label: '已整理', value: stats.summarized, color: 'text-purple-400' },
            ].map((stat, i) => (
              <div key={i} className="bg-white/5 rounded-xl p-4 border border-white/5">
                <div className="text-xs text-slate-500 mb-1">{stat.label}</div>
                <div className={`text-2xl font-bold ${stat.color}`}>
                  {stat.value}<span className="text-sm font-normal ml-1">部</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="max-w-6xl mx-auto px-4 py-6">
        {/* Filters */}
        <div className="flex flex-wrap gap-3 mb-6 items-center">
          <div className="flex-1 min-w-48 relative">
            <input
              type="text"
              placeholder="搜尋影片或頻道..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-white/10 bg-white/5 text-slate-200 text-sm outline-none focus:border-blue-500/50 transition-colors"
            />
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">🔍</span>
          </div>

          <div className="flex gap-2">
            {categories.map(cat => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  selectedCategory === cat
                    ? 'bg-blue-500/20 text-blue-400 border border-blue-500/50'
                    : 'bg-white/5 text-slate-400 border border-white/10 hover:bg-white/10'
                }`}
              >
                {cat !== "全部" && categoryConfig[cat]?.icon} {cat}
              </button>
            ))}
          </div>

          <div className="flex gap-2">
            {statuses.map(status => (
              <button
                key={status}
                onClick={() => setSelectedStatus(status)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  selectedStatus === status
                    ? 'bg-purple-500/20 text-purple-400 border border-purple-500/50'
                    : 'bg-white/5 text-slate-400 border border-white/10 hover:bg-white/10'
                }`}
              >
                {status}
              </button>
            ))}
          </div>
        </div>

        {/* Video Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredVideos.map(video => (
            <div
              key={video.id}
              className="bg-white/5 rounded-2xl overflow-hidden border border-white/5 hover:border-white/10 transition-all hover:-translate-y-1 hover:shadow-2xl hover:shadow-black/20 group"
            >
              {/* Thumbnail placeholder */}
              <div className="relative pt-[56.25%]" style={{
                background: `linear-gradient(135deg, ${categoryConfig[video.category]?.bg}40 0%, #1e293b 100%)`,
              }}>
                <div className="absolute inset-0 flex items-center justify-center text-5xl opacity-60 group-hover:opacity-80 transition-opacity">
                  {categoryConfig[video.category]?.icon || '📺'}
                </div>
                <div className="absolute bottom-2 right-2 bg-black/80 px-2 py-1 rounded text-xs font-semibold">
                  {video.duration}
                </div>
                {video.priority === 3 && (
                  <div className="absolute top-2 left-2 bg-gradient-to-r from-red-500 to-orange-500 px-2.5 py-1 rounded text-xs font-bold">
                    🔥 必看
                  </div>
                )}
              </div>

              {/* Content */}
              <div className="p-4">
                <div className="flex gap-2 mb-3">
                  <span className="px-2.5 py-1 rounded text-xs font-semibold" style={{
                    background: categoryConfig[video.category]?.bg,
                    color: categoryConfig[video.category]?.text,
                  }}>
                    {categoryConfig[video.category]?.icon} {video.category}
                  </span>
                  <span className="px-2.5 py-1 rounded text-xs font-semibold flex items-center gap-1.5" style={{
                    background: statusConfig[video.status]?.bg,
                    color: statusConfig[video.status]?.text,
                  }}>
                    <span className="w-1.5 h-1.5 rounded-full" style={{ background: statusConfig[video.status]?.dot }}></span>
                    {video.status}
                  </span>
                </div>

                <h3 className="font-semibold text-slate-100 mb-2 line-clamp-2 leading-snug">
                  {video.title}
                </h3>
                <p className="text-sm text-slate-500 mb-3">{video.channel} • {video.dateAdded}</p>

                {/* Summary */}
                {video.summary ? (
                  <div className="bg-purple-500/10 rounded-xl p-3 border border-purple-500/20">
                    <div className="text-xs text-purple-400 font-semibold mb-2 uppercase tracking-wide">
                      ✨ AI 學習摘要
                    </div>
                    <div className="text-sm text-slate-300 whitespace-pre-line leading-relaxed">
                      {video.summary}
                    </div>
                    {video.keyTakeaway && (
                      <div className="mt-3 pt-3 border-t border-purple-500/20">
                        <div className="text-xs text-pink-400 font-semibold mb-1">💡 一句話學到</div>
                        <div className="text-sm text-yellow-300 italic">「{video.keyTakeaway}」</div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="bg-slate-500/10 rounded-xl p-3 border border-dashed border-slate-500/30 text-center">
                    <p className="text-sm text-slate-500 mb-2">📝 尚未整理摘要</p>
                    <button className="text-xs text-blue-400 bg-blue-500/20 px-3 py-1.5 rounded-lg font-medium hover:bg-blue-500/30 transition-colors">
                      請 Claude 幫我整理
                    </button>
                  </div>
                )}

                {/* Actions */}
                <div className="flex gap-2 mt-3">
                  <button className="flex-1 py-2.5 rounded-lg border border-white/10 bg-white/5 text-slate-400 text-sm font-medium hover:bg-white/10 transition-colors">
                    ▶️ 觀看
                  </button>
                  <button className="px-4 py-2.5 rounded-lg border border-green-500/30 bg-green-500/10 text-green-400 text-sm font-medium hover:bg-green-500/20 transition-colors">
                    ✓ 完成
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>

        {filteredVideos.length === 0 && (
          <div className="text-center py-16">
            <div className="text-5xl mb-4">🔍</div>
            <p className="text-lg text-slate-400 font-medium">找不到符合條件的影片</p>
            <p className="text-sm text-slate-500 mt-1">試試調整篩選條件</p>
          </div>
        )}
      </main>

      {/* Add Modal */}
      {showAddModal && (
        <div
          className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          onClick={() => setShowAddModal(false)}
        >
          <div
            className="bg-gradient-to-b from-slate-800 to-slate-900 rounded-2xl p-6 w-full max-w-md border border-white/10 shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <h2 className="text-xl font-bold mb-2">➕ 新增 YouTube 影片</h2>
            <p className="text-slate-400 text-sm mb-5">貼上連結，自動抓取影片資訊</p>
            
            <input
              type="text"
              placeholder="貼上 YouTube 網址..."
              className="w-full px-4 py-3 rounded-xl border border-white/10 bg-white/5 text-slate-200 mb-4 outline-none focus:border-blue-500/50"
            />

            <div className="mb-4">
              <label className="text-sm text-slate-400 mb-2 block">分類</label>
              <div className="flex flex-wrap gap-2">
                {categories.slice(1).map(cat => (
                  <button key={cat} className="px-3 py-2 rounded-lg border border-white/10 bg-white/5 text-slate-300 text-sm hover:bg-white/10 transition-colors">
                    {categoryConfig[cat]?.icon} {cat}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowAddModal(false)}
                className="flex-1 py-3 rounded-xl border border-white/10 text-slate-400 font-medium hover:bg-white/5 transition-colors"
              >
                取消
              </button>
              <button className="flex-1 py-3 rounded-xl bg-gradient-to-r from-blue-500 to-purple-500 text-white font-semibold hover:from-blue-600 hover:to-purple-600 transition-all">
                新增影片
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Telegram Hint */}
      <div className="fixed bottom-6 right-6 bg-gradient-to-r from-sky-500 to-blue-500 rounded-2xl px-5 py-4 flex items-center gap-3 shadow-lg shadow-sky-500/30 cursor-pointer hover:scale-105 transition-transform">
        <span className="text-2xl">✈️</span>
        <div>
          <div className="font-semibold text-sm">Telegram 快速新增</div>
          <div className="text-xs text-white/70">@YT_video_DB_bot</div>
        </div>
      </div>
    </div>
  );
}

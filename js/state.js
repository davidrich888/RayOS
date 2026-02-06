// ==================== STATE ====================

let accounts = JSON.parse(localStorage.getItem('accounts')) || DEFAULT_ACCOUNTS;
let wealthGoal = parseInt(localStorage.getItem('wealth_goal')) || 6500000;
let quote = JSON.parse(localStorage.getItem('wealth_quote')) || {text:"Wealth is the ability to fully experience life.",author:"Henry David Thoreau"};
let wealthChartMode = 'trend';
let wealthChartType = 'total';
let wealthChartStyle = 'bar';
let currentBusiness = 'skool-free';
let wealthHistory = JSON.parse(JSON.stringify(PRELOAD_WEALTH_HISTORY));
let bodyHistory = JSON.parse(JSON.stringify(PRELOAD_BODY_HISTORY));
let bodyPhotos = [];
let physicGoal = JSON.parse(localStorage.getItem('physic_goal') || '{"start":21,"target":15,"height":175}');
let bodyNotionIndex = JSON.parse(localStorage.getItem('body_notion_index') || '{}');
let wealthNotionIndex = JSON.parse(localStorage.getItem('wealth_notion_index') || '{}');
let algoEquity = JSON.parse(JSON.stringify(PRELOAD_ALGO_EQUITY));
let propRecords = [];
let dailyHabitsData = {};

// Load from localStorage
try {
    const stored = localStorage.getItem('wealth_history');
    if (stored) { const parsed = JSON.parse(stored); if (parsed.length > 0) wealthHistory = parsed; }
    const storedBody = localStorage.getItem('body_history');
    if (storedBody) { const parsed = JSON.parse(storedBody); if (parsed.length > 0) bodyHistory = parsed; }
    const storedPhotos = localStorage.getItem('body_photos');
    if (storedPhotos) bodyPhotos = JSON.parse(storedPhotos);
    const storedAlgo = localStorage.getItem('algo_equity');
    if (storedAlgo) { const parsed = JSON.parse(storedAlgo); if (parsed.length > 0) algoEquity = parsed; }
    const storedProp = localStorage.getItem('prop_records');
    if (storedProp) propRecords = JSON.parse(storedProp);
    const storedDaily = localStorage.getItem('daily_habits');
    if (storedDaily) { 
        dailyHabitsData = JSON.parse(storedDaily);
    }
} catch(e) { console.log('localStorage error:', e); }

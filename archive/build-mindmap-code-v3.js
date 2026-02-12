// =============================================
// Miro Mind Map Builder - All-in-One
// Uses axios (bundled in N8N)
// =============================================

const axios = require('axios');
const input = $input.first().json;

// ---------- CONFIG ----------
const MIRO_TOKEN = input.miro_token || 'eyJtaXJvLm9yaWdpbiI6ImV1MDEifQ_pfOH483nNDCOCMOGbF9Tf4GWbCc';
const BOARD_ID = input.board_id || 'uXjVLCeP6Ro=';
const LEVEL_GAP_X = 500;
const NODE_GAP_Y = 150;
const API_DELAY_MS = 350;

// Auto-offset
const staticData = $getWorkflowStaticData('global');
const mapCount = staticData.mapCount || 0;
staticData.mapCount = mapCount + 1;
const ROOT_X = mapCount * 5000;
const ROOT_Y = 0;

// ---------- STYLES ----------
const STYLES = {
  root: { fillColor: '#1a1a2e', fontColor: '#ffffff', fontSize: '18', borderColor: '#e94560', borderWidth: '2', width: 360, height: 80 },
  section: { fillColor: '#16213e', fontColor: '#ffffff', fontSize: '16', borderColor: '#0f3460', borderWidth: '2', width: 300, height: 65 },
  normal: { fillColor: '#f5f5f5', fontColor: '#1a1a2e', fontSize: '14', borderColor: '#cccccc', borderWidth: '1', width: 300, height: 60 },
  red_emphasis: { fillColor: '#fff0f0', fontColor: '#cc0000', fontSize: '14', borderColor: '#e94560', borderWidth: '2', width: 300, height: 60 },
  blue_underline: { fillColor: '#f0f5ff', fontColor: '#0055cc', fontSize: '14', borderColor: '#4d94ff', borderWidth: '1', width: 300, height: 60 },
  screenshot: { fillColor: '#fffde7', fontColor: '#666666', fontSize: '12', borderColor: '#ffd54f', borderWidth: '1', width: 280, height: 50 },
  white_container: { fillColor: '#ffffff', fontColor: '#333333', fontSize: '14', borderColor: '#e0e0e0', borderWidth: '1', width: 320, height: 65 },
  quote: { fillColor: '#f9f9f9', fontColor: '#555555', fontSize: '13', borderColor: '#aaaaaa', borderWidth: '1', width: 300, height: 60 }
};

// ---------- HELPERS ----------
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function miroPost(endpoint, body) {
  const url = `https://api.miro.com/v2/boards/${BOARD_ID}/${endpoint}`;
  try {
    const resp = await axios.post(url, body, {
      headers: {
        'Authorization': `Bearer ${MIRO_TOKEN}`,
        'Content-Type': 'application/json'
      }
    });
    return resp.data;
  } catch (err) {
    const detail = err.response ? JSON.stringify(err.response.data) : err.message;
    return { error: detail };
  }
}

// ---------- LAYOUT ----------
function assignPositions(node, level, yStart) {
  node._x = ROOT_X + level * LEVEL_GAP_X;
  if (!node.children || node.children.length === 0) {
    node._y = yStart;
    return yStart + NODE_GAP_Y;
  }
  let currentY = yStart;
  for (const child of node.children) {
    currentY = assignPositions(child, level + 1, currentY);
  }
  const firstY = node.children[0]._y;
  const lastY = node.children[node.children.length - 1]._y;
  node._y = (firstY + lastY) / 2;
  return currentY;
}

function flattenBFS(root) {
  const shapes = [];
  const connectorPairs = [];
  const queue = [{ node: root, parentOurId: null }];
  while (queue.length > 0) {
    const { node, parentOurId } = queue.shift();
    shapes.push({ ourId: node.id, parentOurId, text: node.text, style: node.style || 'normal', x: node._x, y: node._y });
    if (parentOurId) connectorPairs.push({ fromOurId: parentOurId, toOurId: node.id });
    if (node.children) {
      for (const child of node.children) {
        queue.push({ node: child, parentOurId: node.id });
      }
    }
  }
  return { shapes, connectorPairs };
}

// ---------- MAIN ----------
const rootNode = input.nodes || input;
const tree = Array.isArray(rootNode) ? rootNode[0] : rootNode;

assignPositions(tree, 0, ROOT_Y);
const { shapes, connectorPairs } = flattenBFS(tree);

const log = [];
const idMap = {};

// Create shapes
for (let i = 0; i < shapes.length; i++) {
  const s = shapes[i];
  const st = STYLES[s.style] || STYLES.normal;
  const body = {
    data: { content: `<p>${s.text}</p>`, shape: 'round_rectangle' },
    style: { fillColor: st.fillColor, fontColor: st.fontColor, fontSize: st.fontSize, borderColor: st.borderColor, borderWidth: st.borderWidth, textAlign: 'center', textAlignVertical: 'middle' },
    geometry: { width: st.width, height: st.height },
    position: { x: s.x, y: s.y }
  };
  const resp = await miroPost('shapes', body);
  if (resp.error) {
    log.push(`❌ Shape "${s.text}": ${resp.error}`);
  } else {
    idMap[s.ourId] = resp.id;
    log.push(`✅ Shape "${s.text}" → ${resp.id}`);
  }
  if (i < shapes.length - 1) await sleep(API_DELAY_MS);
}

// Create connectors
let connectorsCreated = 0;
for (let i = 0; i < connectorPairs.length; i++) {
  const c = connectorPairs[i];
  const startId = idMap[c.fromOurId];
  const endId = idMap[c.toOurId];
  if (!startId || !endId) {
    log.push(`⚠️ Connector skipped: ${c.fromOurId} or ${c.toOurId} missing`);
    continue;
  }
  const body = {
    startItem: { id: startId },
    endItem: { id: endId },
    shape: 'straight',
    style: { strokeColor: '#888888', strokeWidth: '1.5', startStrokeCap: 'none', endStrokeCap: 'stealth' }
  };
  const resp = await miroPost('connectors', body);
  if (resp.error) {
    log.push(`❌ Connector: ${resp.error}`);
  } else {
    connectorsCreated++;
    log.push(`✅ Connector ${c.fromOurId} → ${c.toOurId}`);
  }
  if (i < connectorPairs.length - 1) await sleep(API_DELAY_MS);
}

return [{
  json: {
    success: true,
    shapesCreated: Object.keys(idMap).length,
    connectorsCreated,
    totalShapes: shapes.length,
    totalConnectors: connectorPairs.length,
    boardUrl: `https://miro.com/app/board/${BOARD_ID}/`,
    log
  }
}];

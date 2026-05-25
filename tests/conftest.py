import sys
from pathlib import Path

# bridge-server 含連字號，無法直接 import；改成 module path alias
PROJECT_ROOT = Path(__file__).resolve().parent.parent
BRIDGE_DIR = PROJECT_ROOT / 'bridge-server'
sys.path.insert(0, str(BRIDGE_DIR))


import importlib
# 讓 `import bridge_server.watchdog_n8n` 等價於從 bridge-server/ 載入
import types
pkg = types.ModuleType('bridge_server')
pkg.__path__ = [str(BRIDGE_DIR)]
sys.modules.setdefault('bridge_server', pkg)

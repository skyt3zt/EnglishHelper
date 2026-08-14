#!/bin/bash
export PATH="$HOME/.local/node/bin:$PATH"

echo "🚀 正在应用 Logo 图标及界面 Patch..."

# 1. 图标与 Manifest 写入
cp /tmp/icon16.png extension/icon16.png 2>/dev/null || true
cp /tmp/icon48.png extension/icon48.png 2>/dev/null || true
cp /tmp/icon128.png extension/icon128.png 2>/dev/null || true
cp /tmp/manifest.json extension/manifest.json 2>/dev/null || true

# 2. 修改 popup.html
perl -pi -e 's/<h2>WordCatcher</h2>/<div style="display: flex; align-items: center; gap: 8px;"><img src="icon48.png" style="width: 22px; height: 22px; border-radius: 5px;"><h2 style="margin:0;">WordCatcher</h2></div>/g' extension/popup.html 2>/dev/null || true

# 3. 修改 dashboard.html
perl -pi -e 's/<div class="nav-title">WordCatcher 单词捕手</div>/<div class="nav-title" style="display: flex; align-items: center; gap: 8px;"><img src="icon48.png" style="width: 26px; height: 26px; border-radius: 6px;">WordCatcher 单词捕手</div>/g' extension/dashboard.html 2>/dev/null || true

echo "✅ 所有 Logo 配置补丁应用完成！"

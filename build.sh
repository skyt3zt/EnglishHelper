#!/bin/bash

echo "🚀 开始构建并加密 WordCatcher 插件..."

# Add local node to PATH if it exists
if [ -d "$HOME/.local/node/bin" ]; then
    export PATH="$HOME/.local/node/bin:$PATH"
fi

# 1. 检查环境
if ! command -v npx &> /dev/null; then
    echo "⚠️ 检测到您的电脑未安装 Node.js，代码混淆需要依赖它。"
    echo "⏳ 正在通过 Homebrew 自动为您安装 Node.js，请稍候..."
    brew install node
    if [ $? -ne 0 ]; then
        echo "❌ Node.js 安装失败，请手动运行 'brew install node' 后重试。"
        exit 1
    fi
fi

# 1.5 提取版本号
VERSION=$(node -p "require('./extension/manifest.json').version")
echo "📌 检测到当前版本号: v$VERSION"
OUTPUT_DIR="wordcatcher_v$VERSION"
ZIP_NAME="${OUTPUT_DIR}.zip"

# 2. 清理旧文件
echo "🧹 清理旧的构建文件..."
rm -rf dist wordcatcher_release.zip wordcatcher_v*
mkdir -p "$OUTPUT_DIR"

# 3. 复制不需要混淆的文件
echo "📦 正在复制静态文件 (HTML, CSS, JSON)..."
cp extension/manifest.json "$OUTPUT_DIR/"
cp extension/*.html "$OUTPUT_DIR/"
cp extension/*.css "$OUTPUT_DIR/"
if ls extension/*.png 1> /dev/null 2>&1; then
    cp extension/*.png "$OUTPUT_DIR/"
fi

# 4. 混淆加密 JavaScript 代码
echo "🔒 正在对核心逻辑进行极强混淆加密..."
# 我们使用业界最强的 javascript-obfuscator
# 开启了控制流平坦化、死代码注入、字符串Base64加密、禁止控制台输出等高级防御
for js_file in extension/*.js; do
    filename=$(basename -- "$js_file")
    echo "  -> 正在加密 $filename"
    
    npx -y javascript-obfuscator "$js_file" \
        --output "$OUTPUT_DIR/$filename" \
        --compact true \
        --control-flow-flattening true \
        --dead-code-injection true \
        --string-array true \
        --string-array-encoding 'base64' \
        --disable-console-output true
done

# 5. 压缩成上架可用的 ZIP
echo "🗜️ 正在生成最终的 ZIP 压缩包..."
cd "$OUTPUT_DIR"
zip -r "../$ZIP_NAME" ./* > /dev/null
cd ..

# 6. 完成
echo "✅ 构建完成！"
echo "🎉 您的最终发布包已生成：$(pwd)/$ZIP_NAME"
echo "（您可以把这个 ZIP 文件直接上传到 Chrome Web Store）"

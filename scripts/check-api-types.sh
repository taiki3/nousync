#!/bin/bash
# API型チェックスクリプト

echo "🔍 Checking API TypeScript types..."

cd "$(dirname "$0")/.." || exit 1

# TypeScript設定を作成
cat > /tmp/tsconfig.api.json <<EOF
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "node",
    "esModuleInterop": true,
    "skipLibCheck": true,
    "strict": false,
    "noEmit": true,
    "resolveJsonModule": true
  },
  "include": ["api/**/*.ts"]
}
EOF

# 型チェック実行
pnpm tsc --project /tmp/tsconfig.api.json

if [ $? -eq 0 ]; then
  echo "✅ All API types are valid"
else
  echo "❌ Type check failed"
  exit 1
fi

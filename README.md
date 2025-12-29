# MATSU - 洛星文化祭チケットシステム

「MATSU」は洛星文化祭のための入場チケット予約・管理システムです。  
属性ベースのクォータ管理、動的フォーム、QRコードチェックインをサポートしています。

## 🎯 機能

- **チケット予約**: 日時と入場者種別を選んでチケットを予約
- **属性ベースのクォータ**: 保護者・在校生・一般など種別ごとの購入上限
- **動的フォーム**: 種別に応じた追加情報の入力
- **QRコードチェックイン**: 当日のスムーズな入場管理
- **Apple Wallet風マイページ**: 予約したチケットを一覧表示

## 🛠 技術スタック

### Backend
- Django 5.x + Django REST Framework
- PostgreSQL (JSONB対応)
- django-unfold (モダンな管理画面)

### Frontend
- Next.js 14 (App Router)
- TypeScript
- Tailwind CSS + shadcn/ui
- Zustand (状態管理)
- Framer Motion (アニメーション)

## 📂 プロジェクト構造

```
matsu/
├── backend/              # Django API
│   ├── core/             # プロジェクト設定
│   ├── api/              # APIアプリ
│   │   ├── models.py     # データモデル
│   │   ├── views.py      # APIビュー
│   │   ├── serializers.py
│   │   └── urls.py
│   └── manage.py
│
└── frontend/             # Next.js フロントエンド
    ├── app/              # App Router ページ
    ├── components/       # UIコンポーネント
    ├── lib/              # ユーティリティ
    └── store/            # Zustand ストア
```

## 🚀 セットアップ

### 前提条件
- Python 3.11+
- Node.js 18+
- PostgreSQL 14+ (または開発用にSQLite)

### Backend セットアップ

```bash
# バックエンドディレクトリへ移動
cd backend

# 仮想環境を作成
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate

# 依存関係をインストール
pip install -r requirements.txt

# 環境変数を設定（開発用SQLiteを使用する場合）
export USE_SQLITE=True
export DEBUG=True

# マイグレーション実行
python manage.py migrate

# サンプルデータを作成
python manage.py create_sample_data

# 管理者ユーザーを作成
python manage.py createsuperuser

# 開発サーバー起動
python manage.py runserver
```

### Frontend セットアップ

```bash
# フロントエンドディレクトリへ移動
cd frontend

# 依存関係をインストール
npm install

# 開発サーバー起動
npm run dev
```

## 🌐 アクセス

- **フロントエンド**: http://localhost:3000
- **API**: http://localhost:8000/api/
- **管理画面**: http://localhost:8000/admin/

## 📡 API エンドポイント

| メソッド | エンドポイント | 説明 |
|---------|---------------|------|
| GET | `/api/slots/` | 入場枠一覧 |
| GET | `/api/attributes/` | 属性設定一覧 |
| GET | `/api/reservations/` | 予約一覧 |
| GET | `/api/tickets/by_user/?user_id=xxx` | ユーザーのチケット |
| POST | `/api/checkout/` | チケット購入 |
| POST | `/api/checkin/` | QRチェックイン |

## 📋 環境変数

### Backend (.env)

```env
# Django
DJANGO_SECRET_KEY=your-secret-key
DEBUG=True
ALLOWED_HOSTS=localhost,127.0.0.1

# Database (PostgreSQL)
DB_NAME=matsu_db
DB_USER=postgres
DB_PASSWORD=postgres
DB_HOST=localhost
DB_PORT=5432

# Or use SQLite for development
USE_SQLITE=True

# CORS
CORS_ALLOWED_ORIGINS=http://localhost:3000
```

### Frontend (.env.local)

```env
NEXT_PUBLIC_API_URL=http://localhost:8000
```

## 🎨 デザインテーマ

**Festival Modern** - サイバーフィジカルな雰囲気

- 背景: Deep Indigo/Violet グラデーション
- アクセント: Neon Blue/Cyan
- カード: Glassmorphism効果
- ダークモード最適化

## 📱 主要コンポーネント

- `TimeSlotPicker`: グリッド形式の時間枠選択
- `AttributeSelector`: 入場者種別の選択カード
- `SmartCart`: スティッキーボトムバーのカート
- `TicketCard`: QRコード付きチケット表示
- `DynamicForm`: JSONスキーマベースの動的フォーム

## 🔐 チェックインフロー

1. ゲート端末でQRコードをスキャン
2. `POST /api/checkin/` にチケットUUIDを送信
3. レスポンス:
   - `200`: 入場成功
   - `409`: 既に入場済み
   - `410`: 無効なチケット
   - `404`: チケットが見つからない

## 📝 ライセンス

MIT License

# MATSU プロジェクトドキュメント

## 1. プロジェクト概要
「MATSU」は洛星文化祭のための入場チケット予約・管理システムです。
属性ベースのクォータ管理（保護者、在校生、一般など）、動的フォームによる情報収集、QRコードを用いた当日の入場管理機能を提供します。

## 2. システム構成

### バックエンド (Backend)
- **フレームワーク**: Django 5.x + Django REST Framework
- **データベース**: SQLite (開発用) / PostgreSQL (本番想定)
- **ポート**: 8005
- **主な機能**:
  - ユーザー認証 (JWT)
  - チケット在庫管理 (EntrySlot)
  - 属性別設定 (AttributeConfig)
  - 予約・チケット発行
  - 管理者用ダッシュボード API

### フロントエンド (Frontend)
- **フレームワーク**: Next.js 14 (App Router)
- **言語**: TypeScript
- **スタイリング**: Tailwind CSS + shadcn/ui
- **ポート**: 3006
- **ディレクトリ**: `frontend-app`
- **主な機能**:
  - チケット予約フロー
  - マイページ (チケット表示)
  - 管理者ダッシュボード
  - QRコードスキャナー (入場管理)

## 3. 環境構築と実行

### 必要要件
- Python 3.10+
- Node.js 18+
- npm

### 起動方法
プロジェクトルートにある起動スクリプトを使用するのが最も簡単です。

```bash
# 実行権限の付与（初回のみ）
chmod +x start_dev_new.sh

# 開発サーバーの起動
./start_dev_new.sh
```

このスクリプトは以下の処理を自動で行います：
1. ポート 3006, 8005 の競合プロセスを停止
2. バックエンドの仮想環境作成・依存関係インストール・マイグレーション・起動
3. フロントエンドの依存関係インストール・起動

### 手動起動の場合

**バックエンド**
```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
python manage.py migrate
python manage.py runserver 8005
```

**フロントエンド**
```bash
cd frontend-app
npm install
npm run dev -- -p 3006
```

## 4. アクセス情報

- **トップページ (予約)**: [http://localhost:3006](http://localhost:3006)
- **管理者ログイン**: [http://localhost:3006/auth/login](http://localhost:3006/auth/login)
  - 初期アカウント: `admin` / `admin`
- **管理者ダッシュボード**: [http://localhost:3006/admin/dashboard](http://localhost:3006/admin/dashboard)
- **API ルート**: [http://localhost:8005/api](http://localhost:8005/api)
- **API 管理画面**: [http://localhost:8005/admin](http://localhost:8005/admin)

## 5. ディレクトリ構造

```
.
├── backend/                # Django バックエンド
│   ├── api/                # アプリケーションロジック
│   ├── core/               # 設定ファイル
│   └── manage.py
├── frontend-app/           # Next.js フロントエンド
│   ├── app/                # ページコンポーネント
│   ├── components/         # UIパーツ
│   ├── lib/                # APIクライアント・型定義
│   └── store/              # 状態管理 (Zustand)
├── start_dev_new.sh        # 起動スクリプト
└── DOCUMENTATION.md        # 本ドキュメント
```

## 6. トラブルシューティング

### サーバーが起動しない / ポートが使われている
`start_dev_new.sh` を使用すれば自動的に競合プロセスを終了させますが、手動で解決する場合は以下のコマンドを実行してください。

```bash
lsof -ti:3006,8005 | xargs kill -9
```

### フロントエンドのビルドエラー
`node_modules` の不整合が原因の場合があります。以下を実行して再インストールしてください。

```bash
cd frontend-app
rm -rf node_modules package-lock.json
npm install
```

### データベースのリセット
開発データをリセットしたい場合は、`backend/db.sqlite3` を削除してマイグレーションを再実行してください。

```bash
cd backend
rm db.sqlite3
python manage.py migrate
python manage.py create_sample_data  # サンプルデータ作成コマンドがある場合
```

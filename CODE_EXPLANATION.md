# MATSU プロジェクト コード完全解説書

このドキュメントは、MATSUプロジェクトのソースコードの構造と内容を詳細に解説するものです。
開発者がコードの意図を理解し、修正や拡張を行うためのリファレンスとして使用してください。

---

## 目次

1. [バックエンド (Django)](#1-バックエンド-django)
    - [データモデル (models.py)](#11-データモデル-modelspy)
    - [APIビュー (views.py)](#12-apiビュー-viewspy)
    - [シリアライザ (serializers.py)](#13-シリアライザ-serializerspy)
2. [フロントエンド (Next.js)](#2-フロントエンド-nextjs)
    - [ページ構成 (app/)](#21-ページ構成-app)
    - [状態管理 (store/)](#22-状態管理-store)
    - [APIクライアント (lib/api.ts)](#23-apiクライアント-libapits)
3. [重要なロジックの解説](#3-重要なロジックの解説)

---

## 1. バックエンド (Django)

バックエンドは `backend/` ディレクトリにあり、Django REST Framework (DRF) を使用してAPIを提供しています。

### 1.1 データモデル (`backend/api/models.py`)

データベースの構造を定義しています。

#### `EntrySlot` (入場枠)
文化祭の入場可能な時間枠を管理します。
- **フィールド**:
    - `event_date`: 開催日
    - `start_time` / `end_time`: 開始・終了時刻
    - `capacity`: 定員（最大人数）
    - `booked_count`: 現在の予約数
- **重要なプロパティ**:
    - `remaining`: 残席数 (`capacity - booked_count`) を計算します。
    - `availability_status`: UI表示用のステータス（"sold_out", "few_left" など）を返します。

#### `AttributeConfig` (属性設定)
ユーザー属性（在校生、保護者、一般など）ごとの設定を管理します。
- **フィールド**:
    - `target_type`: システム内部での識別子（例: "student", "general"）
    - `max_total_limit`: 1回の予約で購入できる最大枚数
    - `form_schema`: その属性に必要な入力フォームの定義（JSON形式）。フロントエンドはこのJSONを読んで動的にフォームを生成します。

#### `Reservation` (予約)
1回の注文（カート決済）を表します。
- **フィールド**:
    - `id`: "R-" で始まる予約ID
    - `guest_identifier`: 予約者を特定するID（ログインユーザーIDなど）
    - `total_tickets`: 含まれるチケットの総数

#### `Ticket` (チケット)
個別の入場券です。1つの予約(`Reservation`)に複数のチケットが含まれます。
- **フィールド**:
    - `slot`: 紐付いている入場枠(`EntrySlot`)
    - `attribute`: 紐付いている属性(`AttributeConfig`)
    - `guest_info`: そのチケット利用者の詳細情報（名前、学年など）。`AttributeConfig.form_schema` に基づいて入力されたデータがJSONで保存されます。
    - `status`: "valid"（有効）、"entered"（入場済み）、"cancelled"（キャンセル）

### 1.2 APIビュー (`backend/api/views.py`)

APIのリクエストを受け取り、処理を行う部分です。

#### `EntrySlotViewSet`
- **GET /api/slots/**: 有効な入場枠の一覧を返します。
- `EntrySlot` モデルから `is_active=True` のものを取得します。

#### `AttributeConfigViewSet`
- **GET /api/attributes/**: 有効な属性設定の一覧を返します。

#### `CheckoutView` (チェックアウト処理)
予約確定のメインロジックです。
1. **トランザクション開始**: データの整合性を保つため、処理全体をアトミックに行います。
2. **在庫チェック**: リクエストされた各チケットについて、対象の `EntrySlot` に空きがあるか再確認します。
    - `select_for_update()` を使用して、同時アクセスによるダブルブッキングを防ぎます。
3. **予約作成**: `Reservation` レコードを作成します。
4. **チケット作成**: 各チケットの `Ticket` レコードを作成し、`EntrySlot.booked_count` を加算します。
5. **完了**: 予約IDとチケット情報を返します。

### 1.3 シリアライザ (`backend/api/serializers.py`)

データベースのモデルとJSONデータの相互変換を行います。

#### `EntrySlotSerializer`
`EntrySlot` モデルをJSONに変換します。`remaining` や `availability_status` などの計算済みプロパティもここでフィールドとして定義し、フロントエンドに渡します。

#### `CheckoutRequestSerializer`
予約リクエストのバリデーション（入力チェック）を行います。
- 送られてきたチケットリストが空でないか確認します。
- 各チケットに必要な情報（`slot_id`, `attribute_id`）が含まれているか確認します。

---

## 2. フロントエンド (Next.js)

フロントエンドは `frontend-app/` ディレクトリにあり、Next.js (App Router) を使用しています。

### 2.1 ページ構成 (`frontend-app/app/`)

#### `page.tsx` (トップページ)
予約フローのメイン画面です。
- **主な機能**:
    - `getSlots()`, `getAttributes()` で初期データを取得。
    - ユーザーが「時間枠」と「属性」を選択するUIを提供。
    - `useCartStore` を使ってカートにチケットを追加。
- **状態管理**:
    - `selectedSlot`: 選択中の時間枠
    - `selectedAttribute`: 選択中の属性

#### `checkout/page.tsx` (予約確認画面)
カートの中身を確認し、予約を確定する画面です。
- カート内のチケット一覧を表示。
- 「予約確定」ボタンでAPIの `/checkout` エンドポイントを叩きます。

### 2.2 状態管理 (`frontend-app/store/`)

Zustandライブラリを使用して、アプリ全体の状態を管理しています。

#### `useCartStore.ts`
ショッピングカートの状態を管理します。
- **State**:
    - `items`: カートに入っているチケットの配列
- **Actions**:
    - `addItem(slot, attribute)`: カートに追加します。
        - 追加前に `canAddItem` で個数制限や在庫チェックを行います。
    - `removeItem(itemId)`: カートから削除します。
    - `updateGuestInfo(itemId, info)`: チケットごとの詳細情報（名前など）を更新します。
- **Persistence**:
    - `persist` ミドルウェアを使用しており、ブラウザを閉じてもカートの中身が保存されます（localStorage）。

### 2.3 APIクライアント (`frontend-app/lib/api.ts`)

バックエンドAPIとの通信を一手に引き受けるモジュールです。

- `fetchApi<T>`: `fetch` 関数のラッパーです。
    - ベースURL (`NEXT_PUBLIC_API_URL`) の付与
    - JSONヘッダーの自動付与
    - エラーハンドリング（HTTPステータスコードのチェック）
    - 認証トークンがある場合は自動的に `Authorization` ヘッダーに追加
- 各種関数 (`getSlots`, `getAttributes` など):
    - 具体的なAPIエンドポイントを呼び出す関数群です。型定義されたレスポンスを返します。

---

## 3. 重要なロジックの解説

### 動的フォーム (Dynamic Forms)
このシステムの大きな特徴は、ユーザー属性によって入力項目を変えられる点です。

1. **定義**: 管理者が `AttributeConfig` モデルの `form_schema` フィールドにJSONでフォーム定義を保存します（例: `[{"name": "grade", "label": "学年", "type": "select", ...}]`）。
2. **取得**: フロントエンドが `/api/attributes` を叩いてこのスキーマを取得します。
3. **生成**: `DynamicForm.tsx` コンポーネントがスキーマを読み取り、自動的に `<input>` や `<select>` タグを生成します。
4. **保存**: ユーザーが入力したデータはJSONとして `Ticket` モデルの `guest_info` フィールドにそのまま保存されます。

これにより、プログラムを修正することなく、「保護者には電話番号を聞くが、生徒には聞かない」といった変更が可能になっています。

### 排他制御 (Concurrency Control)
人気のある時間枠に同時に多数の予約が入った場合、定員を超えてしまうリスクがあります。
これを防ぐため、バックエンドの `CheckoutView` では `select_for_update()` を使用しています。

```python
# 擬似コード
with transaction.atomic():
    # ロックを取得して読み込む
    slot = EntrySlot.objects.select_for_update().get(id=slot_id)
    
    if slot.remaining > 0:
        slot.booked_count += 1
        slot.save()
    else:
        raise Error("売り切れです")
```

これにより、データベースレベルで行ロックがかかり、厳密な定員管理を実現しています。

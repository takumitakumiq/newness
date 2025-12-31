# プロモーションコード機能 - 実装ドキュメント

## 概要

MATSUチケット予約システムにプロモーションコード機能を追加しました。この機能により、管理者が割引コードを作成し、ユーザーがチェックアウト時にそのコードを入力して割引を受けることができます。

## 機能の詳細

### 1. プロモーションコードの管理

管理者は以下の設定でプロモーションコードを作成できます：

- **コード**: 一意の識別子（例: WELCOME2024）
- **割引額**: 円単位の割引額
- **有効期間**: 開始日時と終了日時
- **使用回数制限**: 最大使用回数（オプション）
- **有効/無効**: コードの有効/無効状態

### 2. ユーザー側の機能

ユーザーは以下の手順でプロモーションコードを使用できます：

1. チェックアウトページでプロモーションコードを入力
2. 「適用」ボタンをクリックしてコードを検証
3. 有効なコードの場合、割引額が表示される
4. 予約確定時に割引が自動適用される

### 3. セキュリティ機能

- **XSS対策**: すべての入力がサニタイズされます
- **レート制限**: チェックアウトエンドポイントは5リクエスト/分に制限
- **トランザクション**: プロモーションコードの使用回数更新はアトミック
- **二重チェック**: 有効期限と使用回数制限をトランザクション内で再検証

## 技術的な実装

### バックエンド

#### データベーススキーマ

**Reservationモデルへの追加フィールド:**
```python
promo_code = models.ForeignKey('PromoCode', on_delete=models.SET_NULL, null=True, blank=True)
discount_amount = models.PositiveIntegerField(default=0)
```

**PromoCodeモデルの改善:**
```python
discount_amount = models.PositiveIntegerField()  # IntegerField から変更
```

#### APIエンドポイント

**1. プロモーションコード検証**
```
GET /api/promocodes/validate_code/?code=XXXX
```

レスポンス例:
```json
{
  "valid": true,
  "message": "プロモーションコードが適用されました。",
  "discount_amount": 500,
  "code": "WELCOME2024"
}
```

**2. チェックアウト（更新）**
```
POST /api/checkout/
```

リクエストに `promo_code` フィールドを追加:
```json
{
  "user_name": "山田太郎",
  "user_email": "yamada@example.com",
  "promo_code": "WELCOME2024",
  "tickets": [...]
}
```

レスポンスに割引情報を追加:
```json
{
  "reservation_id": "R-ABC123",
  "ticket_ids": ["uuid1", "uuid2"],
  "total_tickets": 2,
  "discount_amount": 500,
  "promo_code": "WELCOME2024",
  "created_at": "2024-05-15T10:30:00Z"
}
```

#### バリデーションロジック

プロモーションコードは以下の条件で検証されます：

1. コードが存在し、有効である
2. 有効期間内である
3. 使用回数制限に達していない

検証は以下の2箇所で実行されます：
- **事前検証**: `/api/promocodes/validate_code/` エンドポイント
- **トランザクション内検証**: チェックアウト時に `SELECT FOR UPDATE` で再検証

### フロントエンド

#### TypeScript型定義

```typescript
export interface PromoCodeValidation {
  valid: boolean;
  message: string;
  discount_amount?: number;
  code?: string;
}

export interface CheckoutRequest {
  user_name?: string;
  user_email?: string;
  tickets: TicketRequest[];
  promo_code?: string;  // 新規追加
}

export interface CheckoutResponse {
  reservation_id: string;
  ticket_ids: string[];
  total_tickets: number;
  discount_amount?: number;  // 新規追加
  promo_code?: string;  // 新規追加
  created_at: string;
}
```

#### UIコンポーネント

チェックアウトページに以下のUIを追加：

1. **プロモーションコード入力フィールド**
   - リアルタイム検証ボタン
   - ローディング状態表示
   - onBlurで大文字変換（UX改善）

2. **検証結果表示**
   - 成功時: 緑色の成功メッセージと割引額
   - エラー時: 赤色のエラーメッセージ

3. **完了画面**
   - 適用された割引額の表示

## テスト

### 単体テスト

```bash
cd backend
source venv/bin/activate
USE_SQLITE=true python manage.py test api.tests.PromoCodeModelTest
```

テスト内容:
- プロモーションコードの作成
- 使用回数のトラッキング

### セキュリティスキャン

CodeQLスキャンを実施し、脆弱性が0件であることを確認：
- Python: 0件
- JavaScript: 0件

## 使用例

### 管理者: プロモーションコードの作成

Django管理画面から:

1. 「Promo codes」セクションに移動
2. 「Add promo code」をクリック
3. 以下の情報を入力:
   - Code: SPRING2024
   - Discount amount: 1000
   - Valid from: 2024-03-01 00:00:00
   - Valid until: 2024-03-31 23:59:59
   - Usage limit: 100
   - Is active: ✓
4. 「Save」をクリック

### ユーザー: プロモーションコードの使用

1. チケットを選択してカートに追加
2. チェックアウトページに進む
3. 「プロモーションコード」フィールドに「SPRING2024」と入力
4. 「適用」ボタンをクリック
5. 成功メッセージと割引額（1000円）が表示される
6. 予約者情報を入力して「予約を確定する」をクリック
7. 完了画面で割引が適用されたことを確認

## 今後の改善案

1. **パーセンテージ割引**: 固定額だけでなく、パーセンテージでの割引もサポート
2. **属性別割引**: 特定の属性（学生、保護者など）にのみ適用できるプロモーションコード
3. **複数コード適用**: 1回の予約で複数のプロモーションコードを適用可能に
4. **自動適用**: 条件を満たすと自動的に適用されるプロモーションコード
5. **使用履歴**: 各プロモーションコードの詳細な使用履歴を管理画面で表示

## 注意事項

- プロモーションコードは大文字小文字を区別しません（自動的に大文字に変換されます）
- 使用回数制限に達したコードは自動的に無効になります
- 有効期限切れのコードを使用しようとすると、適切なエラーメッセージが表示されます
- トランザクション処理により、競合状態でも正確な使用回数管理が保証されます

## サポート

問題や質問がある場合は、以下のドキュメントを参照してください：
- API_DOCUMENTATION.md: 詳細なAPIリファレンス
- README.md: システム全体の概要
- CODE_EXPLANATION.md: コードの詳細な説明

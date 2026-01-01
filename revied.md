# コードレビュー（2026-01-01）

対象: MATSU システム（Django/DRF + Next.js）

## 結論

直近の修正（譲渡 / チェックイン / チャット）は方向性は良いものの、**API互換性の破壊**と**データ整合性の取りこぼし**が残っており、現状のままだとフロントが正しく動かない可能性が高いです。

### 最終判定（修正反映後）

**B+（本番運用“前提”なら要改善が残るが、主要リスクは潰せている）**

#### 修正で解消できた点（レビュー指摘 → 対応済み）
- チャットAPIを配列レスポンスに戻してフロント互換を維持（Critical 1）
- 譲渡受け取りAPIのレスポンスを `{ success, message, ticket }` に統一（Critical 2）
- 譲渡受け取りでロック取得後に状態再検証（TOCTOU対策）を追加（Major 3）
- チャットのカーソルを `created_at` ベースにし、`count()` をやめて `limit+1` 方式へ（Major 4 / 5）

#### まだ残る重要課題（B+止まりの理由）
- **psutil 依存**: `views.py` 内で `psutil` を import しているが、環境によって未インストールだと解析/デプロイで問題になり得る（requirements へ追加 or import ガードが必要）
- **チャットの負荷**: フロントは 3 秒ポーリング固定のため、利用者増でサーバ負荷が読みにくい（差分取得/間隔調整、将来的に SSE/WebSocket など検討）
- **テスト不足**: 譲渡・チェックイン・在庫ロックは回帰しやすいので、最小限の自動テストが欲しい

---

## Critical（今すぐ直すべき）

### 1) チャットAPIのレスポンス形式がフロントと不一致
- **バックエンド**: `GET /api/chat/messages` が `{ messages, has_more, oldest_id }` を返す。
- **フロント**: `data` が「配列」前提で、配列でないと空配列扱い（=表示ゼロ）になる。
- **影響**: スタッフチャットが実質「常に空」になり得る。

### 2) 譲渡受け取りAPIのレスポンス形式がフロントと不一致
- **フロント**: `{ success, message, ticket }` を期待。
- **バックエンド**: `{ status: "accepted", message, ticket_id }` を返している。
- **影響**: フロントの型（TypeScript）と不整合で、運用で高確率にコケる。

---

## Major（安全性/整合性の重要改善）

### 3) 譲渡受け取りの検証がロック下で完結していない（TOCTOU）
- `Serializer` 側で `ticket.status == VALID` を見ているが、その時点では DB ロック無し。
- `View` 側で `select_for_update()` しているが、**ロック後に `transfer.status / expires_at / ticket.status` を再検証していない**。
- **影響**: 競合や悪意ある操作で「検証時点と更新時点で状態が変わる」余地が残る。

### 4) チャットのページネーションカーソルが不安定
- `created_at` で並べているのに、フィルタは `id__lt=before_id`（UUID比較）。
- UUID は時系列と一致しないため、過去ログの取得が抜け/重複/順序崩れする可能性がある。

### 5) `has_more` 判定が重い
- `queryset.count()` はデータ増加で重くなる。
- `limit + 1` 件だけ取得して `has_more` 判定する方式が安定。

---

## Minor（品質/保守性）

### 6) 冗長 import
- `serializers.py` で `Ticket` を既に import 済みなのに、`TicketTransferAcceptSerializer` 内で再 import している（可読性/保守性の観点で不要）。

### 7) `operator` フィールドの扱い
- `CheckInRequestSerializer` に `operator` を残したまま、サーバ側で常に `request.user.username` を使うのはOK（後方互換）。
- ただし「入力しても無視される」ため仕様として明記するか、将来的に削除を検討。

---

## 推奨修正（最短コース）

### A) 互換性を壊さない方針（おすすめ）
- **チャット**: レスポンスを「配列」に戻して互換維持。
  - ページネーションは「クエリを受けるだけ」にして、メタ情報はヘッダ or 別エンドポイントで返す。
- **譲渡受け取り**: バックエンドをフロントの型に合わせる（`success` と `ticket` を返す）。
- **譲渡受け取り（整合性）**: `select_for_update()` 後に `transfer.status / expires_at / ticket.status` を再検証。
- **チャットカーソル**: `before` を `created_at` ベースにする（例: `before=<ISO datetime>`）か、`before_message_id` を受けて `created_at__lt` に変換。

---

## すぐ確認できるチェックリスト

- [ ] `GET /api/chat/messages` でフロントにメッセージが表示される
- [ ] 譲渡受け取りがフロントでエラーなく完了する（レスポンス型が一致）
- [ ] 競合状況でも譲渡の二重受け取り/期限切れ受け取りが起きない（ロック後再検証）
- [ ] 過去ログ取得で抜け/重複/順序崩れがない（created_at カーソル）

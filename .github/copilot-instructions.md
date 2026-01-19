# Copilot Instructions (MATSU)

このリポジトリで GitHub Copilot Chat を使うときの共通指示です。

## 重要
- 変更は最小差分。既存API/既存UIの互換性を優先する。
- 重要操作（チェックイン、譲渡、管理系）は `request.user` で操作者を確定し、クライアント入力を信用しない。
- 競合があり得る操作は DB ロック（`select_for_update`）+ ロック後再検証。
- フロントは `NEXT_PUBLIC_API_URL` を参照して REST/WebSocket 接続先を決める。

## 進め方（最短ルート）
- まず「何を直す/足すか」を 1〜3 行で要約してから着手する。
- 既存実装の流儀を優先：似た機能の実装箇所を探して同じパターンで追加する。
- 調査→最小パッチ→影響範囲のテスト、の順に進める（大改修は避ける）。
- 曖昧点があっても進められる場合は仮定を置いて実装し、最後に確認事項として列挙する。

## 変更の原則
- 既存の公開API/URL/レスポンス形式/既存UI導線を壊さない。
- ついでのリファクタ・整形・名前変更はしない（目的に直結する範囲のみ）。
- 例外系（権限不足、在庫不足、二重実行、期限切れ）を先に設計してから実装する。

## 競合・安全性（必須）
- 競合が起きうる処理（予約枠・在庫・譲渡・決済・チェックイン等）は `transaction.atomic()` + `select_for_update()` を基本とし、ロック取得後に再検証する。
- 権限・操作者は常にサーバ側で決定：`request.user` を唯一の信頼ソースにする。
- クライアントから渡ってくる `user_id` / `operator` / `is_admin` 等は信用しない。

## 調査のやり方（速く迷わない）
- まず全文検索で入口を特定：URL/serializer名/model名/permission名を起点に辿る。
- 追加先に迷ったら、既存の近い機能（例：転送・お知らせ・チャット）をコピーして差分最小で作る。
- 仕様は FEATURE_INSTRUCTION.md を一次情報、CODE_EXPLANATION.md を実装意図の補助として扱う。

## テスト・確認（最低限）
- 変更した層に合わせて最小確認を実施する：
	- Backend：該当APIを叩いて 2〜3 ケース（正常/権限NG/競合系）
	- Frontend：該当画面で 2〜3 ケース（初期表示/送信/エラー表示）
- 追加したバリデーションや権限は、失敗ケースを必ず確認する。
- 可能なら「壊してない確認」として主要導線（購入/マイページ/管理）を一回ずつ触る。

## Backend 実装メモ（Django + DRF + Channels）
- 入口は `backend/api/urls.py` → `views.py` / `serializers.py` / `permissions.py` の順で辿る。
- DB更新があるAPIは原則 `transaction.atomic()`。
- 権限は View/Permission で担保し、Serializer の `create/update` はデータ整合性中心にする。

## Frontend 実装メモ（Next.js App Router + TS）
- API接続は `NEXT_PUBLIC_API_URL` を参照して統一する（直書きしない）。
- UIは既存のコンポーネントを再利用し、同じ見た目/同じ挙動を優先する。
- ローディング/エラー/空状態を省略しない（運用で一番刺さる）。

## リポ構成
- Backend: `backend/`（Django + DRF + Channels）
- Frontend: `frontend/`（Next.js App Router + TS）

## 実装時の出力フォーマット
- まず関連ファイルと理由
- 次に変更方針（2〜3案）
- 推奨案のパッチ
- 最後にテスト/確認手順

## レビューで見るポイント
- 権限：`request.user` 起点で漏れがないか
- 競合：`select_for_update` + 再検証になっているか
- 互換性：既存レスポンス/既存UIを壊していないか
- 例外系：ユーザーに伝わるエラーになっているか

## 参考
- 要件/タスク: `FEATURE_INSTRUCTION.md`
- 実装解説: `CODE_EXPLANATION.md`
- 起動: `start_system.sh`（`NEXT_PUBLIC_API_URL` を設定して起動）

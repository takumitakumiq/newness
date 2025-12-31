#!/bin/bash

# ============================================
# MATSU システム起動スクリプト
# ============================================

set -e

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
BACKEND_DIR="$PROJECT_DIR/backend"
FRONTEND_DIR="$PROJECT_DIR/frontend"
VENV_DIR="$PROJECT_DIR/.venv"

# 色付きログ
log_info() { echo -e "\033[0;34m[INFO]\033[0m $1"; }
log_success() { echo -e "\033[0;32m[OK]\033[0m $1"; }
log_error() { echo -e "\033[0;31m[ERROR]\033[0m $1"; }
log_warn() { echo -e "\033[0;33m[WARN]\033[0m $1"; }

# バナー表示
echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║                    🎪 MATSU システム起動                      ║"
echo "║                  文化祭チケット管理システム                    ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

# ポート定義
BACKEND_PORT=8005
FRONTEND_PORT=3006

# 既存プロセスの停止
stop_existing() {
    log_info "既存のプロセスを確認中..."
    
    # バックエンドポート確認
    if lsof -i :$BACKEND_PORT > /dev/null 2>&1; then
        log_warn "ポート $BACKEND_PORT が使用中です。停止します..."
        lsof -ti :$BACKEND_PORT | xargs kill -9 2>/dev/null || true
        sleep 1
    fi
    
    # フロントエンドポート確認
    if lsof -i :$FRONTEND_PORT > /dev/null 2>&1; then
        log_warn "ポート $FRONTEND_PORT が使用中です。停止します..."
        lsof -ti :$FRONTEND_PORT | xargs kill -9 2>/dev/null || true
        sleep 1
    fi
    
    log_success "ポートの確認完了"
}

# 仮想環境の確認・作成
setup_venv() {
    log_info "Python仮想環境を確認中..."
    
    if [ ! -d "$VENV_DIR" ]; then
        log_info "仮想環境を作成中..."
        python3 -m venv "$VENV_DIR"
    fi
    
    source "$VENV_DIR/bin/activate"
    log_success "仮想環境をアクティベート"
}

# バックエンドのセットアップ
setup_backend() {
    log_info "バックエンドの依存関係を確認中..."
    
    cd "$BACKEND_DIR"
    
    # 依存関係インストール（必要な場合のみ）
    if [ ! -f ".deps_installed" ] || [ "requirements.txt" -nt ".deps_installed" ]; then
        log_info "Pythonパッケージをインストール中..."
        pip install -q -r requirements.txt
        touch .deps_installed
    fi
    
    # マイグレーション適用
    log_info "データベースマイグレーションを確認中..."
    python manage.py migrate --check > /dev/null 2>&1 || python manage.py migrate
    
    log_success "バックエンドのセットアップ完了"
}

# フロントエンドのセットアップ
setup_frontend() {
    log_info "フロントエンドの依存関係を確認中..."
    
    cd "$FRONTEND_DIR"
    
    # node_modulesが存在しない場合のみインストール
    if [ ! -d "node_modules" ]; then
        log_info "npmパッケージをインストール中..."
        npm install
    fi
    
    log_success "フロントエンドのセットアップ完了"
}

# バックエンドの起動
start_backend() {
    log_info "バックエンド (Django) を起動中..."
    
    cd "$BACKEND_DIR"
    source "$VENV_DIR/bin/activate"
    
    # バックグラウンドで起動
    python manage.py runserver 0.0.0.0:$BACKEND_PORT > /tmp/matsu_backend.log 2>&1 &
    BACKEND_PID=$!
    echo $BACKEND_PID > /tmp/matsu_backend.pid
    
    # 起動確認
    sleep 2
    if curl -s http://localhost:$BACKEND_PORT/api/health > /dev/null 2>&1; then
        log_success "バックエンド起動完了 (PID: $BACKEND_PID)"
    else
        log_warn "バックエンドの起動を待機中..."
        sleep 3
    fi
}

# フロントエンドの起動
start_frontend() {
    log_info "フロントエンド (Next.js) を起動中..."
    
    cd "$FRONTEND_DIR"
    
    # バックグラウンドで起動
    npm run dev -- -p $FRONTEND_PORT > /tmp/matsu_frontend.log 2>&1 &
    FRONTEND_PID=$!
    echo $FRONTEND_PID > /tmp/matsu_frontend.pid
    
    log_success "フロントエンド起動完了 (PID: $FRONTEND_PID)"
}

# 終了ハンドラ
cleanup() {
    echo ""
    log_info "システムを停止中..."
    
    if [ -f /tmp/matsu_backend.pid ]; then
        kill $(cat /tmp/matsu_backend.pid) 2>/dev/null || true
        rm /tmp/matsu_backend.pid
    fi
    
    if [ -f /tmp/matsu_frontend.pid ]; then
        kill $(cat /tmp/matsu_frontend.pid) 2>/dev/null || true
        rm /tmp/matsu_frontend.pid
    fi
    
    log_success "システムを停止しました"
    exit 0
}

# Ctrl+C のトラップ
trap cleanup SIGINT SIGTERM

# メイン処理
main() {
    stop_existing
    setup_venv
    setup_backend
    setup_frontend
    start_backend
    start_frontend
    
    echo ""
    echo "╔══════════════════════════════════════════════════════════════╗"
    echo "║                    ✅ システム起動完了                        ║"
    echo "╠══════════════════════════════════════════════════════════════╣"
    echo "║                                                              ║"
    echo "║  🌐 フロントエンド:  http://localhost:$FRONTEND_PORT              ║"
    echo "║  🔧 バックエンドAPI: http://localhost:$BACKEND_PORT/api           ║"
    echo "║  👨‍💼 管理画面:        http://localhost:$BACKEND_PORT/admin         ║"
    echo "║  👷 スタッフ画面:    http://localhost:$FRONTEND_PORT/staff        ║"
    echo "║                                                              ║"
    echo "╠══════════════════════════════════════════════════════════════╣"
    echo "║  終了するには Ctrl+C を押してください                          ║"
    echo "╚══════════════════════════════════════════════════════════════╝"
    echo ""
    
    # ログをリアルタイム表示
    log_info "ログを監視中... (Ctrl+C で終了)"
    tail -f /tmp/matsu_backend.log /tmp/matsu_frontend.log 2>/dev/null &
    TAIL_PID=$!
    
    # 待機
    wait $BACKEND_PID $FRONTEND_PID 2>/dev/null || true
    kill $TAIL_PID 2>/dev/null || true
}

# 実行
main

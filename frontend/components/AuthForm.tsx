"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { LogIn, UserPlus, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useAuthStore } from "@/store/useAuthStore";

interface AuthFormProps {
  onSuccess?: () => void;
}

export function AuthForm({ onSuccess }: AuthFormProps) {
  const { login, register } = useAuthStore();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const getLoginErrorMessage = (err: any) => {
    const detail = err?.detail || err?.message;
    const nonField = Array.isArray(err?.non_field_errors) ? err.non_field_errors[0] : null;
    const status = err?.status || err?.statusCode || err?.response?.status;
    const raw = nonField || detail || "ログインに失敗しました";
    if (err?.name === "TypeError" || raw === "Failed to fetch") {
      return "サーバーに接続できません。時間をおいて再度お試しください";
    }
    if (status === 401) {
      return "ユーザー名またはパスワードが正しくありません";
    }
    if (status === 403) {
      return "アクセス権限がありません";
    }
    if (status === 500) {
      return "サーバー側でエラーが発生しました";
    }
    if (typeof raw === "string") {
      if (raw.includes("No active account")) {
        return "ユーザー名またはパスワードが正しくありません";
      }
      if (raw.includes("HTTP Error: 401")) {
        return "ユーザー名またはパスワードが正しくありません";
      }
      if (raw.includes("invalid") || raw.includes("unauthorized")) {
        return "ユーザー名またはパスワードが正しくありません";
      }
      if (raw.includes("inactive")) {
        return "このアカウントは無効になっています。運営にお問い合わせください";
      }
      return raw;
    }
    return "ログインに失敗しました。ユーザー名・パスワードをご確認ください。";
  };
  
  const [formData, setFormData] = useState({
    username: "",
    email: "",
    password: "",
    password_confirm: "",
    first_name: "",
    last_name: "",
  });

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    
    try {
      if (!formData.username || !formData.password) {
        setError("ユーザー名とパスワードを入力してください");
        setLoading(false);
        return;
      }
      await login(formData.username, formData.password);
      onSuccess?.();
    } catch (err: any) {
      setError(getLoginErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    
    if (formData.password !== formData.password_confirm) {
      setError("パスワードが一致しません");
      return;
    }
    
    setLoading(true);
    try {
      await register(formData);
      onSuccess?.();
    } catch (err: any) {
      const errorMessage = err.username?.[0] || err.email?.[0] || err.password?.[0] || err.message || "登録に失敗しました";
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md"
      >
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-3 mb-4">
            <img
              src="/matsu-logo.svg"
              alt="MATSU ロゴ"
              className="h-10 w-10 rounded-md bg-white p-1 border border-slate-200"
            />
            <div className="text-left">
              <h1 className="text-2xl font-bold">MATSU</h1>
              <p className="text-sm text-muted-foreground">洛星文化祭チケット</p>
            </div>
          </div>
          <p className="text-sm text-slate-600">
            来場者の方はログイン後に「日時」「チケット種別」を選んで予約できます
          </p>
        </div>

        <Card className="glass border-festival-neon/20">
          <CardHeader>
            <CardTitle className="text-xl flex items-center gap-2">
              {mode === "login" ? (
                <>
                  <LogIn className="h-5 w-5" />
                  ログイン
                </>
              ) : (
                <>
                  <UserPlus className="h-5 w-5" />
                  新規登録
                </>
              )}
            </CardTitle>
            <CardDescription>
              {mode === "login"
                ? "アカウントにログインしてチケットを予約"
                : "新しいアカウントを作成してチケットを予約"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={mode === "login" ? handleLogin : handleRegister} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="username">ユーザー名</Label>
                <Input
                  id="username"
                  value={formData.username}
                  onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                  required
                  disabled={loading}
                />
              </div>

              {mode === "register" && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="email">メールアドレス</Label>
                    <Input
                      id="email"
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      required
                      disabled={loading}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="last_name">姓</Label>
                      <Input
                        id="last_name"
                        value={formData.last_name}
                        onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
                        disabled={loading}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="first_name">名</Label>
                      <Input
                        id="first_name"
                        value={formData.first_name}
                        onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
                        disabled={loading}
                      />
                    </div>
                  </div>
                </>
              )}

              <div className="space-y-2">
                <Label htmlFor="password">パスワード</Label>
                <Input
                  id="password"
                  type="password"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  required
                  disabled={loading}
                />
              </div>

              {mode === "register" && (
                <div className="space-y-2">
                  <Label htmlFor="password_confirm">パスワード（確認）</Label>
                  <Input
                    id="password_confirm"
                    type="password"
                    value={formData.password_confirm}
                    onChange={(e) => setFormData({ ...formData, password_confirm: e.target.value })}
                    required
                    disabled={loading}
                  />
                </div>
              )}

              {error && (
                <motion.p 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="text-sm text-destructive bg-destructive/10 p-3 rounded-lg"
                >
                  {error}
                </motion.p>
              )}

              {mode === "login" && !error && (
                <div className="text-xs text-slate-500 bg-slate-50 border border-slate-200 p-3 rounded-lg">
                  ログインできない場合は「ユーザー名」と「パスワード」を再確認してください。
                  パスワードを忘れた場合は運営までお問い合わせください。
                </div>
              )}

              <Button type="submit" className="w-full" variant="neon" disabled={loading}>
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    処理中...
                  </>
                ) : mode === "login" ? (
                  "ログイン"
                ) : (
                  "登録"
                )}
              </Button>

              <div className="text-center pt-2">
                <Button
                  type="button"
                  variant="link"
                  onClick={() => {
                    setMode(mode === "login" ? "register" : "login");
                    setError(null);
                  }}
                  disabled={loading}
                >
                  {mode === "login" ? "アカウントを新規作成" : "ログインに戻る"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        <div className="mt-6 bg-white/70 border border-slate-200 rounded-xl p-4 text-sm text-slate-600">
          <div className="font-medium text-slate-900 mb-2">ご利用の流れ</div>
          <ol className="list-decimal pl-5 space-y-1">
            <li>ログイン / 新規登録</li>
            <li>希望日時とチケット種別を選択</li>
            <li>予約内容を確認して確定</li>
          </ol>
        </div>
      </motion.div>
    </div>
  );
}

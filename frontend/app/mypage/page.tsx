"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  Wallet,
  Loader2,
  TicketX,
  LogIn,
  UserPlus,
  LogOut,
  User as UserIcon,
  Edit,
  X,
  Check,
  AlertTriangle,
  Printer,
  Eye,
  Sun,
  Moon,
  Link as LinkIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { TicketCard } from "@/components/TicketCard";
import { DynamicForm } from "@/components/DynamicForm";
import { MaintenanceCheck } from "@/components/MaintenanceCheck";
import { useAuthStore } from "@/store/useAuthStore";
import { useThemeStore } from "@/store/useThemeStore";
import { getMyTickets, cancelTicket, updateTicketInfo, getAttributes, createShareLink } from "@/lib/api";
import { getApiErrorMessage } from "@/lib/utils";
import type { AttributeConfig } from "@/lib/types";
import type { Ticket } from "@/lib/types";

const TICKETS_CACHE_KEY = "matsu_tickets_cache";

export default function MyPage() {
  const router = useRouter();
  const { user, isAuthenticated, isLoading: authLoading, login, register, logout, checkAuth } = useAuthStore();
  const { theme, toggleTheme } = useThemeStore();

  const [mode, setMode] = useState<"login" | "register">("login");
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [offlineMode, setOfflineMode] = useState(false);
  const [previewTicket, setPreviewTicket] = useState<Ticket | null>(null);

  // Login/Register form
  const [formData, setFormData] = useState({
    username: "",
    email: "",
    password: "",
    password_confirm: "",
    first_name: "",
    last_name: "",
  });

  // Edit/Cancel dialogs
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [editFormData, setEditFormData] = useState<Record<string, any>>({});
  const [editAttributeId, setEditAttributeId] = useState<string>("");
  const [allAttributes, setAllAttributes] = useState<AttributeConfig[]>([]);
  const [actionLoading, setActionLoading] = useState(false);
  const [walletLoadingId, setWalletLoadingId] = useState<string | null>(null);
  const [shareDialogOpen, setShareDialogOpen] = useState(false);
  const [shareTicket, setShareTicket] = useState<Ticket | null>(null);
  const [shareLink, setShareLink] = useState<string | null>(null);
  const [shareExpiresAt, setShareExpiresAt] = useState<string | null>(null);
  const [shareLoading, setShareLoading] = useState(false);

  // Check auth on mount
  useEffect(() => {
    checkAuth();
    // Fetch attributes for edit dialog
    getAttributes().then(setAllAttributes).catch(() => {});
  }, [checkAuth]);

  // Fetch tickets when authenticated
  const fetchTickets = useCallback(async () => {
    if (!isAuthenticated) return;
    
    setLoading(true);
    setError(null);
    try {
      const data = await getMyTickets();
      setTickets(data);
      setOfflineMode(false);
      if (typeof window !== "undefined") {
        localStorage.setItem(TICKETS_CACHE_KEY, JSON.stringify(data));
      }
    } catch (err) {
      if (typeof window !== "undefined") {
        const cached = localStorage.getItem(TICKETS_CACHE_KEY);
        if (cached) {
          try {
            const parsed = JSON.parse(cached) as Ticket[];
            setTickets(parsed);
            setOfflineMode(true);
            setError("オフライン表示中です。最新情報はネット接続後に更新されます。");
          } catch {
            setError("チケットの取得に失敗しました");
            setTickets([]);
          }
        } else {
          setError("チケットの取得に失敗しました");
          setTickets([]);
        }
      } else {
        setError("チケットの取得に失敗しました");
        setTickets([]);
      }
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated]);

  const handleAddToWallet = async (ticket: Ticket) => {
    setError(null);
    setWalletLoadingId(ticket.id);
    try {
      const token = localStorage.getItem("access_token");
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "";
      const res = await fetch(`${apiUrl}/api/mypage/wallet-pass/${ticket.id}/`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.message || "Apple Walletの追加に失敗しました");
        return;
      }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `ticket-${ticket.id}.pkpass`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      setError("Apple Walletの追加に失敗しました");
    } finally {
      setWalletLoadingId(null);
    }
  };

  useEffect(() => {
    if (isAuthenticated) {
      fetchTickets();
    }
  }, [isAuthenticated, fetchTickets]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await login(formData.username, formData.password);
    } catch (err) {
      setError(getApiErrorMessage(err, "ログインに失敗しました"));
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    
    if (formData.password !== formData.password_confirm) {
      setError("パスワードが一致しません");
      return;
    }
    
    try {
      await register(formData);
    } catch (err) {
      setError(getApiErrorMessage(err, "登録に失敗しました"));
    }
  };

  const handleLogout = async () => {
    await logout();
    setTickets([]);
  };

  const handleUpdateTicket = async () => {
    if (!selectedTicket) return;

    setActionLoading(true);
    setError(null);
    try {
      // 名前フィールドの確認
      if (!editFormData.name || String(editFormData.name).trim() === "") {
        setError("お名前は必須です");
        setActionLoading(false);
        return;
      }
      const nextAttributeId = editAttributeId !== selectedTicket.attribute ? editAttributeId : undefined;
      await updateTicketInfo(selectedTicket.id, editFormData, nextAttributeId);
      await fetchTickets();
      setEditDialogOpen(false);
      setSelectedTicket(null);
    } catch (err) {
      setError(getApiErrorMessage(err, "更新に失敗しました"));
    } finally {
      setActionLoading(false);
    }
  };

  const handleCancelTicket = async () => {
    if (!selectedTicket) return;

    setActionLoading(true);
    try {
      await cancelTicket(selectedTicket.id);
      await fetchTickets();
      setCancelDialogOpen(false);
      setSelectedTicket(null);
    } catch (err) {
      setError(getApiErrorMessage(err, "キャンセルに失敗しました"));
    } finally {
      setActionLoading(false);
    }
  };

  // 選択中のチケット種別のスキーマを取得
  const getEditFormSchema = () => {
    if (!editAttributeId) return selectedTicket?.attribute_detail.form_schema || [];
    const attr = allAttributes.find(a => a.id === editAttributeId);
    return attr?.form_schema || selectedTicket?.attribute_detail.form_schema || [];
  };

  const openEditDialog = (ticket: Ticket) => {
    setSelectedTicket(ticket);
    setEditFormData({ name: "", ...ticket.guest_info }); // 名前を必ず含める
    setEditAttributeId(ticket.attribute);
    setEditDialogOpen(true);
  };

  const openCancelDialog = (ticket: Ticket) => {
    setSelectedTicket(ticket);
    setCancelDialogOpen(true);
  };

  // Group tickets by status
  const validTickets = tickets.filter((t) => t.status === "valid");
  const enteredTickets = tickets.filter((t) => t.status === "entered");
  const cancelledTickets = tickets.filter((t) => t.status === "cancelled");

  const openShareDialog = (ticket: Ticket) => {
    setShareTicket(ticket);
    setShareLink(null);
    setShareExpiresAt(null);
    setShareDialogOpen(true);
  };

  const handleCreateShareLink = async () => {
    if (!shareTicket) return;
    setShareLoading(true);
    setError(null);
    try {
      const result = await createShareLink(shareTicket.id, 24);
      const origin = window.location.origin;
      setShareLink(`${origin}/share/${result.token}`);
      setShareExpiresAt(result.expires_at);
    } catch (err) {
      setError(getApiErrorMessage(err, "共有リンクの作成に失敗しました"));
    } finally {
      setShareLoading(false);
    }
  };

  const handleCopyShareLink = async () => {
    if (!shareLink) return;
    try {
      await navigator.clipboard.writeText(shareLink);
    } catch {
      // ignore
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <MaintenanceCheck>
    <div className="min-h-screen pb-8">
      {/* Header */}
      <header className="sticky top-0 z-40 glass border-b no-print">
        <div className="container mx-auto px-3 sm:px-4 py-3 sm:py-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 sm:gap-4">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => router.push("/")}
                className="h-8 w-8 sm:h-10 sm:w-10"
              >
                <ArrowLeft className="h-4 w-4 sm:h-5 sm:w-5" />
              </Button>
              <div className="flex items-center gap-2">
                <Wallet className="h-4 w-4 sm:h-5 sm:w-5 text-festival-neon" />
                <h1 className="text-lg sm:text-xl font-bold">マイページ</h1>
              </div>
            </div>
            <div className="flex items-center gap-1 sm:gap-2">
              {/* Theme Toggle */}
              <button
                onClick={toggleTheme}
                className="p-1.5 sm:p-2 rounded-lg hover:bg-muted transition-colors"
                title={theme === "dark" ? "ライトモードに切り替え" : "ダークモードに切り替え"}
              >
                {theme === "dark" ? (
                  <Sun className="h-4 w-4 sm:h-5 sm:w-5 text-yellow-400" />
                ) : (
                  <Moon className="h-4 w-4 sm:h-5 sm:w-5 text-slate-600" />
                )}
              </button>
              {isAuthenticated && (
                <Button variant="ghost" size="sm" onClick={handleLogout} className="text-xs sm:text-sm">
                  <LogOut className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
                  <span className="hidden sm:inline">ログアウト</span>
                  <span className="sm:hidden">OUT</span>
                </Button>
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-3 sm:px-4 py-6 sm:py-8 max-w-2xl space-y-6 sm:space-y-8">
        {!isAuthenticated ? (
          /* Login/Register Form */
          <Card className="glass">
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
                  ? "アカウントにログインしてチケットを管理"
                  : "新しいアカウントを作成"}
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
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="last_name">姓</Label>
                        <Input
                          id="last_name"
                          value={formData.last_name}
                          onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="first_name">名</Label>
                        <Input
                          id="first_name"
                          value={formData.first_name}
                          onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
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
                    />
                  </div>
                )}

                {error && (
                  <p className="text-sm text-destructive">{error}</p>
                )}

                <Button type="submit" className="w-full">
                  {mode === "login" ? "ログイン" : "登録"}
                </Button>

                <div className="text-center">
                  <Button
                    type="button"
                    variant="link"
                    onClick={() => {
                      setMode(mode === "login" ? "register" : "login");
                      setError(null);
                    }}
                  >
                    {mode === "login" ? "アカウントを作成" : "ログインに戻る"}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        ) : (
          /* Authenticated Content */
          <>
            {/* User Info */}
            <Card className="glass no-print">
              <CardContent className="pt-6">
                <div className="flex items-center gap-4">
                  <div className="h-12 w-12 rounded-full bg-primary/20 flex items-center justify-center">
                    <UserIcon className="h-6 w-6 text-primary" />
                  </div>
                  <div>
                    <p className="font-semibold">{user?.last_name} {user?.first_name}</p>
                    <p className="text-sm text-muted-foreground">@{user?.username}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {error && (
              <div className="no-print p-4 rounded-lg bg-amber-500/15 border border-amber-500/30 text-amber-200 dark:text-amber-200">
                {error}
              </div>
            )}

            {/* Tickets */}
            <AnimatePresence mode="wait">
              {loading ? (
                <motion.div
                  key="loading"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="flex justify-center py-12"
                >
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </motion.div>
              ) : tickets.length === 0 ? (
                <motion.div
                  key="empty"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="text-center py-12 space-y-4"
                >
                  <TicketX className="h-16 w-16 mx-auto text-muted-foreground/50" />
                  <p className="text-muted-foreground">チケットがありません</p>
                  <Button variant="outline" onClick={() => router.push("/")}>
                    チケットを予約する
                  </Button>
                </motion.div>
              ) : (
                <motion.div
                  key="tickets"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="space-y-8"
                >
                  {/* Actions */}
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 no-print">
                    <div className="text-sm text-slate-600 dark:text-slate-300">
                      {offlineMode ? "オフライン表示中です。最新情報はネット接続後に更新されます。" : "QR一覧を印刷して当日に提示できます。"}
                    </div>
                    <Button variant="outline" onClick={() => window.print()}>
                      <Printer className="h-4 w-4 mr-2" />
                      QR一覧を印刷
                    </Button>
                  </div>

                  <div className="print-area space-y-8">
                    {/* Valid Tickets */}
                    {validTickets.length > 0 && (
                      <section className="space-y-4">
                        <h2 className="text-lg font-semibold flex items-center gap-2">
                          <span className="w-3 h-3 rounded-full bg-green-500" />
                          入場可能 ({validTickets.length})
                        </h2>
                        <div className="grid gap-4">
                          {validTickets.map((ticket) => (
                            <div key={ticket.id} className="space-y-2">
                              <TicketCard ticket={ticket} />
                              <div className="flex gap-2 px-2 no-print">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => setPreviewTicket(ticket)}
                                >
                                  <Eye className="h-4 w-4 mr-1" />
                                  表示
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => openShareDialog(ticket)}
                                >
                                  <LinkIcon className="h-4 w-4 mr-1" />
                                  共有
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleAddToWallet(ticket)}
                                  disabled={walletLoadingId === ticket.id}
                                >
                                  {walletLoadingId === ticket.id ? (
                                    <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                                  ) : (
                                    <Wallet className="h-4 w-4 mr-1" />
                                  )}
                                  Walletに追加
                                </Button>
                                {ticket.attribute_detail.is_modifiable && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => openEditDialog(ticket)}
                                  >
                                    <Edit className="h-4 w-4 mr-1" />
                                    情報を編集
                                  </Button>
                                )}
                                {ticket.attribute_detail.is_cancellable && (
                                  <Button
                                    size="sm"
                                    variant="destructive"
                                    onClick={() => openCancelDialog(ticket)}
                                  >
                                    <X className="h-4 w-4 mr-1" />
                                    キャンセル
                                  </Button>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </section>
                    )}

                    {/* Entered Tickets */}
                    {enteredTickets.length > 0 && (
                      <section className="space-y-4">
                        <h2 className="text-lg font-semibold flex items-center gap-2">
                          <span className="w-3 h-3 rounded-full bg-blue-500" />
                          入場済み ({enteredTickets.length})
                        </h2>
                        <div className="grid gap-4">
                          {enteredTickets.map((ticket) => (
                            <div key={ticket.id} className="space-y-2">
                              <TicketCard ticket={ticket} compact />
                              <div className="flex gap-2 px-2 no-print">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => setPreviewTicket(ticket)}
                                >
                                  <Eye className="h-4 w-4 mr-1" />
                                  表示
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => openShareDialog(ticket)}
                                >
                                  <LinkIcon className="h-4 w-4 mr-1" />
                                  共有
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </section>
                    )}

                    {/* Cancelled Tickets */}
                    {cancelledTickets.length > 0 && (
                      <section className="space-y-4 opacity-60">
                        <h2 className="text-lg font-semibold flex items-center gap-2">
                          <span className="w-3 h-3 rounded-full bg-red-500" />
                          キャンセル済み ({cancelledTickets.length})
                        </h2>
                        <div className="grid gap-4">
                          {cancelledTickets.map((ticket) => (
                            <div key={ticket.id} className="space-y-2">
                              <TicketCard ticket={ticket} compact />
                              <div className="flex gap-2 px-2 no-print">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => setPreviewTicket(ticket)}
                                >
                                  <Eye className="h-4 w-4 mr-1" />
                                  表示
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </section>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </>
        )}
      </main>

      {/* Edit Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>チケット情報を編集</DialogTitle>
            <DialogDescription>
              入場者情報を修正できます
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {/* チケット種別選択 */}
            {allAttributes.filter(a => a.is_active).length > 1 && (
              <div className="space-y-2">
                <Label>チケット種別</Label>
                <select
                  className="w-full h-10 px-3 rounded-lg border border-border bg-background text-sm"
                  value={editAttributeId}
                  onChange={(e) => {
                    setEditAttributeId(e.target.value);
                    // 種別変更時は名前を維持、他はリセット
                    setEditFormData({ name: editFormData.name || "" });
                  }}
                >
                  {allAttributes.filter(a => a.is_active).map(attr => (
                    <option key={attr.id} value={attr.id}>{attr.display_name}</option>
                  ))}
                </select>
              </div>
            )}

            {/* 名前フィールド（必須） */}
            <div className="space-y-2">
              <Label htmlFor="edit-name">
                お名前 <span className="text-destructive">*</span>
              </Label>
              <Input
                id="edit-name"
                value={editFormData.name || ""}
                placeholder="山田 太郎"
                onChange={(e) => setEditFormData({ ...editFormData, name: e.target.value })}
              />
            </div>

            {/* DynamicFormで条件分岐に対応 */}
            {getEditFormSchema().filter(f => f.key !== "name").length > 0 && (
              <div className="pt-2 border-t border-border">
                <DynamicForm
                  schema={getEditFormSchema().filter(f => f.key !== "name")}
                  values={editFormData}
                  onChange={(values) => setEditFormData({ ...editFormData, ...values })}
                />
              </div>
            )}

            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setEditDialogOpen(false); setError(null); }}>
              キャンセル
            </Button>
            <Button onClick={handleUpdateTicket} disabled={actionLoading}>
              {actionLoading ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Check className="h-4 w-4 mr-2" />
              )}
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cancel Dialog */}
      <Dialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              チケットをキャンセル
            </DialogTitle>
            <DialogDescription>
              このチケットをキャンセルしますか？この操作は取り消せません。
              {selectedTicket && (
                <div className="mt-4 p-4 bg-muted rounded-lg">
                  <p className="font-medium">
                    {selectedTicket.slot_detail.event_date} {selectedTicket.slot_detail.start_time}
                  </p>
                  <p className="text-sm">{selectedTicket.attribute_detail.display_name}</p>
                </div>
              )}
            </DialogDescription>
          </DialogHeader>
          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelDialogOpen(false)}>
              戻る
            </Button>
            <Button variant="destructive" onClick={handleCancelTicket} disabled={actionLoading}>
              {actionLoading ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <X className="h-4 w-4 mr-2" />
              )}
              キャンセルする
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Preview Dialog */}
      <Dialog open={!!previewTicket} onOpenChange={(open) => !open && setPreviewTicket(null)}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Eye className="h-5 w-5 text-primary" />
              チケットを表示
            </DialogTitle>
            <DialogDescription>
              当日はこのQRコードを提示してください。
            </DialogDescription>
          </DialogHeader>
          {previewTicket && (
            <div className="py-4">
              <TicketCard ticket={previewTicket} />
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPreviewTicket(null)}>
              閉じる
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Share Link Dialog */}
      <Dialog open={shareDialogOpen} onOpenChange={setShareDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <LinkIcon className="h-5 w-5 text-primary" />
              共有リンクを作成
            </DialogTitle>
            <DialogDescription>
              チケット単位で閲覧専用のリンクを発行します（譲渡ではありません）。
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {shareTicket && (
              <div className="space-y-2">
                <Label>対象チケット</Label>
                <div className="rounded-md border border-input bg-background p-3 text-sm text-slate-700">
                  <div className="font-mono text-xs text-slate-500">{shareTicket.id}</div>
                  <div className="text-xs text-slate-500">
                    {shareTicket.slot_detail?.event_date} {shareTicket.slot_detail?.start_time?.slice(0, 5)} / {shareTicket.attribute_detail?.display_name}
                  </div>
                </div>
              </div>
            )}

            {shareLink ? (
              <div className="space-y-2">
                <Label>共有リンク</Label>
                <div className="flex gap-2">
                  <Input value={shareLink} readOnly />
                  <Button variant="outline" onClick={handleCopyShareLink}>
                    コピー
                  </Button>
                </div>
                {shareExpiresAt && (
                  <p className="text-xs text-muted-foreground">
                    有効期限: {new Date(shareExpiresAt).toLocaleString("ja-JP")}
                  </p>
                )}
              </div>
            ) : (
              <Button onClick={handleCreateShareLink} disabled={shareLoading || !shareTicket}>
                {shareLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                リンクを発行
              </Button>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShareDialogOpen(false)}>
              閉じる
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
    </MaintenanceCheck>
  );
}

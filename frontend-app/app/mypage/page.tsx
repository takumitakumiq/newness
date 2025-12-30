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
  Share2,
  Copy,
  CheckCircle,
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
import { useAuthStore } from "@/store/useAuthStore";
import { getMyTickets, cancelTicket, updateTicketInfo, createTicketTransfer } from "@/lib/api";
import type { Ticket } from "@/lib/types";

export default function MyPage() {
  const router = useRouter();
  const { user, isAuthenticated, isLoading: authLoading, login, register, logout, checkAuth } = useAuthStore();

  const [mode, setMode] = useState<"login" | "register">("login");
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
  const [transferDialogOpen, setTransferDialogOpen] = useState(false);
  const [editFormData, setEditFormData] = useState<Record<string, any>>({});
  const [actionLoading, setActionLoading] = useState(false);
  const [transferLink, setTransferLink] = useState<string | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);

  // Check auth on mount
  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  // Fetch tickets when authenticated
  const fetchTickets = useCallback(async () => {
    if (!isAuthenticated) return;
    
    setLoading(true);
    setError(null);
    try {
      const data = await getMyTickets();
      setTickets(data);
    } catch (err) {
      setError("チケットの取得に失敗しました");
      setTickets([]);
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated]);

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
    } catch (err: any) {
      setError(err.detail || err.message || "ログインに失敗しました");
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
    } catch (err: any) {
      const errorMessage = err.username?.[0] || err.email?.[0] || err.password?.[0] || err.message || "登録に失敗しました";
      setError(errorMessage);
    }
  };

  const handleLogout = async () => {
    await logout();
    setTickets([]);
  };

  const handleCancelTicket = async () => {
    if (!selectedTicket) return;
    
    setActionLoading(true);
    try {
      await cancelTicket(selectedTicket.id);
      await fetchTickets();
      setCancelDialogOpen(false);
      setSelectedTicket(null);
    } catch (err: any) {
      setError(err.message || err.non_field_errors?.[0] || "キャンセルに失敗しました");
    } finally {
      setActionLoading(false);
    }
  };

  const handleUpdateTicket = async () => {
    if (!selectedTicket) return;
    
    setActionLoading(true);
    try {
      await updateTicketInfo(selectedTicket.id, editFormData);
      await fetchTickets();
      setEditDialogOpen(false);
      setSelectedTicket(null);
    } catch (err: any) {
      setError(err.message || err.non_field_errors?.[0] || "更新に失敗しました");
    } finally {
      setActionLoading(false);
    }
  };

  const openEditDialog = (ticket: Ticket) => {
    setSelectedTicket(ticket);
    setEditFormData(ticket.guest_info || {});
    setEditDialogOpen(true);
  };

  const openCancelDialog = (ticket: Ticket) => {
    setSelectedTicket(ticket);
    setCancelDialogOpen(true);
  };

  const openTransferDialog = async (ticket: Ticket) => {
    setSelectedTicket(ticket);
    setTransferLink(null);
    setLinkCopied(false);
    setTransferDialogOpen(true);
  };

  const handleCreateTransfer = async () => {
    if (!selectedTicket) return;
    
    setActionLoading(true);
    try {
      const result = await createTicketTransfer(selectedTicket.id);
      const fullUrl = `${window.location.origin}${result.transfer_url}`;
      setTransferLink(fullUrl);
    } catch (err: any) {
      setError(err.ticket_id?.[0] || err.message || "譲渡リンクの作成に失敗しました");
    } finally {
      setActionLoading(false);
    }
  };

  const handleCopyLink = async () => {
    if (!transferLink) return;
    try {
      await navigator.clipboard.writeText(transferLink);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    } catch {
      setError("コピーに失敗しました");
    }
  };

  // Group tickets by status
  const validTickets = tickets.filter((t) => t.status === "valid");
  const enteredTickets = tickets.filter((t) => t.status === "entered");
  const cancelledTickets = tickets.filter((t) => t.status === "cancelled");

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-8">
      {/* Header */}
      <header className="sticky top-0 z-40 glass border-b">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => router.push("/")}
              >
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <div className="flex items-center gap-2">
                <Wallet className="h-5 w-5 text-festival-neon" />
                <h1 className="text-xl font-bold">マイページ</h1>
              </div>
            </div>
            {isAuthenticated && (
              <Button variant="ghost" size="sm" onClick={handleLogout}>
                <LogOut className="h-4 w-4 mr-2" />
                ログアウト
              </Button>
            )}
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 max-w-2xl space-y-8">
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
            <Card className="glass">
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
                            <div className="flex gap-2 px-2">
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
                              <Button
                                size="sm"
                                variant="secondary"
                                onClick={() => openTransferDialog(ticket)}
                              >
                                <Share2 className="h-4 w-4 mr-1" />
                                譲渡
                              </Button>
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
                          <TicketCard key={ticket.id} ticket={ticket} compact />
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
                          <TicketCard key={ticket.id} ticket={ticket} compact />
                        ))}
                      </div>
                    </section>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </>
        )}
      </main>

      {/* Edit Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>チケット情報を編集</DialogTitle>
            <DialogDescription>
              ゲスト情報を修正できます
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {selectedTicket?.attribute_detail.form_schema.map((field) => (
              <div key={field.key} className="space-y-2">
                <Label htmlFor={field.key}>{field.label}</Label>
                {field.type === "boolean" ? (
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id={field.key}
                      checked={!!editFormData[field.key]}
                      onChange={(e) =>
                        setEditFormData({ ...editFormData, [field.key]: e.target.checked })
                      }
                    />
                    <label htmlFor={field.key}>{field.description}</label>
                  </div>
                ) : (
                  <Input
                    id={field.key}
                    type={field.type === "email" ? "email" : field.type === "tel" ? "tel" : "text"}
                    value={editFormData[field.key] || ""}
                    placeholder={field.placeholder}
                    onChange={(e) =>
                      setEditFormData({ ...editFormData, [field.key]: e.target.value })
                    }
                  />
                )}
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
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

      {/* Transfer Dialog */}
      <Dialog open={transferDialogOpen} onOpenChange={setTransferDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Share2 className="h-5 w-5 text-primary" />
              チケットを譲渡
            </DialogTitle>
            <DialogDescription>
              チケットを他の人に譲渡できます。譲渡リンクを作成して共有してください。
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
          
          {transferLink ? (
            <div className="space-y-4">
              <p className="text-sm text-green-500 flex items-center gap-2">
                <CheckCircle className="h-4 w-4" />
                譲渡リンクが作成されました（48時間有効）
              </p>
              <div className="flex gap-2">
                <Input value={transferLink} readOnly className="text-xs" />
                <Button size="icon" variant="outline" onClick={handleCopyLink}>
                  {linkCopied ? (
                    <Check className="h-4 w-4 text-green-500" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                このリンクをLINEやメールで送信してください。相手がリンクを開いてログインすると、チケットが譲渡されます。
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                譲渡リンクを作成すると、このチケットは相手が受け取るまで使用できなくなります。
              </p>
              {error && (
                <p className="text-sm text-destructive">{error}</p>
              )}
            </div>
          )}
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setTransferDialogOpen(false)}>
              閉じる
            </Button>
            {!transferLink && (
              <Button onClick={handleCreateTransfer} disabled={actionLoading}>
                {actionLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Share2 className="h-4 w-4 mr-2" />
                )}
                譲渡リンクを作成
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

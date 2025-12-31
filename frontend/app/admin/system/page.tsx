"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Server,
  Database,
  HardDrive,
  Activity,
  Download,
  Trash2,
  RefreshCw,
  Users,
  Shield,
  FileDown,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Clock,
  Cpu,
  MemoryStick,
  Archive,
  Zap,
  Edit2,
  X,
  Check,
  Key,
  Mail,
  User,
} from "lucide-react";

interface HealthCheck {
  timestamp: string;
  status: "healthy" | "unhealthy" | "warning";
  checks: {
    database?: { status: string; message?: string };
    disk?: {
      status: string;
      total_gb: number;
      used_gb: number;
      free_gb: number;
      percent_used: number;
    };
    memory?: {
      status: string;
      total_gb?: number;
      used_gb?: number;
      available_gb?: number;
      percent_used?: number;
      message?: string;
    };
    database_size?: { size_mb: number; path: string };
    app_stats?: {
      total_users: number;
      total_tickets: number;
      total_reservations: number;
      active_slots: number;
    };
  };
}

interface Backup {
  filename: string;
  size_mb: number;
  created_at: string;
}

interface CleanupPreview {
  preview: {
    old_chat_messages: number;
    expired_transfers: number;
    old_checkin_logs: number;
  };
}

interface UserData {
  id: number;
  username: string;
  email: string;
  first_name?: string;
  last_name?: string;
  is_staff: boolean;
  is_superuser: boolean;
  is_active: boolean;
  date_joined: string;
  last_login: string | null;
}

interface UserEditForm {
  username: string;
  email: string;
  first_name: string;
  last_name: string;
  is_staff: boolean;
  is_superuser: boolean;
  is_active: boolean;
  reset_password: boolean;
  new_password: string;
}

export default function SystemPage() {
  const [health, setHealth] = useState<HealthCheck | null>(null);
  const [backups, setBackups] = useState<Backup[]>([]);
  const [cleanup, setCleanup] = useState<CleanupPreview | null>(null);
  const [users, setUsers] = useState<UserData[]>([]);
  const [editingUser, setEditingUser] = useState<UserData | null>(null);
  const [userForm, setUserForm] = useState<UserEditForm>({
    username: "",
    email: "",
    first_name: "",
    last_name: "",
    is_staff: false,
    is_superuser: false,
    is_active: true,
    reset_password: false,
    new_password: "",
  });
  const [loading, setLoading] = useState({
    health: false,
    backup: false,
    cleanup: false,
    users: false,
    export: false,
    cache: false,
  });
  const [activeTab, setActiveTab] = useState<"health" | "backup" | "users" | "cleanup" | "export">("health");

  const getToken = () => localStorage.getItem("access_token");

  const fetchHealth = async () => {
    setLoading((l) => ({ ...l, health: true }));
    try {
      const res = await fetch("/api/admin/system/health", {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (res.ok) {
        const data = await res.json();
        setHealth(data);
      }
    } catch (error) {
      console.error("Failed to fetch health:", error);
    } finally {
      setLoading((l) => ({ ...l, health: false }));
    }
  };

  const fetchBackups = async () => {
    setLoading((l) => ({ ...l, backup: true }));
    try {
      const res = await fetch("/api/admin/system/backup", {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (res.ok) {
        const data = await res.json();
        setBackups(data.backups || []);
      }
    } catch (error) {
      console.error("Failed to fetch backups:", error);
    } finally {
      setLoading((l) => ({ ...l, backup: false }));
    }
  };

  const createBackup = async (type: "sqlite" | "json") => {
    setLoading((l) => ({ ...l, backup: true }));
    try {
      const res = await fetch("/api/admin/system/backup", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify({ type }),
      });
      if (res.ok) {
        const data = await res.json();
        alert(`バックアップ作成完了: ${data.filename}`);
        fetchBackups();
      }
    } catch (error) {
      console.error("Failed to create backup:", error);
      alert("バックアップ作成に失敗しました");
    } finally {
      setLoading((l) => ({ ...l, backup: false }));
    }
  };

  const deleteBackup = async (filename: string) => {
    if (!confirm(`${filename} を削除しますか？`)) return;
    
    try {
      const res = await fetch("/api/admin/system/backup", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify({ filename }),
      });
      if (res.ok) {
        fetchBackups();
      }
    } catch (error) {
      console.error("Failed to delete backup:", error);
    }
  };

  const fetchCleanupPreview = async () => {
    setLoading((l) => ({ ...l, cleanup: true }));
    try {
      const res = await fetch("/api/admin/system/cleanup", {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (res.ok) {
        const data = await res.json();
        setCleanup(data);
      }
    } catch (error) {
      console.error("Failed to fetch cleanup preview:", error);
    } finally {
      setLoading((l) => ({ ...l, cleanup: false }));
    }
  };

  const runCleanup = async (action: string) => {
    if (!confirm("この操作は取り消せません。実行しますか？")) return;
    
    setLoading((l) => ({ ...l, cleanup: true }));
    try {
      const res = await fetch("/api/admin/system/cleanup", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify({ action }),
      });
      if (res.ok) {
        const data = await res.json();
        alert(`クリーンアップ完了: ${JSON.stringify(data.results)}`);
        fetchCleanupPreview();
      }
    } catch (error) {
      console.error("Failed to run cleanup:", error);
    } finally {
      setLoading((l) => ({ ...l, cleanup: false }));
    }
  };

  const fetchUsers = async () => {
    setLoading((l) => ({ ...l, users: true }));
    try {
      const res = await fetch("/api/admin/system/users", {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (res.ok) {
        const data = await res.json();
        setUsers(data.users || []);
      }
    } catch (error) {
      console.error("Failed to fetch users:", error);
    } finally {
      setLoading((l) => ({ ...l, users: false }));
    }
  };

  const openEditUser = (user: UserData) => {
    setEditingUser(user);
    setUserForm({
      username: user.username,
      email: user.email || "",
      first_name: user.first_name || "",
      last_name: user.last_name || "",
      is_staff: user.is_staff,
      is_superuser: user.is_superuser,
      is_active: user.is_active,
      reset_password: false,
      new_password: "",
    });
  };

  const updateUser = async () => {
    if (!editingUser) return;
    
    try {
      const body: Record<string, any> = {
        user_id: editingUser.id,
        username: userForm.username,
        email: userForm.email,
        first_name: userForm.first_name,
        last_name: userForm.last_name,
        is_staff: userForm.is_staff,
        is_superuser: userForm.is_superuser,
        is_active: userForm.is_active,
      };
      
      if (userForm.reset_password && userForm.new_password) {
        body.reset_password = true;
        body.new_password = userForm.new_password;
      }
      
      const res = await fetch("/api/admin/system/users", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify(body),
      });
      
      if (res.ok) {
        alert("ユーザー情報を更新しました");
        setEditingUser(null);
        fetchUsers();
      } else {
        const data = await res.json();
        alert(data.error || "更新に失敗しました");
      }
    } catch (error) {
      console.error("Failed to update user:", error);
      alert("エラーが発生しました");
    }
  };

  const deleteUser = async (userId: number, username: string) => {
    if (!confirm(`${username} を削除しますか？この操作は取り消せません。`)) return;
    
    try {
      const res = await fetch("/api/admin/system/users", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify({ user_id: userId }),
      });
      
      if (res.ok) {
        alert("ユーザーを削除しました");
        fetchUsers();
      } else {
        const data = await res.json();
        alert(data.error || "削除に失敗しました");
      }
    } catch (error) {
      console.error("Failed to delete user:", error);
    }
  };

  const updateUserRole = async (userId: number, isStaff: boolean) => {
    try {
      const res = await fetch("/api/admin/system/users", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify({ user_id: userId, is_staff: isStaff }),
      });
      if (res.ok) {
        fetchUsers();
      }
    } catch (error) {
      console.error("Failed to update user:", error);
    }
  };

  const clearCache = async () => {
    if (!confirm("キャッシュをクリアしますか？")) return;
    
    setLoading((l) => ({ ...l, cache: true }));
    try {
      const res = await fetch("/api/admin/system/cache", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify({ action: "clear" }),
      });
      if (res.ok) {
        alert("キャッシュをクリアしました");
      }
    } catch (error) {
      console.error("Failed to clear cache:", error);
    } finally {
      setLoading((l) => ({ ...l, cache: false }));
    }
  };

  const exportData = async (type: string, format: string) => {
    setLoading((l) => ({ ...l, export: true }));
    try {
      const res = await fetch(`/api/admin/system/export?type=${type}&format=${format}`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      
      if (format === "csv") {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${type}_export.csv`;
        a.click();
        URL.revokeObjectURL(url);
      } else {
        const data = await res.json();
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${type}_export.json`;
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch (error) {
      console.error("Failed to export:", error);
    } finally {
      setLoading((l) => ({ ...l, export: false }));
    }
  };

  useEffect(() => {
    if (activeTab === "health") fetchHealth();
    if (activeTab === "backup") fetchBackups();
    if (activeTab === "cleanup") fetchCleanupPreview();
    if (activeTab === "users") fetchUsers();
  }, [activeTab]);

  const StatusIcon = ({ status }: { status: string }) => {
    if (status === "healthy") return <CheckCircle className="h-5 w-5 text-emerald-500" />;
    if (status === "warning") return <AlertTriangle className="h-5 w-5 text-amber-500" />;
    if (status === "unhealthy") return <XCircle className="h-5 w-5 text-rose-500" />;
    return <Clock className="h-5 w-5 text-slate-400" />;
  };

  const tabs = [
    { id: "health", label: "ヘルスチェック", icon: Activity },
    { id: "backup", label: "バックアップ", icon: Database },
    { id: "users", label: "ユーザー管理", icon: Users },
    { id: "cleanup", label: "クリーンアップ", icon: Trash2 },
    { id: "export", label: "エクスポート", icon: FileDown },
  ] as const;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">システム管理</h1>
          <p className="text-sm text-slate-500">ヘルスチェック、バックアップ、データ管理</p>
        </div>
        <Button variant="outline" size="sm" onClick={clearCache} disabled={loading.cache}>
          {loading.cache ? <RefreshCw className="h-4 w-4 animate-spin mr-2" /> : <Zap className="h-4 w-4 mr-2" />}
          キャッシュクリア
        </Button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 bg-slate-100 rounded-lg overflow-x-auto">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors whitespace-nowrap ${
                activeTab === tab.id
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <Icon className="h-4 w-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Content */}
      <div className="space-y-6">
        {/* Health Check Tab */}
        {activeTab === "health" && (
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="font-semibold text-slate-900">システム状態</h2>
              <Button variant="outline" size="sm" onClick={fetchHealth} disabled={loading.health}>
                {loading.health ? <RefreshCw className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              </Button>
            </div>

            {health && (
              <>
                {/* Overall Status */}
                <div className={`p-4 rounded-xl border ${
                  health.status === "healthy" ? "bg-emerald-50 border-emerald-200" :
                  health.status === "warning" ? "bg-amber-50 border-amber-200" :
                  "bg-rose-50 border-rose-200"
                }`}>
                  <div className="flex items-center gap-3">
                    <StatusIcon status={health.status} />
                    <div>
                      <p className="font-semibold text-slate-900">
                        {health.status === "healthy" ? "すべて正常" :
                         health.status === "warning" ? "警告あり" : "問題あり"}
                      </p>
                      <p className="text-xs text-slate-500">
                        最終チェック: {new Date(health.timestamp).toLocaleString("ja-JP")}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Detailed Checks */}
                <div className="grid md:grid-cols-2 gap-4">
                  {/* Database */}
                  <div className="bg-white rounded-xl border border-slate-200 p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <Database className="h-5 w-5 text-violet-600" />
                        <span className="font-medium text-slate-900">データベース</span>
                      </div>
                      <StatusIcon status={health.checks.database?.status || "unknown"} />
                    </div>
                    {health.checks.database_size && (
                      <p className="text-sm text-slate-600">
                        サイズ: {health.checks.database_size.size_mb} MB
                      </p>
                    )}
                  </div>

                  {/* Disk */}
                  {health.checks.disk && (
                    <div className="bg-white rounded-xl border border-slate-200 p-4">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <HardDrive className="h-5 w-5 text-blue-600" />
                          <span className="font-medium text-slate-900">ディスク</span>
                        </div>
                        <StatusIcon status={health.checks.disk.status} />
                      </div>
                      <div className="space-y-2">
                        <div className="w-full bg-slate-200 rounded-full h-2">
                          <div
                            className={`h-2 rounded-full ${
                              health.checks.disk.percent_used > 90 ? "bg-rose-500" :
                              health.checks.disk.percent_used > 70 ? "bg-amber-500" : "bg-emerald-500"
                            }`}
                            style={{ width: `${health.checks.disk.percent_used}%` }}
                          />
                        </div>
                        <p className="text-sm text-slate-600">
                          {health.checks.disk.used_gb} GB / {health.checks.disk.total_gb} GB ({health.checks.disk.percent_used}%)
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Memory */}
                  {health.checks.memory && health.checks.memory.percent_used !== undefined && (
                    <div className="bg-white rounded-xl border border-slate-200 p-4">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <Cpu className="h-5 w-5 text-orange-600" />
                          <span className="font-medium text-slate-900">メモリ</span>
                        </div>
                        <StatusIcon status={health.checks.memory.status} />
                      </div>
                      <div className="space-y-2">
                        <div className="w-full bg-slate-200 rounded-full h-2">
                          <div
                            className={`h-2 rounded-full ${
                              health.checks.memory.percent_used > 90 ? "bg-rose-500" :
                              health.checks.memory.percent_used > 70 ? "bg-amber-500" : "bg-emerald-500"
                            }`}
                            style={{ width: `${health.checks.memory.percent_used}%` }}
                          />
                        </div>
                        <p className="text-sm text-slate-600">
                          {health.checks.memory.used_gb} GB / {health.checks.memory.total_gb} GB ({health.checks.memory.percent_used}%)
                        </p>
                      </div>
                    </div>
                  )}

                  {/* App Stats */}
                  {health.checks.app_stats && (
                    <div className="bg-white rounded-xl border border-slate-200 p-4">
                      <div className="flex items-center gap-2 mb-3">
                        <Server className="h-5 w-5 text-slate-600" />
                        <span className="font-medium text-slate-900">アプリケーション統計</span>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <div>
                          <p className="text-slate-500">ユーザー数</p>
                          <p className="font-semibold text-slate-900">{health.checks.app_stats.total_users}</p>
                        </div>
                        <div>
                          <p className="text-slate-500">チケット数</p>
                          <p className="font-semibold text-slate-900">{health.checks.app_stats.total_tickets}</p>
                        </div>
                        <div>
                          <p className="text-slate-500">予約数</p>
                          <p className="font-semibold text-slate-900">{health.checks.app_stats.total_reservations}</p>
                        </div>
                        <div>
                          <p className="text-slate-500">有効スロット</p>
                          <p className="font-semibold text-slate-900">{health.checks.app_stats.active_slots}</p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        )}

        {/* Backup Tab */}
        {activeTab === "backup" && (
          <div className="space-y-4">
            <div className="flex flex-wrap justify-between items-center gap-4">
              <h2 className="font-semibold text-slate-900">データベースバックアップ</h2>
              <div className="flex gap-2">
                <Button onClick={() => createBackup("sqlite")} disabled={loading.backup}>
                  {loading.backup ? <RefreshCw className="h-4 w-4 animate-spin mr-2" /> : <Database className="h-4 w-4 mr-2" />}
                  SQLiteバックアップ
                </Button>
                <Button variant="outline" onClick={() => createBackup("json")} disabled={loading.backup}>
                  <Archive className="h-4 w-4 mr-2" />
                  JSONエクスポート
                </Button>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <div className="p-4 border-b border-slate-100 bg-slate-50">
                <h3 className="font-medium text-slate-900">バックアップ一覧</h3>
              </div>
              {backups.length === 0 ? (
                <div className="p-8 text-center text-slate-400">
                  <Database className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p>バックアップがありません</p>
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {backups.map((backup) => (
                    <div key={backup.filename} className="flex items-center justify-between p-4 hover:bg-slate-50">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-violet-100 rounded-lg flex items-center justify-center">
                          <Database className="h-5 w-5 text-violet-600" />
                        </div>
                        <div>
                          <p className="font-medium text-slate-900">{backup.filename}</p>
                          <p className="text-xs text-slate-500">
                            {backup.size_mb} MB • {new Date(backup.created_at).toLocaleString("ja-JP")}
                          </p>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-rose-500 hover:text-rose-600 hover:bg-rose-50"
                        onClick={() => deleteBackup(backup.filename)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Users Tab */}
        {activeTab === "users" && (
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="font-semibold text-slate-900">ユーザー管理</h2>
              <Button variant="outline" size="sm" onClick={fetchUsers} disabled={loading.users}>
                {loading.users ? <RefreshCw className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              </Button>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="text-left px-4 py-3 font-medium text-slate-600">ユーザー</th>
                      <th className="text-left px-4 py-3 font-medium text-slate-600">メール</th>
                      <th className="text-left px-4 py-3 font-medium text-slate-600">権限</th>
                      <th className="text-left px-4 py-3 font-medium text-slate-600">登録日</th>
                      <th className="text-left px-4 py-3 font-medium text-slate-600">操作</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {users.map((user) => (
                      <tr key={user.id} className="hover:bg-slate-50">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className="w-8 h-8 bg-slate-200 rounded-full flex items-center justify-center">
                              <span className="text-xs font-medium text-slate-600">
                                {user.username.slice(0, 2).toUpperCase()}
                              </span>
                            </div>
                            <span className="font-medium text-slate-900">{user.username}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-slate-600">{user.email || "-"}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1">
                            {user.is_superuser && (
                              <span className="px-2 py-0.5 bg-violet-100 text-violet-700 text-xs rounded-full">管理者</span>
                            )}
                            {user.is_staff && !user.is_superuser && (
                              <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs rounded-full">スタッフ</span>
                            )}
                            {!user.is_staff && !user.is_superuser && (
                              <span className="px-2 py-0.5 bg-slate-100 text-slate-600 text-xs rounded-full">一般</span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-slate-600">
                          {new Date(user.date_joined).toLocaleDateString("ja-JP")}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => openEditUser(user)}
                              className="p-1.5 hover:bg-blue-100 rounded-lg text-blue-600"
                              title="編集"
                            >
                              <Edit2 className="h-4 w-4" />
                            </button>
                            {!user.is_superuser && (
                              <button
                                onClick={() => deleteUser(user.id, user.username)}
                                className="p-1.5 hover:bg-rose-100 rounded-lg text-rose-600"
                                title="削除"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* User Edit Modal */}
            {editingUser && (
              <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setEditingUser(null)}>
                <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
                  <div className="flex items-center justify-between p-4 border-b">
                    <h3 className="font-semibold text-slate-900">ユーザーを編集</h3>
                    <button onClick={() => setEditingUser(null)} className="p-1 hover:bg-slate-100 rounded">
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="p-4 space-y-4">
                    {/* User Info Header */}
                    <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg">
                      <div className="w-12 h-12 bg-slate-200 rounded-full flex items-center justify-center">
                        <span className="text-lg font-medium text-slate-600">
                          {editingUser.username.slice(0, 2).toUpperCase()}
                        </span>
                      </div>
                      <div>
                        <p className="font-medium text-slate-900">{editingUser.username}</p>
                        <p className="text-xs text-slate-500">
                          登録: {new Date(editingUser.date_joined).toLocaleDateString("ja-JP")}
                          {editingUser.last_login && ` • 最終ログイン: ${new Date(editingUser.last_login).toLocaleDateString("ja-JP")}`}
                        </p>
                      </div>
                      {editingUser.is_superuser && (
                        <span className="ml-auto px-2 py-0.5 bg-violet-100 text-violet-700 text-xs rounded-full">管理者</span>
                      )}
                    </div>

                    {/* Form Fields */}
                    <div className="space-y-3">
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">
                          <User className="h-3.5 w-3.5 inline mr-1" />ユーザー名
                        </label>
                        <Input
                          value={userForm.username}
                          onChange={(e) => setUserForm(f => ({ ...f, username: e.target.value }))}
                          disabled={editingUser.is_superuser}
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">
                          <Mail className="h-3.5 w-3.5 inline mr-1" />メールアドレス
                        </label>
                        <Input
                          type="email"
                          value={userForm.email}
                          onChange={(e) => setUserForm(f => ({ ...f, email: e.target.value }))}
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-sm font-medium text-slate-700 mb-1">姓</label>
                          <Input
                            value={userForm.last_name}
                            onChange={(e) => setUserForm(f => ({ ...f, last_name: e.target.value }))}
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-slate-700 mb-1">名</label>
                          <Input
                            value={userForm.first_name}
                            onChange={(e) => setUserForm(f => ({ ...f, first_name: e.target.value }))}
                          />
                        </div>
                      </div>
                    </div>

                    {/* Permissions */}
                    <div className="space-y-3 pt-2 border-t">
                      <p className="text-sm font-medium text-slate-700">権限設定</p>
                      
                      {/* Admin Permission - only superusers can grant this */}
                      {!editingUser.is_superuser && (
                        <div className="flex items-center justify-between py-2 px-3 bg-violet-50 rounded-lg border border-violet-100">
                          <div>
                            <p className="text-sm font-medium text-slate-900 flex items-center gap-2">
                              <span className="px-1.5 py-0.5 bg-violet-100 text-violet-700 text-xs rounded">最上位</span>
                              管理者権限
                            </p>
                            <p className="text-xs text-slate-500">すべての機能にアクセス可能・他ユーザーの権限変更可能</p>
                          </div>
                          <button
                            onClick={() => setUserForm(f => ({ 
                              ...f, 
                              is_superuser: !f.is_superuser,
                              is_staff: !f.is_superuser ? true : f.is_staff // 管理者の場合はスタッフも自動でtrue
                            }))}
                            className={`relative w-11 h-6 rounded-full transition-colors ${userForm.is_superuser ? "bg-violet-500" : "bg-slate-300"}`}
                          >
                            <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform shadow ${userForm.is_superuser ? "translate-x-5" : ""}`}></span>
                          </button>
                        </div>
                      )}
                      
                      {!editingUser.is_superuser && (
                        <div className="flex items-center justify-between py-2">
                          <div>
                            <p className="text-sm font-medium text-slate-900">スタッフ権限</p>
                            <p className="text-xs text-slate-500">管理画面にアクセス可能</p>
                          </div>
                          <button
                            onClick={() => setUserForm(f => ({ ...f, is_staff: !f.is_staff }))}
                            disabled={userForm.is_superuser}
                            className={`relative w-11 h-6 rounded-full transition-colors ${userForm.is_staff ? "bg-blue-500" : "bg-slate-300"} ${userForm.is_superuser ? "opacity-50 cursor-not-allowed" : ""}`}
                          >
                            <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform shadow ${userForm.is_staff ? "translate-x-5" : ""}`}></span>
                          </button>
                        </div>
                      )}
                      
                      {!editingUser.is_superuser && (
                        <div className="flex items-center justify-between py-2">
                          <div>
                            <p className="text-sm font-medium text-slate-900">アカウント有効</p>
                            <p className="text-xs text-slate-500">無効にするとログイン不可</p>
                          </div>
                          <button
                            onClick={() => setUserForm(f => ({ ...f, is_active: !f.is_active }))}
                            className={`relative w-11 h-6 rounded-full transition-colors ${userForm.is_active ? "bg-emerald-500" : "bg-slate-300"}`}
                          >
                            <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform shadow ${userForm.is_active ? "translate-x-5" : ""}`}></span>
                          </button>
                        </div>
                      )}
                      
                      {editingUser.is_superuser && (
                        <p className="text-xs text-slate-500 bg-slate-50 p-2 rounded">
                          ※ 管理者ユーザーの権限は変更できません
                        </p>
                      )}
                    </div>

                    {/* Password Reset */}
                    <div className="space-y-3 pt-2 border-t">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium text-slate-900">
                            <Key className="h-3.5 w-3.5 inline mr-1" />パスワードリセット
                          </p>
                          <p className="text-xs text-slate-500">新しいパスワードを設定</p>
                        </div>
                        <button
                          onClick={() => setUserForm(f => ({ ...f, reset_password: !f.reset_password, new_password: "" }))}
                          className={`relative w-11 h-6 rounded-full transition-colors ${userForm.reset_password ? "bg-amber-500" : "bg-slate-300"}`}
                        >
                          <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform shadow ${userForm.reset_password ? "translate-x-5" : ""}`}></span>
                        </button>
                      </div>
                      {userForm.reset_password && (
                        <Input
                          type="password"
                          placeholder="新しいパスワード（6文字以上）"
                          value={userForm.new_password}
                          onChange={(e) => setUserForm(f => ({ ...f, new_password: e.target.value }))}
                        />
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex gap-2 pt-2">
                      <Button variant="outline" className="flex-1" onClick={() => setEditingUser(null)}>
                        キャンセル
                      </Button>
                      <Button className="flex-1" onClick={updateUser}>
                        <Check className="h-4 w-4 mr-1" />保存
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Cleanup Tab */}
        {activeTab === "cleanup" && (
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="font-semibold text-slate-900">データクリーンアップ</h2>
              <Button variant="outline" size="sm" onClick={fetchCleanupPreview} disabled={loading.cleanup}>
                {loading.cleanup ? <RefreshCw className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              </Button>
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-amber-800">注意</p>
                  <p className="text-sm text-amber-700">
                    クリーンアップ操作は取り消せません。実行前にバックアップを作成することをお勧めします。
                  </p>
                </div>
              </div>
            </div>

            {cleanup && (
              <div className="grid md:grid-cols-3 gap-4">
                <div className="bg-white rounded-xl border border-slate-200 p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <Clock className="h-5 w-5 text-slate-600" />
                      <span className="font-medium text-slate-900">期限切れ譲渡</span>
                    </div>
                    <span className="text-lg font-bold text-slate-900">{cleanup.preview.expired_transfers}</span>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={() => runCleanup("expired_transfers")}
                    disabled={cleanup.preview.expired_transfers === 0 || loading.cleanup}
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    削除
                  </Button>
                </div>

                <div className="bg-white rounded-xl border border-slate-200 p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <Clock className="h-5 w-5 text-slate-600" />
                      <span className="font-medium text-slate-900">古いチャット (30日)</span>
                    </div>
                    <span className="text-lg font-bold text-slate-900">{cleanup.preview.old_chat_messages}</span>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={() => runCleanup("old_chat")}
                    disabled={cleanup.preview.old_chat_messages === 0 || loading.cleanup}
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    削除
                  </Button>
                </div>

                <div className="bg-white rounded-xl border border-slate-200 p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <Clock className="h-5 w-5 text-slate-600" />
                      <span className="font-medium text-slate-900">古いログ (90日)</span>
                    </div>
                    <span className="text-lg font-bold text-slate-900">{cleanup.preview.old_checkin_logs}</span>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={() => runCleanup("old_logs")}
                    disabled={cleanup.preview.old_checkin_logs === 0 || loading.cleanup}
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    削除
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Export Tab */}
        {activeTab === "export" && (
          <div className="space-y-4">
            <h2 className="font-semibold text-slate-900">データエクスポート</h2>

            <div className="grid md:grid-cols-3 gap-4">
              <div className="bg-white rounded-xl border border-slate-200 p-4">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-10 h-10 bg-emerald-100 rounded-lg flex items-center justify-center">
                    <FileDown className="h-5 w-5 text-emerald-600" />
                  </div>
                  <div>
                    <p className="font-medium text-slate-900">チケット</p>
                    <p className="text-xs text-slate-500">全チケットデータ</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    onClick={() => exportData("tickets", "json")}
                    disabled={loading.export}
                  >
                    JSON
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    onClick={() => exportData("tickets", "csv")}
                    disabled={loading.export}
                  >
                    CSV
                  </Button>
                </div>
              </div>

              <div className="bg-white rounded-xl border border-slate-200 p-4">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                    <FileDown className="h-5 w-5 text-blue-600" />
                  </div>
                  <div>
                    <p className="font-medium text-slate-900">予約</p>
                    <p className="text-xs text-slate-500">全予約データ</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    onClick={() => exportData("reservations", "json")}
                    disabled={loading.export}
                  >
                    JSON
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    onClick={() => exportData("reservations", "csv")}
                    disabled={loading.export}
                  >
                    CSV
                  </Button>
                </div>
              </div>

              <div className="bg-white rounded-xl border border-slate-200 p-4">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-10 h-10 bg-violet-100 rounded-lg flex items-center justify-center">
                    <Users className="h-5 w-5 text-violet-600" />
                  </div>
                  <div>
                    <p className="font-medium text-slate-900">ユーザー</p>
                    <p className="text-xs text-slate-500">全ユーザーデータ</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    onClick={() => exportData("users", "json")}
                    disabled={loading.export}
                  >
                    JSON
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    onClick={() => exportData("users", "csv")}
                    disabled={loading.export}
                  >
                    CSV
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

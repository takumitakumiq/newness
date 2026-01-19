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
  AlertOctagon,
} from "lucide-react";
import { fetchApi, fetchApiRaw } from "@/lib/api";

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

interface AdminAuditLog {
  id: string;
  action: string;
  target_type: string;
  target_id: string;
  metadata: Record<string, any>;
  actor: string | null;
  created_at: string;
}

interface SettingHistory {
  id: string;
  action: string;
  created_by: string | null;
  created_at: string;
  snapshot: Record<string, any>;
}

interface CleanupPreview {
  preview: {
    old_chat_messages: number;
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

interface EmergencySettings {
  emergency_stop: boolean;
  emergency_message: string;
  maintenance_mode: boolean;
  operation_mode: "normal" | "read_only" | "purchase_stop" | "checkin_only";
  updated_at: string | null;
  updated_by: string | null;
}

interface EmailSettings {
  email_mode: "test" | "production";
  sendgrid_api_key_set: boolean;
  sendgrid_api_key_masked: string;
  email_from_address: string;
  email_from_name: string;
  updated_at: string | null;
  updated_by: string | null;
}

export default function SystemPage() {
  const [health, setHealth] = useState<HealthCheck | null>(null);
  const [backups, setBackups] = useState<Backup[]>([]);
  const [cleanup, setCleanup] = useState<CleanupPreview | null>(null);
  const [users, setUsers] = useState<UserData[]>([]);
  const [auditLogs, setAuditLogs] = useState<AdminAuditLog[]>([]);
  const [settingHistories, setSettingHistories] = useState<SettingHistory[]>([]);
  const [editingUser, setEditingUser] = useState<UserData | null>(null);
  const [emergency, setEmergency] = useState<EmergencySettings | null>(null);
  const [emergencyForm, setEmergencyForm] = useState({
    emergency_stop: false,
    emergency_message: "",
    maintenance_mode: false,
    operation_mode: "normal" as "normal" | "read_only" | "purchase_stop" | "checkin_only",
  });
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
  const [emailSettings, setEmailSettings] = useState<EmailSettings | null>(null);
  const [emailForm, setEmailForm] = useState({
    email_mode: "test" as "test" | "production",
    sendgrid_api_key: "",
    email_from_address: "",
    email_from_name: "",
  });
  const [testEmailAddress, setTestEmailAddress] = useState("");
  const [loading, setLoading] = useState({
    health: false,
    backup: false,
    cleanup: false,
    users: false,
    audit: false,
    settingsHistory: false,
    export: false,
    cache: false,
    emergency: false,
    email: false,
    emailTest: false,
  });
  const [activeTab, setActiveTab] = useState<"health" | "backup" | "users" | "cleanup" | "export" | "emergency" | "email" | "audit">("health");

  const fetchHealth = async () => {
    setLoading((l) => ({ ...l, health: true }));
    try {
      const data = await fetchApi<HealthCheck>("/admin/system/health");
      setHealth(data);
    } catch (error) {
      console.error("Failed to fetch health:", error);
    } finally {
      setLoading((l) => ({ ...l, health: false }));
    }
  };

  const fetchEmergency = async () => {
    setLoading((l) => ({ ...l, emergency: true }));
    try {
      const data = await fetchApi<EmergencySettings>("/admin/emergency");
      setEmergency(data);
      setEmergencyForm({
        emergency_stop: data.emergency_stop,
        emergency_message: data.emergency_message || "",
        maintenance_mode: data.maintenance_mode,
        operation_mode: data.operation_mode || "normal",
      });
    } catch (error) {
      console.error("Failed to fetch emergency:", error);
    } finally {
      setLoading((l) => ({ ...l, emergency: false }));
    }
  };

  const updateEmergency = async () => {
    if (emergencyForm.emergency_stop && !confirm("緊急停止を有効にしますか？全てのチェックインが停止します。")) {
      return;
    }
    
    setLoading((l) => ({ ...l, emergency: true }));
    try {
      const data = await fetchApi<{ message?: string }>("/admin/emergency", {
        method: "POST",
        body: JSON.stringify(emergencyForm),
      });
      alert(data.message || "設定を更新しました");
      fetchEmergency();
    } catch (error) {
      console.error("Failed to update emergency:", error);
      alert("更新に失敗しました");
    } finally {
      setLoading((l) => ({ ...l, emergency: false }));
    }
  };

  const fetchEmailSettings = async () => {
    setLoading((l) => ({ ...l, email: true }));
    try {
      const data = await fetchApi<{
        email_mode: string;
        sendgrid_api_key_set: boolean;
        sendgrid_api_key_masked: string;
        email_from_address: string;
        email_from_name: string;
        updated_at?: string | null;
        updated_by?: string | null;
      }>("/admin/email-settings");
      setEmailSettings({
        email_mode: data.email_mode as "test" | "production",
        sendgrid_api_key_set: data.sendgrid_api_key_set,
        sendgrid_api_key_masked: data.sendgrid_api_key_masked,
        email_from_address: data.email_from_address,
        email_from_name: data.email_from_name,
        updated_at: data.updated_at || null,
        updated_by: data.updated_by || null,
      });
      setEmailForm((f) => ({
        ...f,
        email_mode: (data.email_mode as "test" | "production") || "test",
        email_from_address: data.email_from_address,
        email_from_name: data.email_from_name,
      }));
    } catch (error) {
      console.error("Failed to fetch email settings:", error);
      alert("取得に失敗しました");
    } finally {
      setLoading((l) => ({ ...l, email: false }));
    }
  };

  const updateEmailSettings = async () => {
    setLoading((l) => ({ ...l, email: true }));
    try {
      const payload: Record<string, string> = {
        email_mode: emailForm.email_mode,
        email_from_address: emailForm.email_from_address,
        email_from_name: emailForm.email_from_name,
      };
      
      // APIキーは入力があった場合のみ送信
      if (emailForm.sendgrid_api_key) {
        payload.sendgrid_api_key = emailForm.sendgrid_api_key;
      }
      
      const data = await fetchApi<{ message?: string }>("/admin/email-settings", {
        method: "POST",
        body: JSON.stringify(payload),
      });

      alert(data.message || "メール設定を更新しました");
      setEmailForm((f) => ({ ...f, sendgrid_api_key: "" }));
      fetchEmailSettings();
    } catch (error) {
      console.error("Failed to update email settings:", error);
      alert("更新に失敗しました");
    } finally {
      setLoading((l) => ({ ...l, email: false }));
    }
  };

  const sendTestEmail = async () => {
    if (!testEmailAddress) {
      alert("送信先メールアドレスを入力してください");
      return;
    }
    
    setLoading((l) => ({ ...l, emailTest: true }));
    try {
      const data = await fetchApi<{ success: boolean; message?: string; error?: string }>("/admin/email-test", {
        method: "POST",
        body: JSON.stringify({ to_email: testEmailAddress }),
      });

      if (data.success) {
        alert(`テストメール送信${emailForm.email_mode === "test" ? "（ログ出力のみ）" : ""}完了: ${data.message || "成功"}`);
      } else {
        alert(`テストメール送信失敗: ${data.message || data.error || "不明なエラー"}`);
      }
    } catch (error) {
      console.error("Failed to send test email:", error);
      alert("テストメール送信に失敗しました");
    } finally {
      setLoading((l) => ({ ...l, emailTest: false }));
    }
  };

  const fetchBackups = async () => {
    setLoading((l) => ({ ...l, backup: true }));
    try {
      const data = await fetchApi<{ backups?: Backup[] }>("/admin/system/backup");
      setBackups(data.backups || []);
    } catch (error) {
      console.error("Failed to fetch backups:", error);
    } finally {
      setLoading((l) => ({ ...l, backup: false }));
    }
  };

  const createBackup = async (type: "sqlite" | "json") => {
    setLoading((l) => ({ ...l, backup: true }));
    try {
      const data = await fetchApi<{ filename?: string }>("/admin/system/backup", {
        method: "POST",
        body: JSON.stringify({ type }),
      });
      alert(`バックアップ作成完了: ${data.filename}`);
      fetchBackups();
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
      await fetchApi("/admin/system/backup", {
        method: "DELETE",
        body: JSON.stringify({ filename }),
      });
      fetchBackups();
    } catch (error) {
      console.error("Failed to delete backup:", error);
    }
  };

  const fetchCleanupPreview = async () => {
    setLoading((l) => ({ ...l, cleanup: true }));
    try {
      const data = await fetchApi<CleanupPreview>("/admin/system/cleanup");
      setCleanup(data);
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
      const data = await fetchApi<{ results?: Record<string, unknown> }>("/admin/system/cleanup", {
        method: "POST",
        body: JSON.stringify({ action }),
      });
      alert(`クリーンアップ完了: ${JSON.stringify(data.results)}`);
      fetchCleanupPreview();
    } catch (error) {
      console.error("Failed to run cleanup:", error);
    } finally {
      setLoading((l) => ({ ...l, cleanup: false }));
    }
  };

  const fetchUsers = async () => {
    setLoading((l) => ({ ...l, users: true }));
    try {
      const data = await fetchApi<{ users?: UserData[] }>("/admin/system/users");
      setUsers(data.users || []);
    } catch (error) {
      console.error("Failed to fetch users:", error);
    } finally {
      setLoading((l) => ({ ...l, users: false }));
    }
  };

  const fetchAuditLogs = async () => {
    setLoading((l) => ({ ...l, audit: true }));
    try {
      const data = await fetchApi<{ logs?: AdminAuditLog[] }>("/admin/system/logs?type=admin&limit=200");
      setAuditLogs(data.logs || []);
    } catch (error) {
      console.error("Failed to fetch audit logs:", error);
    } finally {
      setLoading((l) => ({ ...l, audit: false }));
    }
  };

  const fetchSettingHistory = async () => {
    setLoading((l) => ({ ...l, settingsHistory: true }));
    try {
      const data = await fetchApi<{ histories?: SettingHistory[] }>("/admin/system/settings/history");
      setSettingHistories(data.histories || []);
    } catch (error) {
      console.error("Failed to fetch setting history:", error);
    } finally {
      setLoading((l) => ({ ...l, settingsHistory: false }));
    }
  };

  const rollbackSetting = async (historyId: string) => {
    if (!confirm("この履歴にロールバックしますか？")) return;
    try {
      await fetchApi("/admin/system/settings/rollback", {
        method: "POST",
        body: JSON.stringify({ history_id: historyId }),
      });
      fetchSettingHistory();
      fetchEmergency();
      fetchEmailSettings();
    } catch (error) {
      console.error("Failed to rollback setting:", error);
      alert("ロールバックに失敗しました");
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
      
      await fetchApi("/admin/system/users", {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      alert("ユーザー情報を更新しました");
      setEditingUser(null);
      fetchUsers();
    } catch (error) {
      console.error("Failed to update user:", error);
      alert("エラーが発生しました");
    }
  };

  const deleteUser = async (userId: number, username: string) => {
    if (!confirm(`${username} を削除しますか？この操作は取り消せません。`)) return;
    
    try {
      await fetchApi("/admin/system/users", {
        method: "DELETE",
        body: JSON.stringify({ user_id: userId }),
      });
      alert("ユーザーを削除しました");
      fetchUsers();
    } catch (error) {
      console.error("Failed to delete user:", error);
    }
  };

  const updateUserRole = async (userId: number, isStaff: boolean) => {
    try {
      await fetchApi("/admin/system/users", {
        method: "PATCH",
        body: JSON.stringify({ user_id: userId, is_staff: isStaff }),
      });
      fetchUsers();
    } catch (error) {
      console.error("Failed to update user:", error);
    }
  };

  const clearCache = async () => {
    if (!confirm("キャッシュをクリアしますか？")) return;
    
    setLoading((l) => ({ ...l, cache: true }));
    try {
      await fetchApi("/admin/system/cache", {
        method: "POST",
        body: JSON.stringify({ action: "clear" }),
      });
      alert("キャッシュをクリアしました");
    } catch (error) {
      console.error("Failed to clear cache:", error);
    } finally {
      setLoading((l) => ({ ...l, cache: false }));
    }
  };

  const exportData = async (type: string, format: string) => {
    setLoading((l) => ({ ...l, export: true }));
    try {
      if (format === "csv") {
        const res = await fetchApiRaw(`/admin/system/export?type=${type}&format=${format}`);
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${type}_export.csv`;
        a.click();
        URL.revokeObjectURL(url);
      } else {
        const data = await fetchApi<unknown>(`/admin/system/export?type=${type}&format=${format}`);
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
    if (activeTab === "emergency") fetchEmergency();
    if (activeTab === "email") fetchEmailSettings();
    if (activeTab === "audit") fetchAuditLogs();
    if (activeTab === "audit") fetchSettingHistory();
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
    { id: "audit", label: "監査ログ", icon: Shield },
    { id: "export", label: "エクスポート", icon: FileDown },
    { id: "emergency", label: "緊急停止", icon: AlertOctagon },
    { id: "email", label: "メール設定", icon: Mail },
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
              <div className="grid md:grid-cols-2 gap-4">
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

        {/* Audit Log Tab */}
        {activeTab === "audit" && (
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="font-semibold text-slate-900">監査ログ</h2>
              <Button variant="outline" size="sm" onClick={fetchAuditLogs} disabled={loading.audit}>
                {loading.audit ? <RefreshCw className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              </Button>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <div className="p-4 border-b border-slate-200">
                <p className="text-sm text-slate-500">直近200件の管理操作ログ</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="text-left px-4 py-3 font-medium text-slate-600">日時</th>
                      <th className="text-left px-4 py-3 font-medium text-slate-600">操作者</th>
                      <th className="text-left px-4 py-3 font-medium text-slate-600">アクション</th>
                      <th className="text-left px-4 py-3 font-medium text-slate-600">対象</th>
                      <th className="text-left px-4 py-3 font-medium text-slate-600">詳細</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {auditLogs.length === 0 ? (
                      <tr>
                        <td className="px-4 py-6 text-center text-slate-500" colSpan={5}>
                          ログがありません
                        </td>
                      </tr>
                    ) : (
                      auditLogs.map((log) => (
                        <tr key={log.id} className="hover:bg-slate-50">
                          <td className="px-4 py-3 text-slate-700">
                            {new Date(log.created_at).toLocaleString("ja-JP")}
                          </td>
                          <td className="px-4 py-3 text-slate-700">{log.actor || "-"}</td>
                          <td className="px-4 py-3 text-slate-700">{log.action}</td>
                          <td className="px-4 py-3 text-slate-700">
                            {log.target_type}
                            {log.target_id ? `:${log.target_id}` : ""}
                          </td>
                          <td className="px-4 py-3 text-slate-500">
                            {log.metadata && Object.keys(log.metadata).length > 0
                              ? JSON.stringify(log.metadata)
                              : "-"}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <div className="p-4 border-b border-slate-200 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-900">設定変更履歴</p>
                  <p className="text-xs text-slate-500">直近200件</p>
                </div>
                <Button variant="outline" size="sm" onClick={fetchSettingHistory} disabled={loading.settingsHistory}>
                  {loading.settingsHistory ? <RefreshCw className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                </Button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="text-left px-4 py-3 font-medium text-slate-600">日時</th>
                      <th className="text-left px-4 py-3 font-medium text-slate-600">操作者</th>
                      <th className="text-left px-4 py-3 font-medium text-slate-600">アクション</th>
                      <th className="text-left px-4 py-3 font-medium text-slate-600">スナップショット</th>
                      <th className="text-left px-4 py-3 font-medium text-slate-600">操作</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {settingHistories.length === 0 ? (
                      <tr>
                        <td className="px-4 py-6 text-center text-slate-500" colSpan={5}>
                          履歴がありません
                        </td>
                      </tr>
                    ) : (
                      settingHistories.map((item) => (
                        <tr key={item.id} className="hover:bg-slate-50">
                          <td className="px-4 py-3 text-slate-700">
                            {new Date(item.created_at).toLocaleString("ja-JP")}
                          </td>
                          <td className="px-4 py-3 text-slate-700">{item.created_by || "-"}</td>
                          <td className="px-4 py-3 text-slate-700">{item.action}</td>
                          <td className="px-4 py-3 text-slate-500">
                            {JSON.stringify(item.snapshot)}
                          </td>
                          <td className="px-4 py-3">
                            <Button size="sm" variant="outline" onClick={() => rollbackSetting(item.id)}>
                              ロールバック
                            </Button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
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

        {/* Emergency Tab */}
        {activeTab === "emergency" && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-slate-900">緊急停止設定</h2>
              <Button
                variant="outline"
                size="sm"
                onClick={fetchEmergency}
                disabled={loading.emergency}
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${loading.emergency ? "animate-spin" : ""}`} />
                更新
              </Button>
            </div>

            {/* Current Status */}
            {emergency && (
              <div className={`p-4 rounded-xl border-2 ${
                emergency.emergency_stop 
                  ? "bg-red-50 border-red-200" 
                  : "bg-emerald-50 border-emerald-200"
              }`}>
                <div className="flex items-center gap-3">
                  {emergency.emergency_stop ? (
                    <AlertOctagon className="h-8 w-8 text-red-600" />
                  ) : (
                    <CheckCircle className="h-8 w-8 text-emerald-600" />
                  )}
                  <div>
                    <p className={`font-bold text-lg ${emergency.emergency_stop ? "text-red-800" : "text-emerald-800"}`}>
                      {emergency.emergency_stop ? "緊急停止中" : "正常稼働中"}
                    </p>
                    {emergency.updated_at && (
                      <p className="text-sm text-slate-500">
                        最終更新: {new Date(emergency.updated_at).toLocaleString("ja-JP")} 
                        {emergency.updated_by && ` (${emergency.updated_by})`}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Settings Form */}
            <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-6">
              {/* Emergency Stop Toggle */}
              <div className="flex items-center justify-between p-4 bg-red-50 rounded-lg border border-red-200">
                <div>
                  <p className="font-medium text-red-800">緊急停止</p>
                  <p className="text-sm text-red-600">
                    ONにすると、全てのチェックイン・チェックアウトが停止します
                  </p>
                </div>
                <button
                  onClick={() => setEmergencyForm(f => ({ ...f, emergency_stop: !f.emergency_stop }))}
                  className={`relative w-14 h-8 rounded-full transition-colors ${
                    emergencyForm.emergency_stop ? "bg-red-600" : "bg-slate-300"
                  }`}
                >
                  <span 
                    className={`absolute top-1 left-1 w-6 h-6 bg-white rounded-full transition-transform ${
                      emergencyForm.emergency_stop ? "translate-x-6" : ""
                    }`}
                  />
                </button>
              </div>

              {/* Emergency Message */}
              {emergencyForm.emergency_stop && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    緊急停止メッセージ
                  </label>
                  <textarea
                    value={emergencyForm.emergency_message}
                    onChange={(e) => setEmergencyForm(f => ({ ...f, emergency_message: e.target.value }))}
                    placeholder="入場受付を一時停止しています。しばらくお待ちください。"
                    rows={3}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500"
                  />
                </div>
              )}

              {/* Maintenance Mode Toggle */}
              <div className="flex items-center justify-between p-4 bg-amber-50 rounded-lg border border-amber-200">
                <div>
                  <p className="font-medium text-amber-800">メンテナンスモード</p>
                  <p className="text-sm text-amber-600">
                    ONにすると、一般ユーザーはアクセスできなくなります
                  </p>
                </div>
                <button
                  onClick={() => setEmergencyForm(f => ({ ...f, maintenance_mode: !f.maintenance_mode }))}
                  className={`relative w-14 h-8 rounded-full transition-colors ${
                    emergencyForm.maintenance_mode ? "bg-amber-600" : "bg-slate-300"
                  }`}
                >
                  <span 
                    className={`absolute top-1 left-1 w-6 h-6 bg-white rounded-full transition-transform ${
                      emergencyForm.maintenance_mode ? "translate-x-6" : ""
                    }`}
                  />
                </button>
              </div>

              {/* Operation Mode */}
              <div className="p-4 bg-slate-50 rounded-lg border border-slate-200 space-y-2">
                <label className="text-sm font-medium text-slate-700">運用モード</label>
                <select
                  value={emergencyForm.operation_mode}
                  onChange={(e) => setEmergencyForm(f => ({ ...f, operation_mode: e.target.value as EmergencySettings["operation_mode"] }))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-slate-500 focus:border-slate-500"
                >
                  <option value="normal">通常</option>
                  <option value="read_only">読み取り専用</option>
                  <option value="purchase_stop">購入停止</option>
                  <option value="checkin_only">チェックイン専用</option>
                </select>
                <p className="text-xs text-slate-500">
                  購入停止・チェックイン専用など、運用モードを切り替えます。
                </p>
              </div>

              {/* Save Button */}
              <div className="flex justify-end">
                <Button
                  onClick={updateEmergency}
                  disabled={loading.emergency}
                  className={emergencyForm.emergency_stop ? "bg-red-600 hover:bg-red-700" : ""}
                >
                  {loading.emergency ? (
                    <RefreshCw className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <Check className="h-4 w-4 mr-2" />
                  )}
                  設定を保存
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Email Settings Tab */}
        {activeTab === "email" && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <Mail className="h-5 w-5" />
                メール設定
              </h2>
              <Button
                variant="outline"
                size="sm"
                onClick={fetchEmailSettings}
                disabled={loading.email}
              >
                {loading.email ? (
                  <RefreshCw className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
              </Button>
            </div>

            <div className="bg-white rounded-lg shadow-sm border p-6 space-y-6">
              {/* Mode Toggle */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">送信モード</label>
                <div className="flex gap-4">
                  <button
                    onClick={() => setEmailForm((f) => ({ ...f, email_mode: "test" }))}
                    className={`flex-1 p-4 rounded-lg border-2 transition-colors ${
                      emailForm.email_mode === "test"
                        ? "border-blue-500 bg-blue-50"
                        : "border-slate-200 hover:border-slate-300"
                    }`}
                  >
                    <div className="font-medium text-slate-900">テストモード</div>
                    <div className="text-sm text-slate-500 mt-1">
                      メールは送信されず、ログに出力されます
                    </div>
                  </button>
                  <button
                    onClick={() => setEmailForm((f) => ({ ...f, email_mode: "production" }))}
                    className={`flex-1 p-4 rounded-lg border-2 transition-colors ${
                      emailForm.email_mode === "production"
                        ? "border-emerald-500 bg-emerald-50"
                        : "border-slate-200 hover:border-slate-300"
                    }`}
                  >
                    <div className="font-medium text-slate-900">本番モード</div>
                    <div className="text-sm text-slate-500 mt-1">
                      SendGridを使用して実際にメール送信
                    </div>
                  </button>
                </div>
              </div>

              {/* SendGrid API Key (Production Mode Only) */}
              {emailForm.email_mode === "production" && (
                <div className="space-y-4 p-4 bg-emerald-50 rounded-lg border border-emerald-200">
                  <div className="flex items-center gap-2 text-emerald-800 font-medium">
                    <Key className="h-4 w-4" />
                    SendGrid設定
                  </div>
                  
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-700">APIキー</label>
                    {emailSettings?.sendgrid_api_key_set && (
                      <div className="text-sm text-slate-500 mb-1">
                        現在設定済み: {emailSettings.sendgrid_api_key_masked}
                      </div>
                    )}
                    <Input
                      type="password"
                      value={emailForm.sendgrid_api_key}
                      onChange={(e) => setEmailForm((f) => ({ ...f, sendgrid_api_key: e.target.value }))}
                      placeholder={emailSettings?.sendgrid_api_key_set ? "変更する場合のみ入力" : "SG.xxxxxxxx..."}
                      className="font-mono"
                    />
                    <p className="text-xs text-slate-500">
                      SendGridダッシュボードから取得したAPIキーを入力してください
                    </p>
                  </div>
                </div>
              )}

              {/* From Address Settings */}
              <div className="grid md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700">送信元メールアドレス</label>
                  <Input
                    type="email"
                    value={emailForm.email_from_address}
                    onChange={(e) => setEmailForm((f) => ({ ...f, email_from_address: e.target.value }))}
                    placeholder="noreply@example.com"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700">送信元名</label>
                  <Input
                    type="text"
                    value={emailForm.email_from_name}
                    onChange={(e) => setEmailForm((f) => ({ ...f, email_from_name: e.target.value }))}
                    placeholder="MATSU イベント管理"
                  />
                </div>
              </div>

              {/* Save Button */}
              <div className="flex justify-end">
                <Button
                  onClick={updateEmailSettings}
                  disabled={loading.email}
                >
                  {loading.email ? (
                    <RefreshCw className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <Check className="h-4 w-4 mr-2" />
                  )}
                  設定を保存
                </Button>
              </div>

              {/* Last Updated Info */}
              {emailSettings?.updated_at && (
                <div className="text-sm text-slate-500 border-t pt-4">
                  最終更新: {new Date(emailSettings.updated_at).toLocaleString("ja-JP")}
                  {emailSettings.updated_by && ` by ${emailSettings.updated_by}`}
                </div>
              )}
            </div>

            {/* Test Email Section */}
            <div className="bg-white rounded-lg shadow-sm border p-6 space-y-4">
              <h3 className="text-md font-semibold flex items-center gap-2">
                <Mail className="h-4 w-4" />
                テストメール送信
              </h3>

              <div className="flex items-center gap-2 p-3 rounded-lg bg-slate-50">
                <div className={`px-2 py-1 rounded text-xs font-medium ${
                  emailForm.email_mode === "test" 
                    ? "bg-blue-100 text-blue-800" 
                    : "bg-emerald-100 text-emerald-800"
                }`}>
                  {emailForm.email_mode === "test" ? "テストモード" : "本番モード"}
                </div>
                <span className="text-sm text-slate-600">
                  {emailForm.email_mode === "test" 
                    ? "実際には送信されません（ログ出力のみ）" 
                    : "実際にメールが送信されます"}
                </span>
              </div>

              <div className="flex gap-2">
                <Input
                  type="email"
                  value={testEmailAddress}
                  onChange={(e) => setTestEmailAddress(e.target.value)}
                  placeholder="test@example.com"
                  className="flex-1"
                />
                <Button
                  onClick={sendTestEmail}
                  disabled={loading.emailTest || !testEmailAddress}
                  variant="outline"
                >
                  {loading.emailTest ? (
                    <RefreshCw className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <Mail className="h-4 w-4 mr-2" />
                  )}
                  送信テスト
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

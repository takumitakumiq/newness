"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { fetchApi } from "@/lib/api";
import { useAuthStore } from "@/store/useAuthStore";
import { RefreshCw, Shield } from "lucide-react";

interface StaffUser {
  id: number;
  username: string;
  email: string;
  first_name: string;
  last_name: string;
  is_staff: boolean;
  is_superuser: boolean;
  is_active: boolean;
  date_joined: string;
  last_login: string | null;
}

export default function AdminStaffPage() {
  const { user } = useAuthStore();
  const [users, setUsers] = useState<StaffUser[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const canEditRole = !!user?.is_superuser;

  const fetchStaff = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchApi<{ users?: StaffUser[] }>("/admin/system/users");
      const staffUsers = (data.users || []).filter((u) => u.is_staff || u.is_superuser);
      setUsers(staffUsers);
    } catch (e: any) {
      setError(e?.message || "スタッフ一覧の取得に失敗しました");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStaff();
  }, []);

  const filtered = useMemo(() => {
    if (!query.trim()) return users;
    const q = query.trim().toLowerCase();
    return users.filter((u) =>
      u.username.toLowerCase().includes(q) ||
      (u.email || "").toLowerCase().includes(q) ||
      `${u.first_name} ${u.last_name}`.toLowerCase().includes(q)
    );
  }, [users, query]);

  const updateUser = async (userId: number, payload: Record<string, any>, successMessage: string) => {
    try {
      setError(null);
      setNotice(null);
      await fetchApi("/admin/system/users", {
        method: "PATCH",
        body: JSON.stringify({ user_id: userId, ...payload }),
      });
      setNotice(successMessage);
      fetchStaff();
    } catch (e: any) {
      setError(e?.message || "更新に失敗しました");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">スタッフ管理</h1>
          <p className="text-sm text-slate-500">スタッフの状態（有効/無効・権限）を管理</p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchStaff} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
          再読み込み
        </Button>
      </div>

      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <Input
          placeholder="ユーザー名 / メール / 氏名で検索"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {!canEditRole && (
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <Shield className="h-4 w-4" />
            権限変更はスーパーユーザーのみ可能です
          </div>
        )}
      </div>

      {error && (
        <div className="bg-rose-50 border border-rose-200 text-rose-900 rounded-xl p-3 text-sm">
          {error}
        </div>
      )}
      {notice && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-xl p-3 text-sm">
          {notice}
        </div>
      )}

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="px-4 py-3 text-left">ユーザー</th>
              <th className="px-4 py-3 text-left">権限</th>
              <th className="px-4 py-3 text-left">状態</th>
              <th className="px-4 py-3 text-left">最終ログイン</th>
              <th className="px-4 py-3 text-left">操作</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((staff) => (
              <tr key={staff.id} className="border-t border-slate-100">
                <td className="px-4 py-3">
                  <div className="font-medium text-slate-900">{staff.username}</div>
                  <div className="text-xs text-slate-500">{staff.email || "(メール未設定)"}</div>
                  <div className="text-xs text-slate-400">{staff.first_name} {staff.last_name}</div>
                </td>
                <td className="px-4 py-3 text-slate-600">
                  <div className="flex flex-wrap gap-2">
                    <span className={`text-xs px-2 py-0.5 rounded ${staff.is_superuser ? "bg-violet-100 text-violet-700" : "bg-slate-100 text-slate-600"}`}>
                      {staff.is_superuser ? "管理者" : "スタッフ"}
                    </span>
                    {staff.is_superuser && (
                      <span className="text-xs px-2 py-0.5 rounded bg-amber-100 text-amber-700">全権限</span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <span className={`text-xs px-2 py-0.5 rounded ${staff.is_active ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"}`}>
                    {staff.is_active ? "有効" : "無効"}
                  </span>
                </td>
                <td className="px-4 py-3 text-slate-500">
                  {staff.last_login ? new Date(staff.last_login).toLocaleString("ja-JP") : "-"}
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => updateUser(staff.id, { is_active: !staff.is_active }, staff.is_active ? "スタッフを無効化しました" : "スタッフを有効化しました")}
                    >
                      {staff.is_active ? "無効化" : "有効化"}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={!canEditRole || staff.is_superuser}
                      onClick={() => {
                        if (!confirm("スタッフ権限を解除しますか？")) return;
                        updateUser(staff.id, { is_staff: false }, "スタッフ権限を解除しました");
                      }}
                    >
                      権限解除
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-slate-400">
                  該当スタッフがいません
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

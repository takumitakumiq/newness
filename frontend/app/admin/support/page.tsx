"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { fetchApi } from "@/lib/api";
import { RefreshCw } from "lucide-react";

interface SupportResult {
  user: { id: number; username: string; email: string; first_name: string; last_name: string; is_active: boolean } | null;
  profile: { support_note: string; verification_status: string; verification_note: string; verification_updated_at: string | null } | null;
  reservations: Array<{ id: string; user_name: string; user_email: string; total_tickets: number; created_at: string }>;
  tickets: Array<{ id: string; status: string; slot_detail: { event_date: string; start_time: string }; attribute_detail: { display_name: string } }>;
  checkins: Array<{ id: string; ticket_id: string; action: string; success: boolean; message: string; created_at: string }>;
  share_links: Array<{ id: string; token: string; ticket_id: string; expires_at: string; revoked_at: string | null; access_count: number; max_accesses: number }>;
  email_logs: Array<{ id: string; to_email: string; subject: string; mode: string; success: boolean; created_at: string }>;
}

export default function AdminSupportPage() {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<SupportResult | null>(null);
  const [note, setNote] = useState("");
  const [verification, setVerification] = useState("unverified");
  const [verificationNote, setVerificationNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  const getErrorMessage = (e: any) => {
    if (typeof e?.message === "string") return e.message;
    if (typeof e?.detail === "string") return e.detail;
    return "サポート検索に失敗しました";
  };

  const search = async () => {
    setLoading(true);
    setError(null);
    try {
      if (query.trim().length < 2) {
        setError("検索条件は2文字以上で入力してください");
        setData(null);
        return;
      }
      const res = await fetchApi<SupportResult>(`/admin/support/search?q=${encodeURIComponent(query)}`);
      setData(res);
      setNote(res.profile?.support_note || "");
      setVerification(res.profile?.verification_status || "unverified");
      setVerificationNote(res.profile?.verification_note || "");
    } catch (e) {
      console.error("support search failed", e);
      setError(getErrorMessage(e));
    } finally {
      setLoading(false);
    }
  };

  const doAction = async (payload: Record<string, any>) => {
    try {
      setError(null);
      await fetchApi("/admin/support/action", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      await search();
    } catch (e) {
      console.error("support action failed", e);
      setError(getErrorMessage(e));
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">顧客サポート</h1>
          <p className="text-sm text-slate-500">ユーザー/予約/チケットを一括で確認・対応</p>
        </div>
      </div>

      <div className="flex gap-2">
        <Input placeholder="メール/ユーザー名/予約ID/チケットID" value={query} onChange={(e) => setQuery(e.target.value)} />
        <Button onClick={search} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
          検索
        </Button>
      </div>

      {error && (
        <div className="bg-rose-50 border border-rose-200 text-rose-900 rounded-xl p-3 text-sm">
          {error}
        </div>
      )}

      {data?.user && (
        <div className="grid md:grid-cols-2 gap-4">
          <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
            <h3 className="font-semibold text-slate-900">ユーザー情報</h3>
            <div className="text-sm text-slate-600">
              <div>ID: {data.user.id}</div>
              <div>ユーザー名: {data.user.username}</div>
              <div>メール: {data.user.email}</div>
              <div>状態: {data.user.is_active ? "有効" : "無効"}</div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">サポートメモ</label>
              <textarea className="w-full border rounded-lg px-3 py-2" rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
              <Button variant="outline" onClick={() => doAction({ action: "update_note", user_id: data.user?.id, note })}>メモ保存</Button>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">本人確認</label>
              <select className="w-full border rounded-lg px-3 py-2" value={verification} onChange={(e) => setVerification(e.target.value)}>
                <option value="unverified">未確認</option>
                <option value="pending">確認中</option>
                <option value="verified">確認済み</option>
                <option value="rejected">却下</option>
              </select>
              <textarea className="w-full border rounded-lg px-3 py-2" rows={2} value={verificationNote} onChange={(e) => setVerificationNote(e.target.value)} placeholder="確認メモ" />
              <Button variant="outline" onClick={() => doAction({ action: "update_verification", user_id: data.user?.id, status: verification, note: verificationNote })}>更新</Button>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
            <h3 className="font-semibold text-slate-900">操作</h3>
            {data.reservations?.[0] && (
              <Button onClick={() => doAction({ action: "resend_confirmation", reservation_id: data.reservations[0].id })}>予約確認メール再送</Button>
            )}
            <div className="space-y-2 text-sm text-slate-600">
              <p>共有リンク</p>
              {data.share_links?.map((link) => (
                <div key={link.id} className="flex items-center justify-between border rounded-lg px-2 py-1">
                  <span className="truncate">{link.token}</span>
                  {!link.revoked_at && (
                    <Button size="sm" variant="outline" onClick={() => doAction({ action: "revoke_share", token: link.token })}>失効</Button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {data && !data.user && data.reservations && data.reservations.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
          <h3 className="font-semibold text-slate-900">予約情報</h3>
          <div className="space-y-2 text-sm">
            {data.reservations.map((r) => (
              <div key={r.id} className="border rounded-lg px-3 py-2">
                <div className="font-medium text-slate-900">{r.id}</div>
                <div className="text-slate-500">{r.user_name || "(名前未設定)"} / {r.user_email || "(メール未設定)"}</div>
                <div className="text-slate-500">チケット数: {r.total_tickets}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {data?.tickets && data.tickets.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <h3 className="font-semibold text-slate-900 mb-3">チケット</h3>
          <div className="space-y-2 text-sm">
            {data.tickets.map((t) => (
              <div key={t.id} className="border rounded-lg px-3 py-2">
                <div className="font-medium text-slate-900">{t.id}</div>
                <div className="text-slate-500">{t.slot_detail?.event_date} {t.slot_detail?.start_time} / {t.attribute_detail?.display_name}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {data?.email_logs && data.email_logs.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <h3 className="font-semibold text-slate-900 mb-3">メール履歴</h3>
          <div className="space-y-2 text-sm">
            {data.email_logs.map((log) => (
              <div key={log.id} className="border rounded-lg px-3 py-2">
                <div className="font-medium">{log.subject}</div>
                <div className="text-slate-500">{log.to_email} / {log.mode} / {log.success ? "成功" : "失敗"}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

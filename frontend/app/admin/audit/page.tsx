"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { fetchApi, fetchApiRaw } from "@/lib/api";
import { FileDown, RefreshCw } from "lucide-react";

interface AuditLog {
  type: string;
  id: string;
  action: string;
  actor: string | null;
  ticket_id?: string | null;
  user_id?: string | null;
  message?: string;
  metadata?: Record<string, any>;
  diff?: Record<string, { before: any; after: any }>;
  created_at: string;
}

export default function AdminAuditPage() {
  const [filters, setFilters] = useState({
    from: "",
    to: "",
    actor: "",
    user_id: "",
    ticket_id: "",
    type: "",
  });
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      Object.entries(filters).forEach(([k, v]) => {
        if (v) params.append(k, v);
      });
      const data = await fetchApi<{ logs: AuditLog[] }>(`/admin/audit/search?${params.toString()}`);
      setLogs(data.logs || []);
    } catch (e) {
      console.error("Failed to fetch audit logs", e);
    } finally {
      setLoading(false);
    }
  };

  const exportCsv = async () => {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([k, v]) => {
      if (v) params.append(k, v);
    });
    const res = await fetchApiRaw(`/admin/audit/export?${params.toString()}`);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `audit_${new Date().toISOString()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">監査ログ検索</h1>
          <p className="text-sm text-slate-500">操作・チェックイン・メール・共有リンクの横断検索</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={fetchLogs} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            検索
          </Button>
          <Button variant="outline" onClick={exportCsv}>
            <FileDown className="h-4 w-4 mr-2" />
            CSV
          </Button>
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-3">
        <Input placeholder="From (ISO)" value={filters.from} onChange={(e) => setFilters(f => ({ ...f, from: e.target.value }))} />
        <Input placeholder="To (ISO)" value={filters.to} onChange={(e) => setFilters(f => ({ ...f, to: e.target.value }))} />
        <Input placeholder="操作者" value={filters.actor} onChange={(e) => setFilters(f => ({ ...f, actor: e.target.value }))} />
        <Input placeholder="user_id" value={filters.user_id} onChange={(e) => setFilters(f => ({ ...f, user_id: e.target.value }))} />
        <Input placeholder="ticket_id" value={filters.ticket_id} onChange={(e) => setFilters(f => ({ ...f, ticket_id: e.target.value }))} />
        <select
          value={filters.type}
          onChange={(e) => setFilters(f => ({ ...f, type: e.target.value }))}
          className="px-3 py-2 border border-slate-300 rounded-lg"
        >
          <option value="">すべて</option>
          <option value="admin">管理操作</option>
          <option value="checkin">チェックイン</option>
          <option value="email">メール</option>
          <option value="share">共有リンク</option>
        </select>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="px-4 py-3 text-left">種別</th>
              <th className="px-4 py-3 text-left">アクション</th>
              <th className="px-4 py-3 text-left">操作者</th>
              <th className="px-4 py-3 text-left">対象</th>
              <th className="px-4 py-3 text-left">メッセージ</th>
              <th className="px-4 py-3 text-left">日時</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((log) => (
              <tr key={log.id} className="border-t border-slate-100">
                <td className="px-4 py-3 text-slate-700">{log.type}</td>
                <td className="px-4 py-3 text-slate-900 font-medium">{log.action}</td>
                <td className="px-4 py-3 text-slate-700">{log.actor || "-"}</td>
                <td className="px-4 py-3 text-slate-500">
                  {log.ticket_id || log.user_id || "-"}
                </td>
                <td className="px-4 py-3 text-slate-500">
                  {log.message || "-"}
                  {log.diff && Object.keys(log.diff).length > 0 && (
                    <div className="mt-2 text-xs text-slate-500">
                      {Object.entries(log.diff).map(([key, value]) => (
                        <div key={key}>
                          {key}: {String(value.before)} → {String(value.after)}
                        </div>
                      ))}
                    </div>
                  )}
                </td>
                <td className="px-4 py-3 text-slate-500">
                  {new Date(log.created_at).toLocaleString("ja-JP")}
                </td>
              </tr>
            ))}
            {logs.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-slate-400">該当データがありません</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, RefreshCw, ChevronLeft, ChevronRight, QrCode, Edit2, X, Check } from "lucide-react";
import { fetchApi } from "@/lib/api";

interface Ticket {
  id: string;
  status: string;
  status_display: string;
  guest_info: Record<string, any>;
  slot_detail: { event_date: string; start_time: string };
  attribute_detail: { display_name: string };
  entered_at: string | null;
  reservation_id: string;
}

export default function TicketsPage() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "valid" | "entered" | "cancelled">("all");
  const [dateFilter, setDateFilter] = useState<string>("");
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<Ticket | null>(null);
  const [editForm, setEditForm] = useState({ status: "", guest_name: "" });
  const pageSize = 20;

  const fetchTickets = async () => {
    setLoading(true);
    try {
      const data = await fetchApi<{ results: Ticket[] } | Ticket[]>("/tickets");
      setTickets(Array.isArray(data) ? data : data.results || []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const updateTicket = async () => {
    if (!editing) return;
    try {
      const body: Record<string, any> = { status: editForm.status };
      if (editForm.guest_name) {
        body.guest_info = { ...editing.guest_info, name: editForm.guest_name };
      }
      await fetchApi(`/tickets/${editing.id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      fetchTickets();
      setEditing(null);
    } catch (e) { console.error(e); alert("エラーが発生しました"); }
  };

  const openEdit = (t: Ticket) => {
    setEditing(t);
    setEditForm({ status: t.status, guest_name: t.guest_info?.name || "" });
  };

  useEffect(() => { fetchTickets(); }, []);

  const filtered = tickets.filter(t => {
    const matchSearch =
      t.id?.toLowerCase().includes(search.toLowerCase()) ||
      t.guest_info?.name?.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === "all" || t.status === statusFilter;
    const matchDate = !dateFilter || t.slot_detail?.event_date === dateFilter;
    return matchSearch && matchStatus && matchDate;
  });

  const paged = filtered.slice((page - 1) * pageSize, page * pageSize);
  const totalPages = Math.ceil(filtered.length / pageSize);

  const stats = {
    all: tickets.length,
    valid: tickets.filter(t => t.status === "valid").length,
    entered: tickets.filter(t => t.status === "entered").length,
    cancelled: tickets.filter(t => t.status === "cancelled").length,
  };

  const statusBadge = (status: string, label: string) => {
    const c = status === "valid" ? "bg-blue-100 text-blue-700" : status === "entered" ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700";
    return <span className={`px-2 py-0.5 rounded text-xs font-medium ${c}`}>{label}</span>;
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">チケット管理</h1>
          <p className="text-sm text-slate-500">{filtered.length} 件</p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchTickets}><RefreshCw className="h-4 w-4" /></Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { key: "all" as const, label: "全て", color: "bg-slate-100 text-slate-700" },
          { key: "valid" as const, label: "有効", color: "bg-blue-50 text-blue-700" },
          { key: "entered" as const, label: "入場済", color: "bg-emerald-50 text-emerald-700" },
          { key: "cancelled" as const, label: "キャンセル", color: "bg-rose-50 text-rose-700" },
        ].map(s => (
          <button
            key={s.key}
            onClick={() => { setStatusFilter(s.key); setPage(1); }}
            className={`p-3 rounded-xl text-center transition-all border ${statusFilter === s.key ? "ring-2 ring-slate-900 border-transparent" : "border-slate-200"} ${s.color}`}
          >
            <p className="text-xl font-bold">{stats[s.key]}</p>
            <p className="text-xs font-medium">{s.label}</p>
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="grid md:grid-cols-2 gap-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input placeholder="ID・名前で検索..." className="pl-9" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
        </div>
        <Input type="date" value={dateFilter} onChange={(e) => { setDateFilter(e.target.value); setPage(1); }} />
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-12"><RefreshCw className="h-6 w-6 animate-spin text-slate-400" /></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-slate-600">ID</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-600">日付</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-600">時間</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-600">種別</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-600">名前</th>
                  <th className="text-center px-4 py-3 font-medium text-slate-600">状態</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-600">入場時間</th>
                  <th className="text-center px-4 py-3 font-medium text-slate-600">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {paged.map((t) => (
                  <tr key={t.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <QrCode className="h-4 w-4 text-slate-400" />
                        <span className="font-mono text-xs text-slate-600">{t.id?.slice(0, 8)}...</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-700">{t.slot_detail?.event_date}</td>
                    <td className="px-4 py-3 text-slate-700">{t.slot_detail?.start_time?.slice(0, 5)}</td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-0.5 bg-violet-50 text-violet-700 text-xs rounded font-medium">{t.attribute_detail?.display_name}</span>
                    </td>
                    <td className="px-4 py-3 font-medium text-slate-900">{t.guest_info?.name || "-"}</td>
                    <td className="px-4 py-3 text-center">{statusBadge(t.status, t.status_display)}</td>
                    <td className="px-4 py-3 text-slate-500 text-xs">{t.entered_at ? new Date(t.entered_at).toLocaleTimeString("ja-JP") : "-"}</td>
                    <td className="px-4 py-3 text-center">
                      <button onClick={() => openEdit(t)} className="p-1.5 hover:bg-blue-100 rounded-lg text-blue-600" title="編集">
                        <Edit2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {paged.length === 0 && <p className="text-center py-8 text-slate-400">チケットがありません</p>}
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-slate-500">{(page - 1) * pageSize + 1}-{Math.min(page * pageSize, filtered.length)} / {filtered.length}</span>
          <div className="flex gap-1">
            <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}><ChevronLeft className="h-4 w-4" /></Button>
            <span className="px-3 py-1 text-sm text-slate-600">{page}/{totalPages}</span>
            <Button variant="outline" size="sm" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}><ChevronRight className="h-4 w-4" /></Button>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {editing && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setEditing(null)}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b">
              <h3 className="font-semibold text-slate-900">チケットを編集</h3>
              <button onClick={() => setEditing(null)} className="p-1 hover:bg-slate-100 rounded"><X className="h-4 w-4" /></button>
            </div>
            <div className="p-4 space-y-4">
              <div className="bg-slate-50 rounded-lg p-3 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">チケットID</span>
                  <span className="font-mono">{editing.id}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">日時</span>
                  <span>{editing.slot_detail?.event_date} {editing.slot_detail?.start_time}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">種別</span>
                  <span>{editing.attribute_detail?.display_name}</span>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">来場者名</label>
                <Input value={editForm.guest_name} onChange={e => setEditForm(f => ({ ...f, guest_name: e.target.value }))} placeholder="名前を入力" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">ステータス</label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { value: "valid", label: "有効", color: "bg-blue-100 text-blue-700 border-blue-300" },
                    { value: "entered", label: "入場済", color: "bg-emerald-100 text-emerald-700 border-emerald-300" },
                    { value: "cancelled", label: "キャンセル", color: "bg-rose-100 text-rose-700 border-rose-300" },
                  ].map(s => (
                    <button
                      key={s.value}
                      onClick={() => setEditForm(f => ({ ...f, status: s.value }))}
                      className={`py-2 px-3 rounded-lg text-sm font-medium border-2 transition ${
                        editForm.status === s.value ? `${s.color} ring-2 ring-offset-1 ring-slate-400` : "bg-white border-slate-200 text-slate-600"
                      }`}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => setEditing(null)}>キャンセル</Button>
                <Button className="flex-1" onClick={updateTicket}><Check className="h-4 w-4 mr-1" />保存</Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

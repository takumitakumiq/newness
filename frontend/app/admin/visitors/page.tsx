"use client";

import { useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useVisitorsStore } from "@/store/useVisitorsStore";
import type { Reservation, Ticket } from "./types";
import {
  fetchReservations,
  fetchTickets,
  fetchReservationDetail,
  updateReservation as updateReservationApi,
  deleteReservation as deleteReservationApi,
  updateTicket as updateTicketApi,
} from "./api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Search, Download, RefreshCw, Eye, Edit2, Trash2, XCircle,
  ChevronLeft, ChevronRight, X, Check, Mail, User
} from "lucide-react";

export default function VisitorsPage() {
  const queryClient = useQueryClient();
  const {
    search,
    view,
    statusFilter,
    dateFilter,
    page,
    selected,
    editingRes,
    editingTicket,
    viewingTicket,
    editForm,
    ticketForm,
    setSearch,
    setView,
    setStatusFilter,
    setDateFilter,
    setPage,
    setSelected,
    setEditingRes,
    setEditingTicket,
    setViewingTicket,
    updateEditForm,
    updateTicketForm,
    openEditRes,
    openEditTicket,
    openViewTicket,
  } = useVisitorsStore();

  const reservationsQuery = useQuery({
    queryKey: ["admin-reservations"],
    queryFn: fetchReservations,
  });
  const ticketsQuery = useQuery({
    queryKey: ["admin-tickets"],
    queryFn: fetchTickets,
  });

  const reservations = reservationsQuery.data ?? [];
  const tickets = ticketsQuery.data ?? [];
  const loading = reservationsQuery.isLoading || ticketsQuery.isLoading;

  const filteredRes = useMemo(() => {
    const s = search.toLowerCase();
    return reservations
      .filter(r =>
        r.user_name?.toLowerCase().includes(s) ||
        r.user_email?.toLowerCase().includes(s) ||
        r.guest_identifier?.toLowerCase().includes(s)
      )
      .filter(r => !dateFilter || r.created_at?.slice(0, 10) === dateFilter);
  }, [reservations, search, dateFilter]);

  const filteredTix = useMemo(() => {
    const s = search.toLowerCase();
    return tickets.filter(t => {
      const matchSearch = t.id?.toLowerCase().includes(s) ||
        t.guest_info?.name?.toLowerCase().includes(s) ||
        t.guest_info?.guest_name?.toLowerCase().includes(s) ||
        t.guest_info?.student_id?.toLowerCase().includes(s) ||
        t.attribute_detail?.display_name?.toLowerCase().includes(s);
      const matchStatus = statusFilter === "all" || t.status === statusFilter;
      const matchDate = !dateFilter || t.slot_detail?.event_date === dateFilter;
      return matchSearch && matchStatus && matchDate;
    });
  }, [tickets, search, statusFilter, dateFilter]);

  const data = view === "reservations" ? filteredRes : filteredTix;
  const pageSize = 15;
  const paged = data.slice((page - 1) * pageSize, page * pageSize);
  const totalPages = Math.ceil(data.length / pageSize);
  const ticketCounts = useMemo(() => ({
    all: tickets.length,
    valid: tickets.filter(t => t.status === "valid").length,
    entered: tickets.filter(t => t.status === "entered").length,
    cancelled: tickets.filter(t => t.status === "cancelled").length,
  }), [tickets]);

  const reservationDetailMutation = useMutation({
    mutationFn: fetchReservationDetail,
    onSuccess: (detail) => setSelected(detail),
  });

  const updateReservationMutation = useMutation({
    mutationFn: updateReservationApi,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-reservations"] });
      setEditingRes(null);
    },
    onError: () => alert("更新に失敗しました"),
  });

  const deleteReservationMutation = useMutation({
    mutationFn: deleteReservationApi,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-reservations"] });
      setSelected(null);
    },
    onError: () => alert("削除に失敗しました"),
  });

  const updateTicketMutation = useMutation({
    mutationFn: updateTicketApi,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-tickets"] });
      setEditingTicket(null);
    },
    onError: () => alert("更新に失敗しました"),
  });

  const fetchDetail = (id: string) => reservationDetailMutation.mutate(id);

  const updateReservation = () => {
    if (!editingRes) return;
    updateReservationMutation.mutate({ id: editingRes.id, data: editForm });
  };

  const deleteReservation = (id: string) => {
    if (!confirm("この予約を削除しますか？関連するチケットも削除されます。")) return;
    deleteReservationMutation.mutate(id);
  };

  const updateTicket = () => {
    if (!editingTicket) return;
    updateTicketMutation.mutate({ id: editingTicket.id, data: { status: ticketForm.status, guest_info: ticketForm.guest_info } });
  };

  const cancelTicket = (id: string) => {
    if (!confirm("このチケットをキャンセルしますか？")) return;
    updateTicketMutation.mutate({ id, data: { status: "cancelled" } });
  };

  const exportCSV = () => {
    const rows = view === "reservations"
      ? [["ID", "氏名", "メール", "枚数", "日時"], ...filteredRes.map(r => [r.id, r.user_name, r.user_email, r.total_tickets, r.created_at])]
      : [["ID", "日付", "時間", "種別", "名前", "ステータス"], ...filteredTix.map(t => [t.id, t.slot_detail?.event_date, t.slot_detail?.start_time, t.attribute_detail?.display_name, getGuestDisplayText(t.guest_info), t.status_display])];
    const csv = rows.map(r => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${view}.csv`;
    a.click();
  };

  const statusBadge = (status: string, label: string) => {
    const c = status === "valid" ? "bg-blue-100 text-blue-700" : status === "entered" ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700";
    return <span className={`px-2 py-0.5 rounded text-xs font-medium ${c}`}>{label}</span>;
  };

  const getFieldLabel = (key: string) => {
    const map: Record<string, string> = {
      name: "氏名",
      guest_name: "氏名",
      student_id: "学籍",
      graduation_year: "卒業年度",
      email: "メール",
      tel: "電話番号",
    };
    return map[key] || key;
  };

  const getGuestDisplayText = (info?: Record<string, any>): string => {
    if (!info) return "-";
    const name = info.name || info.guest_name;
    if (name) return name;
    if (info.student_id) return `学籍: ${info.student_id}`;
    if (info.graduation_year) return `卒業: ${info.graduation_year}`;
    const firstValue = Object.values(info)[0];
    return firstValue ? String(firstValue) : "-";
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">来場者・予約管理</h1>
          <p className="text-sm text-slate-500">予約/チケットの検索・更新・運用をまとめて管理</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => view === "reservations" ? reservationsQuery.refetch() : ticketsQuery.refetch()}>
            <RefreshCw className="h-4 w-4 mr-1" />更新
          </Button>
          <Button variant="outline" size="sm" onClick={exportCSV}>
            <Download className="h-4 w-4 mr-1" />CSV
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-4">
        <div className="flex flex-col lg:flex-row gap-3 lg:items-center">
          <div className="inline-flex rounded-xl border border-slate-200 p-1 bg-slate-50">
            <button
              onClick={() => setView("reservations")}
              className={`px-4 py-2 text-sm font-medium rounded-lg transition ${view === "reservations" ? "bg-white shadow text-slate-900" : "text-slate-600"}`}
            >
              予約一覧
            </button>
            <button
              onClick={() => setView("tickets")}
              className={`px-4 py-2 text-sm font-medium rounded-lg transition ${view === "tickets" ? "bg-white shadow text-slate-900" : "text-slate-600"}`}
            >
              チケット一覧
            </button>
          </div>
          <div className="grid md:grid-cols-3 gap-2 flex-1">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                placeholder="名前・メール・IDで検索"
                className="pl-9"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <Input
              type="date"
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
            />
            {view === "tickets" ? (
              <div className="flex flex-wrap gap-2">
                {([
                  { key: "all", label: "全て" },
                  { key: "valid", label: "有効" },
                  { key: "entered", label: "入場済" },
                  { key: "cancelled", label: "キャンセル" },
                ] as const).map(s => (
                  <button
                    key={s.key}
                    onClick={() => setStatusFilter(s.key)}
                    className={`px-3 py-2 rounded-lg text-xs font-medium border transition ${statusFilter === s.key ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-700 border-slate-200 hover:border-slate-300"}`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            ) : (
              <div className="text-xs text-slate-500 flex items-center">予約日の指定で絞り込み</div>
            )}
          </div>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <p className="text-xs text-slate-500">現在の表示</p>
          <p className="text-2xl font-semibold text-slate-900">{data.length}</p>
          <p className="text-xs text-slate-500">件</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <p className="text-xs text-slate-500">予約数</p>
          <p className="text-2xl font-semibold text-slate-900">{reservations.length}</p>
          <p className="text-xs text-slate-500">全体</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <p className="text-xs text-slate-500">チケット数</p>
          <p className="text-2xl font-semibold text-slate-900">{ticketCounts.all}</p>
          <p className="text-xs text-slate-500">全体</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <p className="text-xs text-slate-500">入場済み</p>
          <p className="text-2xl font-semibold text-slate-900">{ticketCounts.entered}</p>
          <p className="text-xs text-slate-500">キャンセル {ticketCounts.cancelled}</p>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-12"><RefreshCw className="h-6 w-6 animate-spin text-slate-400" /></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                {view === "reservations" ? (
                  <tr>
                    <th className="text-left px-4 py-3 font-medium text-slate-600">ID</th>
                    <th className="text-left px-4 py-3 font-medium text-slate-600">氏名</th>
                    <th className="text-left px-4 py-3 font-medium text-slate-600">メール</th>
                    <th className="text-center px-4 py-3 font-medium text-slate-600">枚数</th>
                    <th className="text-left px-4 py-3 font-medium text-slate-600">日時</th>
                    <th className="text-center px-4 py-3 font-medium text-slate-600">操作</th>
                  </tr>
                ) : (
                  <tr>
                    <th className="text-left px-4 py-3 font-medium text-slate-600">ID</th>
                    <th className="text-left px-4 py-3 font-medium text-slate-600">日付</th>
                    <th className="text-left px-4 py-3 font-medium text-slate-600">時間</th>
                    <th className="text-left px-4 py-3 font-medium text-slate-600">種別</th>
                    <th className="text-left px-4 py-3 font-medium text-slate-600">名前</th>
                    <th className="text-center px-4 py-3 font-medium text-slate-600">状態</th>
                    <th className="text-center px-4 py-3 font-medium text-slate-600">操作</th>
                  </tr>
                )}
              </thead>
              <tbody className="divide-y divide-slate-100">
                {view === "reservations" ? (
                  (paged as Reservation[]).map((r) => (
                    <tr key={r.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 font-mono text-xs text-slate-500">{r.guest_identifier?.slice(0, 8)}...</td>
                      <td className="px-4 py-3 font-medium text-slate-900">{r.user_name || "-"}</td>
                      <td className="px-4 py-3 text-slate-600">{r.user_email || "-"}</td>
                      <td className="px-4 py-3 text-center text-slate-700">{r.total_tickets}</td>
                      <td className="px-4 py-3 text-slate-500 text-xs">{new Date(r.created_at).toLocaleString("ja-JP")}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-center gap-1">
                          <button onClick={() => fetchDetail(r.id)} className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-500" title="詳細"><Eye className="h-4 w-4" /></button>
                          <button onClick={() => openEditRes(r)} className="p-1.5 hover:bg-blue-100 rounded-lg text-blue-600" title="編集"><Edit2 className="h-4 w-4" /></button>
                          <button onClick={() => deleteReservation(r.id)} className="p-1.5 hover:bg-rose-100 rounded-lg text-rose-600" title="削除"><Trash2 className="h-4 w-4" /></button>
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  (paged as Ticket[]).map((t) => (
                    <tr key={t.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 font-mono text-xs text-slate-500">{t.id?.slice(0, 8)}...</td>
                      <td className="px-4 py-3 text-slate-700">{t.slot_detail?.event_date}</td>
                      <td className="px-4 py-3 text-slate-700">{t.slot_detail?.start_time}</td>
                      <td className="px-4 py-3 text-slate-700">{t.attribute_detail?.display_name}</td>
                      <td className="px-4 py-3 font-medium text-slate-900">{getGuestDisplayText(t.guest_info)}</td>
                      <td className="px-4 py-3 text-center">{statusBadge(t.status, t.status_display)}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-center gap-1">
                          <button onClick={() => openViewTicket(t)} className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-500" title="詳細"><Eye className="h-4 w-4" /></button>
                          <button onClick={() => openEditTicket(t)} className="p-1.5 hover:bg-blue-100 rounded-lg text-blue-600" title="編集"><Edit2 className="h-4 w-4" /></button>
                          {t.status === "valid" && (
                            <button onClick={() => cancelTicket(t.id)} className="p-1.5 hover:bg-rose-100 rounded-lg text-rose-600" title="キャンセル"><XCircle className="h-4 w-4" /></button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
            {paged.length === 0 && <p className="text-center py-8 text-slate-400">データがありません</p>}
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-slate-500">{(page - 1) * pageSize + 1}-{Math.min(page * pageSize, data.length)} / {data.length}</span>
          <div className="flex gap-1">
            <Button variant="outline" size="sm" onClick={() => setPage(Math.max(1, page - 1))} disabled={page === 1}><ChevronLeft className="h-4 w-4" /></Button>
            <span className="px-3 py-1 text-sm text-slate-600">{page}/{totalPages}</span>
            <Button variant="outline" size="sm" onClick={() => setPage(Math.min(totalPages, page + 1))} disabled={page === totalPages}><ChevronRight className="h-4 w-4" /></Button>
          </div>
        </div>
      )}

      {/* Detail Modal */}
      {selected && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setSelected(null)}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-slate-200">
              <h3 className="font-semibold text-slate-900">予約詳細</h3>
              <button onClick={() => setSelected(null)} className="p-1 hover:bg-slate-100 rounded text-slate-500"><X className="h-4 w-4" /></button>
            </div>
            <div className="p-4 space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="bg-slate-50 rounded-lg p-3"><p className="text-slate-500 text-xs mb-1">氏名</p><p className="font-medium text-slate-900">{selected.user_name || "-"}</p></div>
                <div className="bg-slate-50 rounded-lg p-3"><p className="text-slate-500 text-xs mb-1">メール</p><p className="font-medium text-slate-900 break-all text-xs">{selected.user_email || "-"}</p></div>
                <div className="bg-slate-50 rounded-lg p-3"><p className="text-slate-500 text-xs mb-1">チケット枚数</p><p className="font-medium text-slate-900">{selected.total_tickets}枚</p></div>
                <div className="bg-slate-50 rounded-lg p-3"><p className="text-slate-500 text-xs mb-1">予約日時</p><p className="font-medium text-slate-900 text-xs">{new Date(selected.created_at).toLocaleString("ja-JP")}</p></div>
              </div>
              <div className="bg-slate-50 rounded-lg p-3">
                <p className="text-slate-500 text-xs mb-1">予約ID</p>
                <p className="font-mono text-xs text-slate-700">{selected.guest_identifier}</p>
              </div>
              {selected.tickets && selected.tickets.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-slate-700 mb-2">チケット一覧</p>
                  <div className="space-y-2">
                    {selected.tickets.map(t => (
                      <div key={t.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border border-slate-200">
                        <div>
                          <p className="text-sm font-medium text-slate-900">
                            {getGuestDisplayText(t.guest_info)}
                          </p>
                          <p className="text-xs text-slate-600">{t.attribute_detail?.display_name}</p>
                          <p className="text-xs text-slate-500">{t.slot_detail?.event_date} {t.slot_detail?.start_time}</p>
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          {statusBadge(t.status, t.status_display)}
                          <button onClick={() => { setSelected(null); openViewTicket(t); }} className="text-xs text-blue-600 hover:underline">詳細</button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div className="flex gap-2 pt-2">
                <Button variant="outline" className="flex-1" onClick={() => { setSelected(null); openEditRes(selected); }}>
                  <Edit2 className="h-4 w-4 mr-1" />編集
                </Button>
                <Button variant="outline" className="flex-1 text-rose-600 hover:bg-rose-50" onClick={() => deleteReservation(selected.id)}>
                  <Trash2 className="h-4 w-4 mr-1" />削除
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Reservation Modal */}
      {editingRes && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setEditingRes(null)}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b">
              <h3 className="font-semibold text-slate-900">予約を編集</h3>
              <button onClick={() => setEditingRes(null)} className="p-1 hover:bg-slate-100 rounded"><X className="h-4 w-4" /></button>
            </div>
            <div className="p-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  <User className="h-3.5 w-3.5 inline mr-1" />氏名
                </label>
                <Input value={editForm.user_name} onChange={e => updateEditForm(f => ({ ...f, user_name: e.target.value }))} />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  <Mail className="h-3.5 w-3.5 inline mr-1" />メールアドレス
                </label>
                <Input type="email" value={editForm.user_email} onChange={e => updateEditForm(f => ({ ...f, user_email: e.target.value }))} />
              </div>
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => setEditingRes(null)}>キャンセル</Button>
                <Button className="flex-1" onClick={updateReservation}><Check className="h-4 w-4 mr-1" />保存</Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Ticket Modal */}
      {editingTicket && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setEditingTicket(null)}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-slate-200">
              <h3 className="font-semibold text-slate-900">チケットを編集</h3>
              <button onClick={() => setEditingTicket(null)} className="p-1 hover:bg-slate-100 rounded text-slate-500"><X className="h-4 w-4" /></button>
            </div>
            <div className="p-4 space-y-4">
              {/* Ticket Info */}
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="bg-slate-50 rounded-lg p-3">
                  <p className="text-xs text-slate-500 mb-1">チケットID</p>
                  <p className="font-mono text-xs text-slate-700">{editingTicket.id.slice(0, 16)}...</p>
                </div>
                <div className="bg-slate-50 rounded-lg p-3">
                  <p className="text-xs text-slate-500 mb-1">種別</p>
                  <p className="font-medium text-slate-900">{editingTicket.attribute_detail?.display_name}</p>
                </div>
              </div>
              <div className="bg-blue-50 rounded-lg p-3">
                <p className="text-xs text-blue-600 mb-1">入場枠</p>
                <p className="font-medium text-blue-900">{editingTicket.slot_detail?.event_date} {editingTicket.slot_detail?.start_time}</p>
              </div>

              {/* Guest Info Fields */}
              <div className="space-y-3">
                <p className="text-sm font-medium text-slate-700">ゲスト情報</p>
                {/* 名前フィールドは必須で常に表示 */}
                <div>
                  <label className="block text-sm text-slate-600 mb-1">
                    氏名 <span className="text-rose-500">*</span>
                  </label>
                  <Input 
                    value={String(ticketForm.guest_info.name || "")} 
                    placeholder="山田 太郎"
                    onChange={e => updateTicketForm(f => ({ 
                      ...f, 
                      guest_info: { ...f.guest_info, name: e.target.value } 
                    }))} 
                  />
                </div>
                {/* その他のフィールド */}
                {Object.entries(ticketForm.guest_info)
                  .filter(([key]) => key !== "name")
                  .map(([key, value]) => (
                    <div key={key}>
                      <label className="block text-sm text-slate-600 mb-1">{getFieldLabel(key)}</label>
                      <Input 
                        value={String(value || "")} 
                        onChange={e => updateTicketForm(f => ({ 
                          ...f, 
                          guest_info: { ...f.guest_info, [key]: e.target.value } 
                        }))} 
                      />
                    </div>
                  ))
                }
              </div>

              {/* Status */}
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
                      onClick={() => updateTicketForm(f => ({ ...f, status: s.value }))}
                      className={`py-2 px-3 rounded-lg text-sm font-medium border-2 transition ${
                        ticketForm.status === s.value ? `${s.color} ring-2 ring-offset-1 ring-slate-400` : "bg-white border-slate-200 text-slate-600"
                      }`}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex gap-2 pt-2">
                <Button variant="outline" className="flex-1" onClick={() => setEditingTicket(null)}>キャンセル</Button>
                <Button className="flex-1" onClick={updateTicket}><Check className="h-4 w-4 mr-1" />保存</Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* View Ticket Modal */}
      {viewingTicket && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setViewingTicket(null)}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-slate-200">
              <h3 className="font-semibold text-slate-900">チケット詳細</h3>
              <button onClick={() => setViewingTicket(null)} className="p-1 hover:bg-slate-100 rounded text-slate-500"><X className="h-4 w-4" /></button>
            </div>
            <div className="p-4 space-y-4">
              {/* Status Badge */}
              <div className="flex justify-center">
                <span className={`px-4 py-2 rounded-full text-sm font-medium ${
                  viewingTicket.status === "valid" ? "bg-blue-100 text-blue-700" : 
                  viewingTicket.status === "entered" ? "bg-emerald-100 text-emerald-700" : 
                  "bg-rose-100 text-rose-700"
                }`}>
                  {viewingTicket.status_display}
                </span>
              </div>

              {/* Ticket Info */}
              <div className="space-y-2">
                <div className="bg-slate-50 rounded-lg p-3">
                  <p className="text-xs text-slate-500 mb-1">チケットID</p>
                  <p className="font-mono text-xs text-slate-700 break-all">{viewingTicket.id}</p>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-slate-50 rounded-lg p-3">
                    <p className="text-xs text-slate-500 mb-1">種別</p>
                    <p className="font-medium text-slate-900">{viewingTicket.attribute_detail?.display_name}</p>
                  </div>
                  <div className="bg-slate-50 rounded-lg p-3">
                    <p className="text-xs text-slate-500 mb-1">入場枠</p>
                    <p className="font-medium text-slate-900 text-sm">{viewingTicket.slot_detail?.event_date}<br/>{viewingTicket.slot_detail?.start_time}</p>
                  </div>
                </div>
                {viewingTicket.entered_at && (
                  <div className="bg-emerald-50 rounded-lg p-3">
                    <p className="text-xs text-emerald-600 mb-1">入場日時</p>
                    <p className="font-medium text-emerald-900">{new Date(viewingTicket.entered_at).toLocaleString("ja-JP")}</p>
                  </div>
                )}
              </div>

              {/* Guest Info */}
              {viewingTicket.guest_info && Object.keys(viewingTicket.guest_info).length > 0 && (
                <div>
                  <p className="text-sm font-medium text-slate-700 mb-2">ゲスト情報</p>
                  <div className="space-y-2">
                    {Object.entries(viewingTicket.guest_info).map(([key, value]) => (
                      <div key={key} className="bg-slate-50 rounded-lg p-3">
                        <p className="text-xs text-slate-500 mb-1">{getFieldLabel(key)}</p>
                        <p className="font-medium text-slate-900">{String(value)}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-2 pt-2">
                <Button variant="outline" className="flex-1" onClick={() => { setViewingTicket(null); openEditTicket(viewingTicket); }}>
                  <Edit2 className="h-4 w-4 mr-1" />編集
                </Button>
                {viewingTicket.status === "valid" && (
                  <Button variant="outline" className="flex-1 text-rose-600 hover:bg-rose-50" onClick={() => { cancelTicket(viewingTicket.id); setViewingTicket(null); }}>
                    <XCircle className="h-4 w-4 mr-1" />キャンセル
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

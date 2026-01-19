"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Calendar, Clock, Users, RefreshCw, Edit2, Plus, X, Check, ToggleLeft, ToggleRight, Trash2 } from "lucide-react";
import { fetchApi } from "@/lib/api";

interface Slot {
  id: string;
  event_date: string;
  start_time: string;
  end_time: string;
  capacity: number;
  booked_count: number;
  remaining: number;
  is_active: boolean;
}

export default function SlotsPage() {
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Slot | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ event_date: "", start_time: "", end_time: "", capacity: 50, is_active: true });
  const [notice, setNotice] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const getErrorMessage = (e: any) => {
    if (typeof e?.message === "string") return e.message;
    if (typeof e?.detail === "string") return e.detail;
    if (Array.isArray(e?.errors)) return e.errors.join("\n");
    if (e?.errors && typeof e.errors === "object") {
      const first = Object.values(e.errors)[0] as any;
      if (Array.isArray(first)) return String(first[0]);
    }
    return "エラーが発生しました";
  };

  const fetchSlots = async () => {
    setLoading(true);
    try {
      const data = await fetchApi<{ results: Slot[] } | Slot[]>("/slots");
      setSlots(Array.isArray(data) ? data : data.results || []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchSlots(); }, []);

  const toggleAvailability = async (slot: Slot) => {
    try {
      await fetchApi(`/slots/${slot.id}`, {
        method: "PATCH",
        body: JSON.stringify({ is_active: !slot.is_active }),
      });
      fetchSlots();
      setNotice({ type: "success", message: "予約受付の状態を更新しました" });
    } catch (e) {
      console.error(e);
      setNotice({ type: "error", message: getErrorMessage(e) });
    }
  };

  const saveSlot = async () => {
    try {
      const isEditing = editing !== null;
      const payload = {
        ...form,
        capacity: Number(form.capacity),
        is_active: form.is_active,
        end_time: form.end_time ? form.end_time : null,
      };
      await fetchApi(isEditing ? `/slots/${editing.id}` : "/slots", {
        method: isEditing ? "PATCH" : "POST",
        body: JSON.stringify(payload),
      });
      fetchSlots();
      closeModal();
      setNotice({ type: "success", message: isEditing ? "時間枠を更新しました" : "時間枠を作成しました" });
    } catch (e) {
      console.error(e);
      setNotice({ type: "error", message: getErrorMessage(e) });
    }
  };

  const deleteSlot = async (id: string) => {
    if (!confirm("この時間枠を削除しますか？")) return;
    try {
      const res = await fetchApi<{ message?: string; soft_deleted?: boolean }>(`/slots/${id}`, { method: "DELETE" });
      fetchSlots();
      setNotice({ type: "success", message: res?.message || "時間枠を削除しました" });
    } catch (e) {
      console.error(e);
      setNotice({ type: "error", message: getErrorMessage(e) });
    }
  };

  const closeModal = () => {
    setCreating(false);
    setEditing(null);
    setForm({ event_date: "", start_time: "", end_time: "", capacity: 50, is_active: true });
  };

  const openEdit = (slot: Slot) => {
    setEditing(slot);
    setForm({
      event_date: slot.event_date,
      start_time: slot.start_time,
      end_time: slot.end_time,
      capacity: slot.capacity,
      is_active: slot.is_active,
    });
  };

  const groupedByDate = slots.reduce((acc, slot) => {
    if (!acc[slot.event_date]) acc[slot.event_date] = [];
    acc[slot.event_date].push(slot);
    return acc;
  }, {} as Record<string, Slot[]>);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">時間枠管理</h1>
          <p className="text-sm text-slate-500">{slots.length} 枠</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => { setCreating(true); setForm({ event_date: "", start_time: "", end_time: "", capacity: 50, is_active: true }); }}>
            <Plus className="h-4 w-4 mr-1" />新規
          </Button>
          <Button variant="outline" size="icon" onClick={fetchSlots}><RefreshCw className="h-4 w-4" /></Button>
        </div>
      </div>

      {notice && (
        <div className={`rounded-xl border p-3 text-sm ${notice.type === "success" ? "bg-emerald-50 border-emerald-200 text-emerald-900" : "bg-rose-50 border-rose-200 text-rose-900"}`}>
          {notice.message}
        </div>
      )}

      {/* Create/Edit Modal */}
      {(creating || editing) && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={closeModal}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b">
              <h3 className="font-semibold text-slate-900">{editing ? "時間枠を編集" : "新規時間枠"}</h3>
              <button onClick={closeModal} className="p-1 hover:bg-slate-100 rounded"><X className="h-4 w-4" /></button>
            </div>
            <div className="p-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">日付</label>
                <Input type="date" value={form.event_date} onChange={e => setForm(f => ({ ...f, event_date: e.target.value }))} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">開始時間</label>
                  <Input type="time" value={form.start_time} onChange={e => setForm(f => ({ ...f, start_time: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">終了時間</label>
                  <Input type="time" value={form.end_time} onChange={e => setForm(f => ({ ...f, end_time: e.target.value }))} />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">定員</label>
                <Input type="number" value={form.capacity} onChange={e => setForm(f => ({ ...f, capacity: parseInt(e.target.value) || 50 }))} />
              </div>
              <div 
                className="flex items-center justify-between py-3 px-2 rounded-lg hover:bg-slate-50 cursor-pointer"
                onClick={() => setForm(f => ({ ...f, is_active: !f.is_active }))}
              >
                <span className="text-sm text-slate-600">予約受付を有効にする</span>
                <div className={`relative w-12 h-6 rounded-full transition-colors ${form.is_active ? "bg-emerald-500" : "bg-slate-300"}`}>
                  <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${form.is_active ? "translate-x-6" : "translate-x-0.5"}`} />
                </div>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={closeModal}>キャンセル</Button>
                <Button className="flex-1" onClick={saveSlot}><Check className="h-4 w-4 mr-1" />保存</Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Content */}
      {loading ? (
        <div className="flex justify-center py-12"><RefreshCw className="h-8 w-8 animate-spin text-slate-400" /></div>
      ) : Object.keys(groupedByDate).length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
          <Calendar className="h-12 w-12 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500">時間枠がありません</p>
          <Button className="mt-4" onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4 mr-1" />新規作成
          </Button>
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(groupedByDate).sort((a, b) => a[0].localeCompare(b[0])).map(([date, dateSlots]) => (
            <div key={date}>
              <div className="flex items-center gap-2 mb-3">
                <Calendar className="h-4 w-4 text-slate-400" />
                <h2 className="font-semibold text-slate-900">{date}</h2>
                <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded">{dateSlots.length} 枠</span>
              </div>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {dateSlots.sort((a, b) => a.start_time.localeCompare(b.start_time)).map(slot => {
                  const fillRate = slot.capacity > 0 ? (slot.booked_count / slot.capacity) * 100 : 0;
                  return (
                    <div key={slot.id} className={`bg-white rounded-xl border p-4 transition ${slot.is_active ? "border-slate-200" : "border-rose-200 bg-rose-50/50"}`}>
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <Clock className="h-4 w-4 text-slate-400" />
                          <span className="font-semibold text-slate-900">{slot.start_time?.slice(0, 5)} - {slot.end_time?.slice(0, 5)}</span>
                        </div>
                        <button onClick={() => toggleAvailability(slot)} className={`p-1 rounded ${slot.is_active ? "text-emerald-600" : "text-slate-400"}`}>
                          {slot.is_active ? <ToggleRight className="h-5 w-5" /> : <ToggleLeft className="h-5 w-5" />}
                        </button>
                      </div>
                      <div className="flex items-center gap-2 mb-2">
                        <Users className="h-3.5 w-3.5 text-slate-400" />
                        <span className="text-sm text-slate-600">{slot.booked_count} / {slot.capacity}</span>
                        <span className={`text-xs px-1.5 py-0.5 rounded ${fillRate >= 90 ? "bg-rose-100 text-rose-700" : fillRate >= 60 ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"}`}>
                          {fillRate.toFixed(0)}%
                        </span>
                      </div>
                      <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden mb-3">
                        <div className={`h-full rounded-full ${fillRate >= 90 ? "bg-rose-500" : fillRate >= 60 ? "bg-amber-500" : "bg-emerald-500"}`} style={{ width: `${fillRate}%` }}></div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => openEdit(slot)}
                          className="text-xs text-slate-500 hover:text-slate-900 flex items-center gap-1"
                        >
                          <Edit2 className="h-3 w-3" />編集
                        </button>
                        <button
                          onClick={() => deleteSlot(slot.id)}
                          className="text-xs text-rose-500 hover:text-rose-700 flex items-center gap-1"
                        >
                          <Trash2 className="h-3 w-3" />削除
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

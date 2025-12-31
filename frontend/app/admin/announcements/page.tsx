"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { RefreshCw, Plus, Edit2, Trash2, X, Check, MessageSquare, Calendar, ToggleLeft, ToggleRight } from "lucide-react";

interface Announcement {
  id: number;
  title: string;
  content: string;
  is_active: boolean;
  created_at: string;
}

export default function AnnouncementsPage() {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Announcement | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ title: "", content: "", is_active: true });

  const fetchAnnouncements = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem("access_token");
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "";
      const res = await fetch(`${apiUrl}/api/announcements/`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setAnnouncements(Array.isArray(data) ? data : data.results || []);
      }
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchAnnouncements(); }, []);

  const save = async () => {
    try {
      const token = localStorage.getItem("access_token");
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "";
      const isEditing = editing !== null;
      const res = await fetch(`${apiUrl}/api/announcements/${isEditing ? editing.id + "/" : ""}`, {
        method: isEditing ? "PATCH" : "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (res.ok) {
        fetchAnnouncements();
        closeModal();
      }
    } catch (e) { console.error(e); }
  };

  const toggleActive = async (a: Announcement) => {
    try {
      const token = localStorage.getItem("access_token");
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "";
      const res = await fetch(`${apiUrl}/api/announcements/${a.id}/`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ is_active: !a.is_active }),
      });
      if (res.ok) fetchAnnouncements();
    } catch (e) { console.error(e); }
  };

  const remove = async (id: number) => {
    if (!confirm("削除しますか？")) return;
    try {
      const token = localStorage.getItem("access_token");
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "";
      const res = await fetch(`${apiUrl}/api/announcements/${id}/`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) fetchAnnouncements();
    } catch (e) { console.error(e); }
  };

  const closeModal = () => {
    setCreating(false);
    setEditing(null);
    setForm({ title: "", content: "", is_active: true });
  };

  const openEdit = (a: Announcement) => {
    setEditing(a);
    setForm({ title: a.title, content: a.content, is_active: a.is_active });
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">お知らせ管理</h1>
          <p className="text-sm text-slate-500">{announcements.length} 件</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => { setCreating(true); setForm({ title: "", content: "", is_active: true }); }}>
            <Plus className="h-4 w-4 mr-1" />新規作成
          </Button>
          <Button variant="outline" size="icon" onClick={fetchAnnouncements}><RefreshCw className="h-4 w-4" /></Button>
        </div>
      </div>

      {/* Modal */}
      {(creating || editing) && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={closeModal}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b">
              <h3 className="font-semibold text-slate-900">{editing ? "お知らせを編集" : "新規お知らせ"}</h3>
              <button onClick={closeModal} className="p-1 hover:bg-slate-100 rounded"><X className="h-4 w-4" /></button>
            </div>
            <div className="p-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">タイトル</label>
                <Input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="タイトルを入力" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">内容</label>
                <Textarea value={form.content} onChange={e => setForm(f => ({ ...f, content: e.target.value }))} placeholder="内容を入力" rows={5} />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-600">公開する</span>
                <button onClick={() => setForm(f => ({ ...f, is_active: !f.is_active }))} className={`p-1 ${form.is_active ? "text-emerald-600" : "text-slate-400"}`}>
                  {form.is_active ? <ToggleRight className="h-6 w-6" /> : <ToggleLeft className="h-6 w-6" />}
                </button>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={closeModal}>キャンセル</Button>
                <Button className="flex-1" onClick={save}><Check className="h-4 w-4 mr-1" />保存</Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Content */}
      {loading ? (
        <div className="flex justify-center py-12"><RefreshCw className="h-8 w-8 animate-spin text-slate-400" /></div>
      ) : announcements.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
          <MessageSquare className="h-12 w-12 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500">お知らせがありません</p>
        </div>
      ) : (
        <div className="space-y-3">
          {announcements.map(a => (
            <div key={a.id} className={`bg-white rounded-xl border p-4 transition ${a.is_active ? "border-slate-200" : "border-slate-200 bg-slate-50 opacity-60"}`}>
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    {a.is_active ? (
                      <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 text-xs font-medium rounded">公開中</span>
                    ) : (
                      <span className="px-2 py-0.5 bg-slate-100 text-slate-500 text-xs font-medium rounded">非公開</span>
                    )}
                    <span className="text-xs text-slate-400 flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      {new Date(a.created_at).toLocaleDateString("ja-JP")}
                    </span>
                  </div>
                  <h3 className="font-semibold text-slate-900 mb-1">{a.title}</h3>
                  <p className="text-sm text-slate-600 line-clamp-2">{a.content}</p>
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={() => toggleActive(a)} className={`p-2 hover:bg-slate-100 rounded-lg ${a.is_active ? "text-emerald-600" : "text-slate-400"}`}>
                    {a.is_active ? <ToggleRight className="h-5 w-5" /> : <ToggleLeft className="h-5 w-5" />}
                  </button>
                  <button onClick={() => openEdit(a)} className="p-2 hover:bg-slate-100 rounded-lg text-slate-500"><Edit2 className="h-4 w-4" /></button>
                  <button onClick={() => remove(a.id)} className="p-2 hover:bg-rose-100 rounded-lg text-rose-500"><Trash2 className="h-4 w-4" /></button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

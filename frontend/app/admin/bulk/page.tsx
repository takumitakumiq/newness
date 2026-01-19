"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { fetchApi } from "@/lib/api";
import { getSlots } from "@/lib/api";
import type { EntrySlot } from "@/lib/types";

export default function AdminBulkPage() {
  const [slots, setSlots] = useState<EntrySlot[]>([]);
  const [slotId, setSlotId] = useState("");
  const [fromSlotId, setFromSlotId] = useState("");
  const [toSlotId, setToSlotId] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const load = async () => {
      const data = await getSlots();
      setSlots(data);
    };
    load();
  }, []);

  const run = async (action: string, extra: Record<string, any> = {}) => {
    setLoading(true);
    try {
      await fetchApi("/admin/bulk", {
        method: "POST",
        body: JSON.stringify({ action, ...extra }),
      });
      alert("実行しました");
    } catch (e) {
      console.error(e);
      alert("実行に失敗しました");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900">一括オペレーション</h1>
        <p className="text-sm text-slate-500">入場締切・一括取消・枠移動・リマインド</p>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-4">
        <h3 className="font-semibold text-slate-900">入場締切</h3>
        <select className="w-full border rounded-lg px-3 py-2" value={slotId} onChange={(e) => setSlotId(e.target.value)}>
          <option value="">入場枠を選択</option>
          {slots.map((slot) => (
            <option key={slot.id} value={slot.id}>
              {slot.event_date} {slot.start_time}
            </option>
          ))}
        </select>
        <div className="flex gap-2">
          <Button disabled={!slotId || loading} onClick={() => run("close_entry", { slot_id: slotId })}>締切</Button>
          <Button variant="outline" disabled={!slotId || loading} onClick={() => run("open_entry", { slot_id: slotId })}>解除</Button>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-4">
        <h3 className="font-semibold text-slate-900">一括チェックイン取り消し</h3>
        <select className="w-full border rounded-lg px-3 py-2" value={slotId} onChange={(e) => setSlotId(e.target.value)}>
          <option value="">入場枠を選択</option>
          {slots.map((slot) => (
            <option key={slot.id} value={slot.id}>
              {slot.event_date} {slot.start_time}
            </option>
          ))}
        </select>
        <Button disabled={!slotId || loading} onClick={() => run("checkin_revert", { slot_id: slotId })}>一括取り消し</Button>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-4">
        <h3 className="font-semibold text-slate-900">枠移動</h3>
        <select className="w-full border rounded-lg px-3 py-2" value={fromSlotId} onChange={(e) => setFromSlotId(e.target.value)}>
          <option value="">移動元</option>
          {slots.map((slot) => (
            <option key={slot.id} value={slot.id}>
              {slot.event_date} {slot.start_time}
            </option>
          ))}
        </select>
        <select className="w-full border rounded-lg px-3 py-2" value={toSlotId} onChange={(e) => setToSlotId(e.target.value)}>
          <option value="">移動先</option>
          {slots.map((slot) => (
            <option key={slot.id} value={slot.id}>
              {slot.event_date} {slot.start_time}
            </option>
          ))}
        </select>
        <Button disabled={!fromSlotId || !toSlotId || loading} onClick={() => run("move_slot", { from_slot_id: fromSlotId, to_slot_id: toSlotId })}>移動</Button>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-4">
        <h3 className="font-semibold text-slate-900">一括リマインドメール</h3>
        <select className="w-full border rounded-lg px-3 py-2" value={slotId} onChange={(e) => setSlotId(e.target.value)}>
          <option value="">入場枠を選択</option>
          {slots.map((slot) => (
            <option key={slot.id} value={slot.id}>
              {slot.event_date} {slot.start_time}
            </option>
          ))}
        </select>
        <Button disabled={!slotId || loading} onClick={() => run("reminder_email", { slot_id: slotId })}>送信</Button>
      </div>
    </div>
  );
}

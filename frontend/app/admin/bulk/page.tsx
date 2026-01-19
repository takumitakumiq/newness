"use client";

export default function AdminBulkPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900">一括オペレーション</h1>
        <p className="text-sm text-slate-500">現在この機能は利用停止中です</p>
      </div>
      <div className="bg-amber-50 border border-amber-200 text-amber-900 rounded-xl p-4 text-sm">
        運用方針により一括操作は無効化されています。必要な場合は個別操作をご利用ください。
      </div>
    </div>
  );
}

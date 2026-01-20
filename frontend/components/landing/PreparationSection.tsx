"use client";

import { Smartphone, Ticket, MapPin } from "lucide-react";

export function PreparationSection() {
  return (
    <section className="grid gap-4 md:grid-cols-3">
      <div className="glass rounded-xl p-4 border border-festival-neon/20">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-festival-neon/20 flex items-center justify-center">
            <Smartphone className="h-5 w-5 text-festival-neon" />
          </div>
          <div>
            <p className="text-sm text-slate-600 dark:text-slate-300">準備 1</p>
            <h3 className="font-semibold text-foreground">メールアドレス</h3>
          </div>
        </div>
        <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">
          予約完了メールの受け取りに必要です。
        </p>
      </div>
      <div className="glass rounded-xl p-4 border border-festival-neon/20">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-festival-neon/20 flex items-center justify-center">
            <Ticket className="h-5 w-5 text-festival-neon" />
          </div>
          <div>
            <p className="text-sm text-slate-600 dark:text-slate-300">準備 2</p>
            <h3 className="font-semibold text-foreground">希望の日時</h3>
          </div>
        </div>
        <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">
          混雑を避けたい時間帯を事前に決めておくと便利です。
        </p>
      </div>
      <div className="glass rounded-xl p-4 border border-festival-neon/20">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-festival-neon/20 flex items-center justify-center">
            <MapPin className="h-5 w-5 text-festival-neon" />
          </div>
          <div>
            <p className="text-sm text-slate-600 dark:text-slate-300">準備 3</p>
            <h3 className="font-semibold text-foreground">入場予定の確認</h3>
          </div>
        </div>
        <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">
          同伴者の分もまとめて予約できます。
        </p>
      </div>
    </section>
  );
}

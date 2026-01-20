"use client";

import { ShieldCheck, Ticket, Users } from "lucide-react";

interface HighlightsSectionProps {
  stats: {
    totalSlots: number;
    totalAttributes: number;
    totalRemaining: number;
  };
}

export function HighlightsSection({ stats }: HighlightsSectionProps) {
  return (
    <section className="grid gap-5 md:grid-cols-3">
      <div className="glass rounded-2xl p-5 border border-festival-neon/20">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-festival-neon/20 flex items-center justify-center">
            <ShieldCheck className="h-5 w-5 text-festival-neon" />
          </div>
          <div>
            <p className="text-sm text-slate-600 dark:text-slate-300">予約枠</p>
            <h3 className="font-semibold text-foreground">{stats.totalSlots} 枠</h3>
          </div>
        </div>
        <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">
          混雑を避けられる枠数を用意しています。
        </p>
      </div>
      <div className="glass rounded-2xl p-5 border border-festival-neon/20">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-festival-neon/20 flex items-center justify-center">
            <Ticket className="h-5 w-5 text-festival-neon" />
          </div>
          <div>
            <p className="text-sm text-slate-600 dark:text-slate-300">チケット種別</p>
            <h3 className="font-semibold text-foreground">{stats.totalAttributes} 種</h3>
          </div>
        </div>
        <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">
          来場区分ごとにチケットを用意しています。
        </p>
      </div>
      <div className="glass rounded-2xl p-5 border border-festival-neon/20">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-festival-neon/20 flex items-center justify-center">
            <Users className="h-5 w-5 text-festival-neon" />
          </div>
          <div>
            <p className="text-sm text-slate-600 dark:text-slate-300">空き残数</p>
            <h3 className="font-semibold text-foreground">{stats.totalRemaining} 席</h3>
          </div>
        </div>
        <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">
          空きがある時間帯を選択してください。
        </p>
      </div>
    </section>
  );
}

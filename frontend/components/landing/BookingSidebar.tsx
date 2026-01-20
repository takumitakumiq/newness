"use client";

import { CheckCircle } from "lucide-react";

interface BookingSidebarProps {
  step1Done: boolean;
  step2Done: boolean;
  step3Done: boolean;
}

export function BookingSidebar({ step1Done, step2Done, step3Done }: BookingSidebarProps) {
  return (
    <div className="space-y-4">
      <div className="glass rounded-2xl p-5 border border-border/50">
        <h3 className="text-xl font-semibold mb-2">予約フォーム</h3>
        <p className="text-sm text-slate-600 dark:text-slate-300">
          まずは種別を選び、その後に時間枠を選択してください。
        </p>
        <div className="mt-4 grid gap-3 text-sm">
          <div className="flex items-center gap-2">
            <span className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${step1Done ? "bg-festival-neon text-black" : "bg-muted text-muted-foreground"}`}>
              {step1Done ? <CheckCircle className="h-4 w-4" /> : "1"}
            </span>
            <span className={step1Done ? "text-foreground" : "text-muted-foreground"}>種別を選択</span>
          </div>
          <div className="flex items-center gap-2">
            <span className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${step2Done ? "bg-festival-neon text-black" : "bg-muted text-muted-foreground"}`}>
              {step2Done ? <CheckCircle className="h-4 w-4" /> : "2"}
            </span>
            <span className={step2Done ? "text-foreground" : "text-muted-foreground"}>時間を選択</span>
          </div>
          <div className="flex items-center gap-2">
            <span className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${step3Done ? "bg-festival-neon text-black" : "bg-muted text-muted-foreground"}`}>
              {step3Done ? <CheckCircle className="h-4 w-4" /> : "3"}
            </span>
            <span className={step3Done ? "text-foreground" : "text-muted-foreground"}>カート確認</span>
          </div>
        </div>
      </div>
      <div className="glass rounded-2xl p-5 border border-border/50">
        <h4 className="font-semibold mb-2">注意事項</h4>
        <ul className="text-sm text-slate-600 dark:text-slate-300 space-y-2">
          <li>・同じ種別の上限枚数に達すると追加できません。</li>
          <li>・完売の枠は選択できません。</li>
          <li>・予約後はマイページから確認できます。</li>
        </ul>
      </div>
    </div>
  );
}

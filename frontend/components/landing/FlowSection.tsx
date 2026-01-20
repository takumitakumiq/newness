"use client";

export function FlowSection() {
  return (
    <section className="space-y-4" id="flow">
      <h3 className="text-xl font-semibold">予約の流れ</h3>
      <div className="grid gap-4 md:grid-cols-3">
        <div className="glass rounded-xl p-4 border border-border/50">
          <div className="flex items-center gap-2 mb-2">
            <span className="w-8 h-8 rounded-full bg-festival-neon text-black flex items-center justify-center font-bold">1</span>
            <h4 className="font-semibold">ログイン / 登録</h4>
          </div>
          <p className="text-sm text-slate-600 dark:text-slate-300">初めての方は新規登録から開始します。</p>
        </div>
        <div className="glass rounded-xl p-4 border border-border/50">
          <div className="flex items-center gap-2 mb-2">
            <span className="w-8 h-8 rounded-full bg-festival-neon text-black flex items-center justify-center font-bold">2</span>
            <h4 className="font-semibold">種別と時間を選択</h4>
          </div>
          <p className="text-sm text-slate-600 dark:text-slate-300">空き状況を見て希望の時間を選びます。</p>
        </div>
        <div className="glass rounded-xl p-4 border border-border/50">
          <div className="flex items-center gap-2 mb-2">
            <span className="w-8 h-8 rounded-full bg-festival-neon text-black flex items-center justify-center font-bold">3</span>
            <h4 className="font-semibold">カート確認・予約確定</h4>
          </div>
          <p className="text-sm text-slate-600 dark:text-slate-300">内容を確認して予約を完了します。</p>
        </div>
      </div>
    </section>
  );
}

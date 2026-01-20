"use client";

export function FaqSection() {
  return (
    <section className="space-y-4" id="faq">
      <h3 className="text-xl font-semibold">よくある質問</h3>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="glass rounded-xl p-4 border border-border/50">
          <h4 className="font-semibold text-foreground">予約後の確認はどこでできますか？</h4>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
            マイページでQRと予約内容を確認できます。
          </p>
        </div>
        <div className="glass rounded-xl p-4 border border-border/50">
          <h4 className="font-semibold text-foreground">家族分をまとめて予約できますか？</h4>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
            種別ごとの上限枚数内でまとめて購入できます。
          </p>
        </div>
        <div className="glass rounded-xl p-4 border border-border/50">
          <h4 className="font-semibold text-foreground">空きがない枠は選べますか？</h4>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
            「完売」の枠は選択できません。別の枠をお選びください。
          </p>
        </div>
        <div className="glass rounded-xl p-4 border border-border/50">
          <h4 className="font-semibold text-foreground">当日の入場はどうすればいいですか？</h4>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
            マイページのQRコードを提示して入場します。
          </p>
        </div>
      </div>
    </section>
  );
}

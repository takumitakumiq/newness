"use client";

import { MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";

interface SupportSectionProps {
  onMyPage: () => void;
}

export function SupportSection({ onMyPage }: SupportSectionProps) {
  return (
    <section className="glass rounded-2xl p-6 border border-border/50">
      <div className="flex items-center justify-between flex-col md:flex-row gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-festival-neon/20 flex items-center justify-center">
            <MapPin className="h-5 w-5 text-festival-neon" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-foreground">困ったときは</h3>
            <p className="text-sm text-slate-600 dark:text-slate-300">
              当日は受付スタッフにお声がけください。
            </p>
          </div>
        </div>
        <Button variant="outline" onClick={onMyPage}>マイページを確認</Button>
      </div>
    </section>
  );
}

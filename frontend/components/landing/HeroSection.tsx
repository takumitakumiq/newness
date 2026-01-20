"use client";

import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

interface HeroSectionProps {
  onStartBooking: () => void;
  onSeeFlow: () => void;
}

export function HeroSection({ onStartBooking, onSeeFlow }: HeroSectionProps) {
  return (
    <section className="grid gap-8 lg:grid-cols-[1.2fr_1fr] items-center">
      <div className="space-y-5">
        <motion.h2
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-3xl md:text-4xl font-bold text-foreground dark:bg-gradient-to-r dark:from-white dark:via-purple-200 dark:to-cyan-200 dark:bg-clip-text dark:text-transparent"
        >
          洛星文化祭の来場予約はこちら
        </motion.h2>
        <p className="text-slate-700 dark:text-slate-200/90 leading-relaxed">
          来場日時とチケット種別を選ぶだけで予約完了。混雑を避けてスムーズに入場できます。
        </p>
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
          <Button variant="neon" size="lg" onClick={onStartBooking}>
            予約を始める
            <ArrowRight className="ml-2 h-5 w-5" />
          </Button>
          <Button variant="outline" size="lg" onClick={onSeeFlow}>
            予約の流れを見る
          </Button>
        </div>
      </div>
      <div className="glass rounded-2xl p-6 border border-festival-neon/20 space-y-4">
        <div className="text-sm text-slate-600 dark:text-slate-300">来場者向けガイド</div>
        <ul className="space-y-2 text-sm text-slate-600 dark:text-slate-300">
          <li>・スマホから3分で予約完了</li>
          <li>・混雑時間を避けて来場できる</li>
          <li>・予約後はQRでスムーズ入場</li>
        </ul>
      </div>
    </section>
  );
}

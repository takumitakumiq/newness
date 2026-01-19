"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Ticket, ArrowRight, LogOut, User, AlertTriangle, Info, AlertCircle, Sun, Moon, ShieldCheck, Timer, BadgeCheck, HelpCircle, Smartphone, MapPin, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TimeSlotPicker } from "@/components/TimeSlotPicker";
import { AttributeSelector } from "@/components/AttributeSelector";
import { SmartCart } from "@/components/SmartCart";
import { AuthForm } from "@/components/AuthForm";
import { MaintenanceCheck } from "@/components/MaintenanceCheck";
import { useCartStore } from "@/store/useCartStore";
import { useAuthStore } from "@/store/useAuthStore";
import { useThemeStore } from "@/store/useThemeStore";
import { getSlots, getAttributes, getAnnouncements, type Announcement } from "@/lib/api";
import type { EntrySlot, AttributeConfig } from "@/lib/types";

export default function HomePage() {
  const router = useRouter();
  const { user, isAuthenticated, isLoading: authLoading, logout, checkAuth } = useAuthStore();
  const { theme, toggleTheme } = useThemeStore();
  const [slots, setSlots] = useState<EntrySlot[]>([]);
  const [attributes, setAttributes] = useState<AttributeConfig[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<EntrySlot | null>(null);
  const [selectedAttribute, setSelectedAttribute] = useState<AttributeConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  
  const { addItem, getCountByAttribute, totalCount } = useCartStore();
  const cartCount = totalCount();
  const step1Done = !!selectedAttribute;
  const step2Done = !!selectedSlot;
  const step3Done = cartCount > 0;

  // クライアントサイドのマウント確認
  useEffect(() => {
    setMounted(true);
  }, []);

  // Check auth on mount
  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  // Fetch announcements (always, even before login)
  useEffect(() => {
    async function fetchAnnouncements() {
      try {
        const data = await getAnnouncements();
        setAnnouncements(data);
      } catch (err) {
        console.error("Failed to fetch announcements:", err);
      }
    }
    fetchAnnouncements();
  }, []);

  // Fetch initial data only when authenticated
  useEffect(() => {
    let cancelled = false;

    const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

    async function fetchData(attempt = 0) {
      if (!isAuthenticated) {
        setLoading(false);
        return;
      }
      
      try {
        setLoading(true);
        const [slotsData, attributesData] = await Promise.all([
          getSlots(),
          getAttributes(),
        ]);
        if (cancelled) return;
        setSlots(slotsData);
        setAttributes(attributesData);
        setError(null);
      } catch (err) {
        if (cancelled) return;
        if (attempt < 1) {
          await sleep(800);
          return fetchData(attempt + 1);
        }
        setError("データの取得に失敗しました。ページを再読み込みしてください。");
        console.error(err);
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    fetchData();
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated]);

  // Handle adding ticket to cart
  const handleAddToCart = () => {
    if (!selectedSlot || !selectedAttribute) return;
    
    const itemId = addItem(selectedSlot, selectedAttribute);
    if (itemId) {
      // Success - reset selection
      setSelectedSlot(null);
      setSelectedAttribute(null);
    } else {
      // Failed - show error (quota exceeded or no availability)
      setError("追加できませんでした。上限に達しているか、残席がありません。");
      setTimeout(() => setError(null), 3000);
    }
  };

  const handleCheckout = () => {
    router.push("/checkout");
  };

  const handleLogout = async () => {
    await logout();
  };

  // Announcement icon helper
  const getAnnouncementIcon = (priority: string) => {
    switch (priority) {
      case 'critical':
        return <AlertCircle className="h-5 w-5" />;
      case 'warning':
        return <AlertTriangle className="h-5 w-5" />;
      default:
        return <Info className="h-5 w-5" />;
    }
  };

  const getAnnouncementStyle = (priority: string) => {
    switch (priority) {
      case 'critical':
        return "bg-red-50 border-red-200 text-red-800 dark:bg-red-500/20 dark:border-red-500/50 dark:text-red-200";
      case 'warning':
        return "bg-yellow-50 border-yellow-200 text-yellow-900 dark:bg-yellow-500/20 dark:border-yellow-500/50 dark:text-yellow-200";
      default:
        return "bg-blue-50 border-blue-200 text-blue-800 dark:bg-blue-500/20 dark:border-blue-500/50 dark:text-blue-200";
    }
  };

  // Show loading while checking auth
  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center space-y-4">
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
          >
            <Ticket className="h-12 w-12 mx-auto text-festival-neon" />
          </motion.div>
          <p className="text-muted-foreground">読み込み中...</p>
        </div>
      </div>
    );
  }

  // Show auth form if not authenticated
  if (!isAuthenticated) {
    return <AuthForm />;
  }

  return (
    <MaintenanceCheck>
    <div className="min-h-screen pb-20 sm:pb-24">
      {/* Header */}
      <header className="sticky top-0 z-40 glass border-b">
        <div className="container mx-auto px-3 sm:px-4 py-3 sm:py-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 sm:gap-3">
              <img
                src="/matsu-logo.svg"
                alt="MATSU ロゴ"
                className="h-8 w-8 sm:h-9 sm:w-9 rounded-md bg-white p-1 border border-slate-200"
              />
              <div>
                <h1 className="text-lg sm:text-xl font-bold">MATSU</h1>
                <p className="text-xs text-muted-foreground hidden sm:block">洛星文化祭チケット</p>
              </div>
            </div>
            <div className="flex items-center gap-1 sm:gap-2">
              {/* Theme Toggle */}
              {mounted && (
                <button
                  onClick={toggleTheme}
                  className="p-2 rounded-lg hover:bg-muted transition-colors"
                  title={theme === "dark" ? "ライトモードに切り替え" : "ダークモードに切り替え"}
                >
                  {theme === "dark" ? (
                    <Sun className="h-4 w-4 sm:h-5 sm:w-5 text-yellow-400" />
                  ) : (
                    <Moon className="h-4 w-4 sm:h-5 sm:w-5 text-slate-600" />
                  )}
                </button>
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => router.push("/mypage")}
                className="text-xs sm:text-sm"
              >
                <User className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
                <span className="hidden sm:inline">マイページ</span>
                <span className="sm:hidden">マイ</span>
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleLogout}
                className="text-xs sm:text-sm"
              >
                <LogOut className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
                <span className="hidden sm:inline">ログアウト</span>
                <span className="sm:hidden">OUT</span>
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-3 sm:px-4 py-6 sm:py-8 space-y-8 sm:space-y-12">
        {/* Announcements */}
        {announcements.length > 0 && (
          <section className="space-y-3">
            {announcements.map((announcement) => (
              <motion.div
                key={announcement.id}
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className={`p-4 rounded-lg border flex items-start gap-3 ${getAnnouncementStyle(announcement.priority)}`}
              >
                {getAnnouncementIcon(announcement.priority)}
                <div>
                  <h4 className="font-semibold">{announcement.title}</h4>
                  <p className="text-sm opacity-90">{announcement.content}</p>
                </div>
              </motion.div>
            ))}
          </section>
        )}

        {/* Error Alert */}
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="p-4 rounded-lg bg-destructive/20 border border-destructive/50 text-destructive"
          >
            {error}
          </motion.div>
        )}

        {/* Hero Section */}
        <section className="text-center space-y-4">
          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-3xl md:text-4xl font-bold text-foreground dark:bg-gradient-to-r dark:from-white dark:via-purple-200 dark:to-cyan-200 dark:bg-clip-text dark:text-transparent"
          >
            入場チケットを予約する
          </motion.h2>
          <p className="max-w-xl mx-auto text-slate-700 dark:text-slate-200/90">
            ① 種別 → ② 時間 → ③ 確認 の3ステップ。初めてでも迷わず購入できます。
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
            <Button
              variant="neon"
              size="lg"
              onClick={() => {
                const el = document.getElementById("booking-steps");
                el?.scrollIntoView({ behavior: "smooth", block: "start" });
              }}
            >
              今すぐ予約を始める
              <ArrowRight className="ml-2 h-5 w-5" />
            </Button>
            <Button
              variant="outline"
              size="lg"
              onClick={() => {
                const el = document.getElementById("faq");
                el?.scrollIntoView({ behavior: "smooth", block: "start" });
              }}
            >
              よくある質問を見る
            </Button>
          </div>
        </section>

        {/* Value Props */}
        <section className="grid gap-4 md:grid-cols-3">
          <div className="glass rounded-xl p-5 border border-festival-neon/20">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-festival-neon/20 flex items-center justify-center">
                <ShieldCheck className="h-5 w-5 text-festival-neon" />
              </div>
              <div>
                <p className="text-sm text-slate-600 dark:text-slate-300">安心・安全</p>
                <h3 className="font-semibold text-foreground">在庫ロックで確実予約</h3>
              </div>
            </div>
            <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">
              予約確定時に枠をロック。ダブルブッキングを防ぎます。
            </p>
          </div>
          <div className="glass rounded-xl p-5 border border-festival-neon/20">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-festival-neon/20 flex items-center justify-center">
                <Timer className="h-5 w-5 text-festival-neon" />
              </div>
              <div>
                <p className="text-sm text-slate-600 dark:text-slate-300">スピーディ</p>
                <h3 className="font-semibold text-foreground">3分で予約完了</h3>
              </div>
            </div>
            <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">
              種別と時間を選ぶだけ。スマホでも操作しやすいUIです。
            </p>
          </div>
          <div className="glass rounded-xl p-5 border border-festival-neon/20">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-festival-neon/20 flex items-center justify-center">
                <BadgeCheck className="h-5 w-5 text-festival-neon" />
              </div>
              <div>
                <p className="text-sm text-slate-600 dark:text-slate-300">確実</p>
                <h3 className="font-semibold text-foreground">QRで入場がスムーズ</h3>
              </div>
            </div>
            <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">
              予約後はマイページからQRを提示するだけ。
            </p>
          </div>
        </section>

        {/* Quick Guide */}
        <section className="grid gap-4 md:grid-cols-3">
          <div className="glass rounded-xl p-4 border border-festival-neon/20">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-festival-neon/20 flex items-center justify-center">
                <User className="h-5 w-5 text-festival-neon" />
              </div>
              <div>
                <p className="text-sm text-slate-600 dark:text-slate-300">STEP 1</p>
                <h3 className="font-semibold text-foreground">入場者の種別を選ぶ</h3>
              </div>
            </div>
            <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">
              在校生・保護者・一般など、該当する種別を選択します。
            </p>
          </div>
          <div className="glass rounded-xl p-4 border border-festival-neon/20">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-festival-neon/20 flex items-center justify-center">
                <Ticket className="h-5 w-5 text-festival-neon" />
              </div>
              <div>
                <p className="text-sm text-slate-600 dark:text-slate-300">STEP 2</p>
                <h3 className="font-semibold text-foreground">時間枠を選ぶ</h3>
              </div>
            </div>
            <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">
              空き状況を見ながら、希望の時間を選択します。
            </p>
          </div>
          <div className="glass rounded-xl p-4 border border-festival-neon/20">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-festival-neon/20 flex items-center justify-center">
                <ArrowRight className="h-5 w-5 text-festival-neon" />
              </div>
              <div>
                <p className="text-sm text-slate-600 dark:text-slate-300">STEP 3</p>
                <h3 className="font-semibold text-foreground">カートに追加 → 購入</h3>
              </div>
            </div>
            <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">
              カートで内容を確認し、購入手続きへ進みます。
            </p>
          </div>
        </section>

        {/* Requirements */}
        <section className="glass rounded-2xl p-6 border border-festival-neon/20">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-lg bg-festival-neon/20 flex items-center justify-center">
              <Smartphone className="h-5 w-5 text-festival-neon" />
            </div>
            <div>
              <h3 className="text-xl font-semibold text-foreground">予約に必要なもの</h3>
              <p className="text-sm text-slate-600 dark:text-slate-300">事前準備でスムーズに購入できます</p>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {["メールアドレス", "入場者のお名前", "希望の日時", "スマートフォン"].map((item) => (
              <div key={item} className="flex items-center gap-2 text-slate-700 dark:text-slate-200">
                <CheckCircle className="h-4 w-4 text-emerald-400" />
                <span>{item}</span>
              </div>
            ))}
          </div>
        </section>

        {/* Sticky Progress */}
        <section className="sticky top-20 z-30">
          <div className="glass rounded-xl p-3 border border-border/50 no-print">
            <div className="grid grid-cols-3 gap-2 text-sm">
              {[
                { label: "種別を選択", done: step1Done },
                { label: "時間を選択", done: step2Done },
                { label: "カート確認", done: step3Done },
              ].map((step, index) => (
                <div key={step.label} className="flex items-center gap-2">
                  <span
                    className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                      step.done ? "bg-festival-neon text-black" : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {step.done ? <CheckCircle className="h-4 w-4" /> : index + 1}
                  </span>
                  <span className={step.done ? "text-foreground" : "text-muted-foreground"}>
                    {step.label}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Step 1: Select Attribute */}
        <section className="space-y-4" id="booking-steps">
          <div className="flex items-center gap-2">
            <span className="flex items-center justify-center w-8 h-8 rounded-full bg-festival-neon text-black font-bold text-sm">
              1
            </span>
            <h3 className="text-xl font-semibold">入場者の種別を選択</h3>
          </div>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            同じ種別の上限枚数に達すると追加できません。
          </p>
          <AttributeSelector
            attributes={attributes}
            selectedAttributeId={selectedAttribute?.id}
            onSelect={setSelectedAttribute}
            getCount={getCountByAttribute}
          />
        </section>

        {/* Step 2: Select Time Slot */}
        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <span className="flex items-center justify-center w-8 h-8 rounded-full bg-festival-neon text-black font-bold text-sm">
              2
            </span>
            <h3 className="text-xl font-semibold">入場時間を選択</h3>
          </div>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            「残りわずか」「完売」表示で空き状況がわかります。
          </p>
          <TimeSlotPicker
            slots={slots}
            selectedSlotId={selectedSlot?.id}
            onSelect={setSelectedSlot}
          />
        </section>

        {/* Add to Cart Button */}
        <section className="flex flex-col items-center gap-3">
          <Button
            size="lg"
            variant="neon"
            disabled={!selectedSlot || !selectedAttribute}
            onClick={handleAddToCart}
            className="px-8"
          >
            カートに追加
            <ArrowRight className="ml-2 h-5 w-5" />
          </Button>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            追加後は画面下部のカートから「購入へ進む」をタップしてください。
          </p>
        </section>

        {/* FAQ */}
        <section className="space-y-4" id="faq">
          <div className="flex items-center gap-2">
            <HelpCircle className="h-5 w-5 text-festival-neon" />
            <h3 className="text-xl font-semibold">よくある質問</h3>
          </div>
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

        {/* Support */}
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
            <Button variant="outline" onClick={() => router.push("/mypage")}>マイページを確認</Button>
          </div>
        </section>
      </main>

      {/* Smart Cart */}
      <SmartCart onCheckout={handleCheckout} />
    </div>
    </MaintenanceCheck>
  );
}

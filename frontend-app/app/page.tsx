"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Ticket, Sparkles, ArrowRight, LogOut, User, AlertTriangle, Info, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TimeSlotPicker } from "@/components/TimeSlotPicker";
import { AttributeSelector } from "@/components/AttributeSelector";
import { SmartCart } from "@/components/SmartCart";
import { AuthForm } from "@/components/AuthForm";
import { useCartStore } from "@/store/useCartStore";
import { useAuthStore } from "@/store/useAuthStore";
import { getSlots, getAttributes, getAnnouncements, type Announcement } from "@/lib/api";
import type { EntrySlot, AttributeConfig } from "@/lib/types";

export default function HomePage() {
  const router = useRouter();
  const { user, isAuthenticated, isLoading: authLoading, logout, checkAuth } = useAuthStore();
  const [slots, setSlots] = useState<EntrySlot[]>([]);
  const [attributes, setAttributes] = useState<AttributeConfig[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<EntrySlot | null>(null);
  const [selectedAttribute, setSelectedAttribute] = useState<AttributeConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const { addItem, getCountByAttribute, totalCount } = useCartStore();

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
    async function fetchData() {
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
        setSlots(slotsData);
        setAttributes(attributesData);
      } catch (err) {
        setError("データの取得に失敗しました。ページを再読み込みしてください。");
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
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
        return "bg-red-500/20 border-red-500/50 text-red-200";
      case 'warning':
        return "bg-yellow-500/20 border-yellow-500/50 text-yellow-200";
      default:
        return "bg-blue-500/20 border-blue-500/50 text-blue-200";
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
    <div className="min-h-screen pb-24">
      {/* Header */}
      <header className="sticky top-0 z-40 glass border-b">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-festival-neon/20">
                <Sparkles className="h-6 w-6 text-festival-neon" />
              </div>
              <div>
                <h1 className="text-xl font-bold">MATSU</h1>
                <p className="text-xs text-muted-foreground">洛星文化祭チケット</p>
              </div>
            </div>
            <Button
              variant="ghost"
              onClick={() => router.push("/mypage")}
            >
              <User className="h-4 w-4 mr-2" />
              マイページ
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleLogout}
            >
              <LogOut className="h-4 w-4 mr-2" />
              ログアウト
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8 space-y-12">
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
            className="text-3xl md:text-4xl font-bold bg-gradient-to-r from-white via-purple-200 to-cyan-200 bg-clip-text text-transparent"
          >
            入場チケットを予約する
          </motion.h2>
          <p className="text-muted-foreground max-w-xl mx-auto">
            ご希望の日時と入場者の種別を選択して、チケットをカートに追加してください。
          </p>
        </section>

        {/* Step 1: Select Attribute */}
        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <span className="flex items-center justify-center w-8 h-8 rounded-full bg-festival-neon text-black font-bold text-sm">
              1
            </span>
            <h3 className="text-xl font-semibold">入場者の種別を選択</h3>
          </div>
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
          <TimeSlotPicker
            slots={slots}
            selectedSlotId={selectedSlot?.id}
            onSelect={setSelectedSlot}
          />
        </section>

        {/* Add to Cart Button */}
        <section className="flex justify-center">
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
        </section>
      </main>

      {/* Smart Cart */}
      <SmartCart onCheckout={handleCheckout} />
    </div>
  );
}

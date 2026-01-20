"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Ticket, LogOut, User, Sun, Moon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TimeSlotPicker } from "@/components/TimeSlotPicker";
import { AttributeSelector } from "@/components/AttributeSelector";
import { SmartCart } from "@/components/SmartCart";
import { AuthForm } from "@/components/AuthForm";
import { MaintenanceCheck } from "@/components/MaintenanceCheck";
import { AnnouncementsSection } from "@/components/landing/AnnouncementsSection";
import { HeroSection } from "@/components/landing/HeroSection";
import { HighlightsSection } from "@/components/landing/HighlightsSection";
import { PreparationSection } from "@/components/landing/PreparationSection";
import { FlowSection } from "@/components/landing/FlowSection";
import { BookingSidebar } from "@/components/landing/BookingSidebar";
import { FaqSection } from "@/components/landing/FaqSection";
import { SupportSection } from "@/components/landing/SupportSection";
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

	const totalSlots = slots.length;
	const totalAttributes = attributes.length;
	const totalRemaining = slots.reduce((sum, slot) => sum + Math.max(0, slot.capacity - slot.booked_count), 0);

	useEffect(() => {
		setMounted(true);
	}, []);

	useEffect(() => {
		checkAuth();
	}, [checkAuth]);

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

	const handleAddToCart = () => {
		if (!selectedSlot || !selectedAttribute) return;

		const itemId = addItem(selectedSlot, selectedAttribute);
		if (itemId) {
			setSelectedSlot(null);
			setSelectedAttribute(null);
		} else {
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

	if (!isAuthenticated) {
		return <AuthForm />;
	}

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

	return (
		<MaintenanceCheck>
			<div className="min-h-screen pb-24">
				<header className="sticky top-0 z-40 glass border-b">
					<div className="container mx-auto px-4 py-4">
						<div className="flex items-center justify-between">
							<div className="flex items-center gap-3">
								<img
									src="/matsu-logo.svg"
									alt="MATSU ロゴ"
									className="h-9 w-9 rounded-md bg-white p-1 border border-slate-200"
								/>
								<div>
									<h1 className="text-xl font-bold">MATSU</h1>
									<p className="text-xs text-muted-foreground">洛星文化祭チケット</p>
								</div>
							</div>
							<div className="flex items-center gap-2">
								{mounted && (
									<button
										onClick={toggleTheme}
										className="p-2 rounded-lg hover:bg-muted transition-colors"
										title={theme === "dark" ? "ライトモードに切り替え" : "ダークモードに切り替え"}
									>
										{theme === "dark" ? (
											<Sun className="h-5 w-5 text-yellow-400" />
										) : (
											<Moon className="h-5 w-5 text-slate-600" />
										)}
									</button>
								)}
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
					</div>
				</header>

				<main className="container mx-auto px-4 py-8 space-y-12">
					<AnnouncementsSection announcements={announcements} />

					<HeroSection
						onStartBooking={() => {
							const el = document.getElementById("booking");
							el?.scrollIntoView({ behavior: "smooth", block: "start" });
						}}
						onSeeFlow={() => {
							const el = document.getElementById("flow");
							el?.scrollIntoView({ behavior: "smooth", block: "start" });
						}}
					/>

					<HighlightsSection stats={{ totalSlots, totalAttributes, totalRemaining }} />

					<PreparationSection />

					<FlowSection />

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

					<section className="grid gap-8 lg:grid-cols-[1fr_1.2fr]" id="booking">
						<div className="lg:sticky lg:top-24 h-fit">
							<BookingSidebar step1Done={step1Done} step2Done={step2Done} step3Done={step3Done} />
						</div>
						<div className="space-y-8">
							<section className="space-y-4">
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

							<section className="flex flex-col items-center gap-3">
								<Button
									size="lg"
									variant="neon"
									disabled={!selectedSlot || !selectedAttribute}
									onClick={handleAddToCart}
									className="px-8"
								>
									カートに追加
								</Button>
								<p className="text-sm text-slate-600 dark:text-slate-300">
									追加後は画面下部のカートから「購入へ進む」をタップしてください。
								</p>
							</section>
						</div>
					</section>

					<FaqSection />

					<SupportSection onMyPage={() => router.push("/mypage")} />
				</main>

				<SmartCart onCheckout={handleCheckout} />
			</div>
		</MaintenanceCheck>
	);
}

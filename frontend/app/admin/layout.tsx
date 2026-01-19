"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { useAuthStore } from "@/store/useAuthStore";
import { Button } from "@/components/ui/button";
import { 
  LayoutDashboard, 
  Users, 
  LogOut, 
  Menu, 
  X, 
  Ticket,
  BarChart3,
  MessageSquare,
  Calendar,
  Shield,
  Wrench,
  FileText,
  LifeBuoy,
  Layers
} from "lucide-react";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, isAuthenticated, logout, isLoading, checkAuth } = useAuthStore();
  const router = useRouter();
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push("/auth/login?redirect=/admin");
    }
  }, [isLoading, isAuthenticated, router]);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-4">
          <div className="animate-spin rounded-full h-10 w-10 border-2 border-slate-200 border-t-slate-900"></div>
          <p className="text-slate-500 text-sm">読み込み中...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  if (!user?.is_staff) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center p-4 bg-slate-50">
        <div className="bg-white p-8 rounded-2xl shadow-xl text-center max-w-md border border-slate-100">
          <div className="w-14 h-14 bg-rose-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Shield className="w-7 h-7 text-rose-500" />
          </div>
          <h1 className="text-xl font-bold text-slate-900 mb-2">アクセス権限がありません</h1>
          <p className="text-slate-500 text-sm mb-6">管理者権限が必要です</p>
          <div className="space-y-2">
            <Button className="w-full bg-slate-900 hover:bg-slate-800" onClick={() => router.push("/")}>
              トップへ戻る
            </Button>
            <Button variant="outline" className="w-full" onClick={() => logout()}>
              ログアウト
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const navItems = [
    { href: "/admin/dashboard", label: "ダッシュボード", icon: LayoutDashboard },
    { href: "/admin/visitors", label: "来場者・チケット", icon: Users },
    { href: "/admin/slots", label: "時間枠", icon: Calendar },
    { href: "/admin/attributes", label: "種別・フォーム", icon: Ticket },
    { href: "/admin/statistics", label: "統計", icon: BarChart3 },
    { href: "/admin/announcements", label: "お知らせ", icon: MessageSquare },
    { href: "/admin/audit", label: "監査ログ", icon: FileText },
    { href: "/admin/support", label: "サポート", icon: LifeBuoy },
    { href: "/admin/bulk", label: "一括オペ", icon: Layers },
    { href: "/admin/system", label: "システム管理", icon: Wrench },
  ];

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30">
        <div className="flex h-14 items-center justify-between px-4">
          <div className="flex items-center gap-3">
            <button
              className="lg:hidden p-2 -ml-2 rounded-lg hover:bg-slate-100 text-slate-600"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            >
              {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
            <Link href="/admin/dashboard" className="flex items-center gap-2">
              <img
                src="/matsu-logo.svg"
                alt="MATSU ロゴ"
                className="h-7 w-7 rounded-md bg-white p-0.5 border border-slate-200"
              />
              <span className="text-base font-semibold text-slate-900 hidden sm:inline">MATSU</span>
            </Link>
          </div>
          
          <div className="flex items-center gap-2">
            <div className="hidden sm:flex items-center gap-2 text-sm text-slate-600 bg-slate-100 px-3 py-1.5 rounded-full">
              <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full"></div>
              {user.username}
            </div>
            <Button 
              variant="ghost" 
              size="sm" 
              className="text-slate-500 hover:text-slate-900"
              onClick={() => logout()}
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      <div className="flex">
        {/* Sidebar */}
        <aside className="w-56 bg-white border-r border-slate-200 hidden lg:flex flex-col min-h-[calc(100vh-3.5rem)] sticky top-14">
          <nav className="flex-1 p-2 space-y-0.5">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors ${
                    isActive
                      ? "bg-slate-900 text-white"
                      : "text-slate-600 hover:bg-slate-100"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </aside>

        {/* Mobile Menu */}
        {mobileMenuOpen && (
          <div className="lg:hidden fixed inset-0 z-20 bg-slate-900/40 backdrop-blur-sm" onClick={() => setMobileMenuOpen(false)}>
            <div className="absolute top-14 left-0 w-64 bg-white shadow-xl min-h-[calc(100vh-3.5rem)] border-r" onClick={(e) => e.stopPropagation()}>
              <nav className="p-2 space-y-0.5">
                {navItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = pathname === item.href;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setMobileMenuOpen(false)}
                      className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors ${
                        isActive
                          ? "bg-slate-900 text-white"
                          : "text-slate-600 hover:bg-slate-100"
                      }`}
                    >
                      <Icon className="h-4 w-4" />
                      {item.label}
                    </Link>
                  );
                })}
              </nav>
            </div>
          </div>
        )}

        {/* Main */}
        <main className="flex-1 p-4 lg:p-6 min-h-[calc(100vh-3.5rem)]">
          <div className="max-w-6xl mx-auto">{children}</div>
        </main>
      </div>
    </div>
  );
}

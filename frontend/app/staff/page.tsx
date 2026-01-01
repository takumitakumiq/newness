"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { QrCode, MessageSquare, Users, CheckCircle, Clock, TrendingUp } from "lucide-react";

interface StaffStats {
  todayCheckins: number;
  totalTickets: number;
  pendingCheckins: number;
}

export default function StaffDashboard() {
  const [stats, setStats] = useState<StaffStats>({
    todayCheckins: 0,
    totalTickets: 0,
    pendingCheckins: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const token = localStorage.getItem("access_token");
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || "";
        const res = await fetch(`${apiUrl}/api/admin/statistics/`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          setStats({
            todayCheckins: data.summary?.checked_in_count || 0,
            totalTickets: data.summary?.total_tickets || 0,
            pendingCheckins: (data.summary?.total_tickets || 0) - (data.summary?.checked_in_count || 0) - (data.summary?.cancelled_count || 0),
          });
        }
      } catch (error) {
        console.error("Failed to fetch stats", error);
      } finally {
        setLoading(false);
      }
    };
    fetchStats();
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">スタッフダッシュボード</h1>
        <p className="text-gray-500 mt-1">本日の入場受付状況</p>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="bg-gradient-to-br from-green-50 to-green-100 border-green-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-green-800 flex items-center gap-2">
              <CheckCircle className="h-4 w-4" />
              入場済み
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-green-700">
              {loading ? "..." : stats.todayCheckins}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-blue-800 flex items-center gap-2">
              <Clock className="h-4 w-4" />
              未入場
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-blue-700">
              {loading ? "..." : stats.pendingCheckins}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-purple-50 to-purple-100 border-purple-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-purple-800 flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              総チケット数
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-purple-700">
              {loading ? "..." : stats.totalTickets}
            </div>
          </CardContent>
        </Card>
      </div>
      
      {/* Action Cards */}
      <div className="grid gap-6 md:grid-cols-2">
        <Link href="/staff/scan">
          <Card className="hover:shadow-lg transition-all cursor-pointer h-full border-2 hover:border-indigo-300 group">
            <CardHeader>
              <div className="w-14 h-14 bg-indigo-100 rounded-2xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                <QrCode className="h-8 w-8 text-indigo-600" />
              </div>
              <CardTitle className="text-xl">入場受付</CardTitle>
              <CardDescription className="text-base">
                QRコードをスキャンして来場者の入場処理を行います。カメラを使用してチケットを読み取ります。
              </CardDescription>
            </CardHeader>
          </Card>
        </Link>

        <Link href="/staff/chat">
          <Card className="hover:shadow-lg transition-all cursor-pointer h-full border-2 hover:border-green-300 group">
            <CardHeader>
              <div className="w-14 h-14 bg-green-100 rounded-2xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                <MessageSquare className="h-8 w-8 text-green-600" />
              </div>
              <CardTitle className="text-xl">スタッフチャット</CardTitle>
              <CardDescription className="text-base">
                管理者や他のスタッフとリアルタイムで連絡を取ります。緊急時の連絡にもご利用ください。
              </CardDescription>
            </CardHeader>
          </Card>
        </Link>
      </div>
    </div>
  );
}

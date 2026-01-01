"use client";

import { useEffect, useState } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, PieChart, Pie, Cell, Legend,
} from "recharts";
import { 
  Calendar, Ticket, CheckCircle, XCircle, TrendingUp, Users, Clock, RefreshCw 
} from "lucide-react";

interface DashboardData {
  summary: {
    total_reservations: number;
    total_tickets: number;
    checked_in_count: number;
    cancelled_count: number;
    check_in_rate: number;
  };
  by_attribute: { attribute__display_name: string; count: number }[];
  by_slot: { slot__event_date: string; slot__start_time: string; count: number }[];
  sales_trend: { date: string; count: number }[];
}

const COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899"];

export default function AdminDashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem("access_token");
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "";
      const res = await fetch(`${apiUrl}/api/admin/statistics/`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const json = await res.json();
        setData(json);
      }
    } catch (error) {
      console.error("Failed to fetch data", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <RefreshCw className="h-8 w-8 animate-spin text-slate-400" />
      </div>
    );
  }

  if (!data) return <p className="text-center py-10 text-slate-500">データの取得に失敗しました</p>;

  const stats = [
    { label: "総予約数", value: data.summary.total_reservations, icon: Calendar, color: "bg-blue-500", bg: "bg-blue-50" },
    { label: "チケット数", value: data.summary.total_tickets, icon: Ticket, color: "bg-violet-500", bg: "bg-violet-50" },
    { label: "入場済み", value: data.summary.checked_in_count, icon: CheckCircle, color: "bg-emerald-500", bg: "bg-emerald-50", sub: `${data.summary.check_in_rate}%` },
    { label: "キャンセル", value: data.summary.cancelled_count, icon: XCircle, color: "bg-rose-500", bg: "bg-rose-50" },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">ダッシュボード</h1>
          <p className="text-sm text-slate-500">{new Date().toLocaleDateString("ja-JP", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}</p>
        </div>
        <button onClick={fetchData} className="p-2 rounded-lg hover:bg-slate-100 text-slate-500">
          <RefreshCw className="h-4 w-4" />
        </button>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((s) => {
          const Icon = s.icon;
          return (
            <div key={s.label} className="bg-white rounded-xl border border-slate-200 p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">{s.label}</span>
                <div className={`w-8 h-8 ${s.bg} rounded-lg flex items-center justify-center`}>
                  <Icon className={`h-4 w-4 ${s.color.replace("bg-", "text-")}`} />
                </div>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-bold text-slate-900">{s.value}</span>
                {s.sub && <span className="text-xs font-medium text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded">{s.sub}</span>}
              </div>
            </div>
          );
        })}
      </div>

      {/* Charts Row */}
      <div className="grid lg:grid-cols-3 gap-4">
        {/* Line Chart */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 p-4">
          <h3 className="font-semibold text-slate-900 mb-4">売上推移</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data.sales_trend}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 12 }} stroke="#94a3b8" />
                <YAxis tick={{ fontSize: 12 }} stroke="#94a3b8" />
                <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid #e2e8f0" }} />
                <Line type="monotone" dataKey="count" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3, fill: "#3b82f6" }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Pie Chart */}
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <h3 className="font-semibold text-slate-900 mb-4">券種別</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={data.by_attribute}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={70}
                  paddingAngle={4}
                  dataKey="count"
                  nameKey="attribute__display_name"
                >
                  {data.by_attribute.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ borderRadius: 8 }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Bar Chart */}
      <div className="bg-white rounded-xl border border-slate-200 p-4">
        <h3 className="font-semibold text-slate-900 mb-4">時間枠別販売数</h3>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data.by_slot}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
              <XAxis dataKey="slot__start_time" tickFormatter={(v: string) => v?.slice(0, 5)} tick={{ fontSize: 12 }} stroke="#94a3b8" />
              <YAxis tick={{ fontSize: 12 }} stroke="#94a3b8" />
              <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid #e2e8f0" }} />
              <Bar dataKey="count" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

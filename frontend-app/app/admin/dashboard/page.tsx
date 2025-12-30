"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import {
  LayoutDashboard,
  Users,
  Ticket,
  Calendar,
  Settings,
  LogOut,
  Search,
  Download,
  CheckCircle,
  XCircle,
  Clock,
  QrCode,
} from "lucide-react";

interface DashboardData {
  summary: {
    total_reservations: number;
    total_tickets: number;
    checked_in_count: number;
    cancelled_count: number;
    check_in_rate: number;
  };
  by_attribute: {
    attribute__display_name: string;
    count: number;
  }[];
  by_slot: {
    slot__event_date: string;
    slot__start_time: string;
    count: number;
  }[];
  sales_trend: {
    date: string;
    count: number;
  }[];
  recent_activity: {
    action: string;
    ticket_id: string;
    user_name: string;
    timestamp: string;
    success: boolean;
  }[];
}

const COLORS = ["#0088FE", "#00C49F", "#FFBB28", "#FF8042", "#8884d8"];

export default function AdminDashboard() {
  const router = useRouter();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("overview");
  const [searchQuery, setSearchQuery] = useState("");
  const [tickets, setTickets] = useState<any[]>([]);
  const [loadingTickets, setLoadingTickets] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const token = localStorage.getItem("access_token");
        if (!token) {
          router.push("/auth/login");
          return;
        }

        const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
        const res = await fetch(`${apiUrl}/api/admin/statistics`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (res.status === 401 || res.status === 403) {
          router.push("/auth/login");
          return;
        }

        const jsonData = await res.json();
        setData(jsonData);
      } catch (error) {
        console.error("Failed to fetch dashboard data", error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [router]);

  useEffect(() => {
    if (activeTab === "visitors" && tickets.length === 0) {
      fetchTickets();
    }
  }, [activeTab]);

  const fetchTickets = async () => {
    setLoadingTickets(true);
    try {
      const token = localStorage.getItem("access_token");
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
      const res = await fetch(`${apiUrl}/api/tickets`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setTickets(data.results || data);
    } catch (error) {
      console.error("Failed to fetch tickets", error);
    } finally {
      setLoadingTickets(false);
    }
  };

  const filteredTickets = tickets.filter((ticket) => {
    const search = searchQuery.toLowerCase();
    return (
      ticket.id.toLowerCase().includes(search) ||
      ticket.reservation?.user_name?.toLowerCase().includes(search) ||
      ticket.guest_info?.name?.toLowerCase().includes(search)
    );
  });

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Sidebar */}
      <aside className="w-64 bg-white border-r border-gray-200 hidden md:flex flex-col">
        <div className="p-6 border-b border-gray-200">
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <LayoutDashboard className="w-6 h-6 text-primary-600" />
            MATSU Admin
          </h1>
        </div>
        <nav className="flex-1 p-4 space-y-1">
          <button
            onClick={() => setActiveTab("overview")}
            className={`w-full flex items-center gap-3 px-4 py-3 text-sm font-medium rounded-xl transition-colors ${
              activeTab === "overview"
                ? "bg-primary-50 text-primary-700"
                : "text-gray-600 hover:bg-gray-50"
            }`}
          >
            <LayoutDashboard className="w-5 h-5" />
            ダッシュボード
          </button>
          <button
            onClick={() => setActiveTab("visitors")}
            className={`w-full flex items-center gap-3 px-4 py-3 text-sm font-medium rounded-xl transition-colors ${
              activeTab === "visitors"
                ? "bg-primary-50 text-primary-700"
                : "text-gray-600 hover:bg-gray-50"
            }`}
          >
            <Users className="w-5 h-5" />
            入場者リスト
          </button>
          <button
            onClick={() => setActiveTab("operations")}
            className={`w-full flex items-center gap-3 px-4 py-3 text-sm font-medium rounded-xl transition-colors ${
              activeTab === "operations"
                ? "bg-primary-50 text-primary-700"
                : "text-gray-600 hover:bg-gray-50"
            }`}
          >
            <QrCode className="w-5 h-5" />
            オペレーション
          </button>
        </nav>
        <div className="p-4 border-t border-gray-200">
          <button
            onClick={() => {
              localStorage.removeItem("access_token");
              router.push("/auth/login");
            }}
            className="w-full flex items-center gap-3 px-4 py-3 text-sm font-medium text-red-600 hover:bg-red-50 rounded-xl transition-colors"
          >
            <LogOut className="w-5 h-5" />
            ログアウト
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto">
        <header className="bg-white border-b border-gray-200 px-8 py-4 flex justify-between items-center sticky top-0 z-10">
          <h2 className="text-xl font-bold text-gray-800">
            {activeTab === "overview" && "統計ダッシュボード"}
            {activeTab === "visitors" && "入場者管理"}
            {activeTab === "operations" && "オペレーション"}
          </h2>
          <div className="flex items-center gap-4">
            <div className="text-sm text-gray-500 flex items-center gap-2">
              <Clock className="w-4 h-4" />
              {new Date().toLocaleDateString("ja-JP")}
            </div>
            <div className="h-8 w-8 bg-primary-100 rounded-full flex items-center justify-center text-primary-700 font-bold">
              A
            </div>
          </div>
        </header>

        <div className="p-8 max-w-7xl mx-auto space-y-8">
          {activeTab === "overview" && (
            <>
              {/* Stats Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <p className="text-sm font-medium text-gray-500">総予約数</p>
                      <h3 className="text-3xl font-bold text-gray-900 mt-1">
                        {data.summary.total_reservations}
                      </h3>
                    </div>
                    <div className="p-3 bg-blue-50 rounded-xl text-blue-600">
                      <Calendar className="w-6 h-6" />
                    </div>
                  </div>
                </div>
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <p className="text-sm font-medium text-gray-500">
                        チケット販売数
                      </p>
                      <h3 className="text-3xl font-bold text-primary-600 mt-1">
                        {data.summary.total_tickets}
                      </h3>
                    </div>
                    <div className="p-3 bg-purple-50 rounded-xl text-purple-600">
                      <Ticket className="w-6 h-6" />
                    </div>
                  </div>
                </div>
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <p className="text-sm font-medium text-gray-500">
                        チェックイン済み
                      </p>
                      <div className="flex items-baseline gap-2 mt-1">
                        <h3 className="text-3xl font-bold text-green-600">
                          {data.summary.checked_in_count}
                        </h3>
                        <span className="text-sm font-medium text-green-600 bg-green-50 px-2 py-0.5 rounded-full">
                          {data.summary.check_in_rate}%
                        </span>
                      </div>
                    </div>
                    <div className="p-3 bg-green-50 rounded-xl text-green-600">
                      <CheckCircle className="w-6 h-6" />
                    </div>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-1.5 mt-3">
                    <div
                      className="bg-green-500 h-1.5 rounded-full transition-all duration-500"
                      style={{ width: `${data.summary.check_in_rate}%` }}
                    ></div>
                  </div>
                </div>
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <p className="text-sm font-medium text-gray-500">
                        キャンセル数
                      </p>
                      <h3 className="text-3xl font-bold text-red-600 mt-1">
                        {data.summary.cancelled_count}
                      </h3>
                    </div>
                    <div className="p-3 bg-red-50 rounded-xl text-red-600">
                      <XCircle className="w-6 h-6" />
                    </div>
                  </div>
                </div>
              </div>

              {/* Charts */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 lg:col-span-2">
                  <h3 className="text-lg font-bold text-gray-900 mb-6">
                    売上推移 (過去7日間)
                  </h3>
                  <div className="h-80">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={data.sales_trend}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey="date" />
                        <YAxis />
                        <Tooltip />
                        <Line
                          type="monotone"
                          dataKey="count"
                          stroke="#7c3aed"
                          strokeWidth={3}
                          dot={{ r: 4, fill: "#7c3aed" }}
                          activeDot={{ r: 6 }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                  <h3 className="text-lg font-bold text-gray-900 mb-6">
                    券種別販売数
                  </h3>
                  <div className="h-80">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={data.by_attribute}
                          cx="50%"
                          cy="50%"
                          innerRadius={60}
                          outerRadius={80}
                          paddingAngle={5}
                          dataKey="count"
                          nameKey="attribute__display_name"
                        >
                          {data.by_attribute.map((entry, index) => (
                            <Cell
                              key={`cell-${index}`}
                              fill={COLORS[index % COLORS.length]}
                            />
                          ))}
                        </Pie>
                        <Tooltip />
                        <Legend />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>

              <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                <h3 className="text-lg font-bold text-gray-900 mb-6">
                  時間枠別販売数
                </h3>
                <div className="h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data.by_slot}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis
                        dataKey="slot__start_time"
                        tickFormatter={(val) => val.slice(0, 5)}
                      />
                      <YAxis />
                      <Tooltip />
                      <Bar
                        dataKey="count"
                        fill="#8884d8"
                        radius={[4, 4, 0, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </>
          )}

          {activeTab === "visitors" && (
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-lg font-bold text-gray-900">
                  入場者リスト
                </h3>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    placeholder="検索..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>
              </div>

              {loadingTickets ? (
                <div className="text-center py-10">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 mx-auto"></div>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left text-gray-500">
                    <thead className="text-xs text-gray-700 uppercase bg-gray-50">
                      <tr>
                        <th className="px-4 py-3">チケットID</th>
                        <th className="px-4 py-3">氏名</th>
                        <th className="px-4 py-3">券種</th>
                        <th className="px-4 py-3">入場枠</th>
                        <th className="px-4 py-3">ステータス</th>
                        <th className="px-4 py-3">購入日</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {filteredTickets.map((ticket) => (
                        <tr key={ticket.id} className="bg-white hover:bg-gray-50">
                          <td className="px-4 py-3 font-mono text-xs">
                            {ticket.id.slice(0, 8)}...
                          </td>
                          <td className="px-4 py-3 font-medium text-gray-900">
                            <div>
                              {ticket.guest_info?.name ||
                                ticket.reservation?.user_name ||
                                "ゲスト"}
                            </div>
                            <div className="text-xs text-gray-400">
                              {ticket.guest_info?.email ||
                                ticket.reservation?.user_email}
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            {ticket.attribute_detail?.display_name ||
                              ticket.attribute}
                          </td>
                          <td className="px-4 py-3 text-xs">
                            {ticket.slot_detail?.event_date} <br />
                            {ticket.slot_detail?.start_time}
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className={`px-2 py-1 rounded-full text-xs font-medium ${
                                ticket.status === "valid"
                                  ? "bg-blue-100 text-blue-800"
                                  : ticket.status === "entered"
                                  ? "bg-green-100 text-green-800"
                                  : "bg-red-100 text-red-800"
                              }`}
                            >
                              {ticket.status}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-xs">
                            {new Date(ticket.created_at).toLocaleString(
                              "ja-JP"
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {filteredTickets.length === 0 && (
                    <div className="text-center py-8 text-gray-500">
                      データが見つかりません
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {activeTab === "operations" && (
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 text-center py-20">
              <QrCode className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <h3 className="text-xl font-bold text-gray-900">
                オペレーション機能
              </h3>
              <p className="text-gray-500 mt-2">
                QRコードリーダーや手動チェックイン機能はこちらに実装されます。
              </p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

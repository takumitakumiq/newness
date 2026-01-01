"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { 
  Search, 
  CheckCircle, 
  XCircle, 
  User, 
  Calendar, 
  Ticket,
  RefreshCw,
  AlertTriangle,
  Mail,
  Clock
} from "lucide-react";

interface TicketResult {
  id: string;
  status: string;
  guest_info: Record<string, any>;
  attribute_detail: {
    display_name: string;
  };
  slot_detail: {
    event_date: string;
    start_time: string;
  };
  reservation_detail: {
    user_name: string;
    user_email: string;
  };
  entered_at: string | null;
}

export default function ManualCheckInPage() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<TicketResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searching, setSearching] = useState(false);
  const [checkInResult, setCheckInResult] = useState<{
    success: boolean;
    message: string;
    ticket?: TicketResult;
  } | null>(null);

  const getToken = () => localStorage.getItem("access_token");
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "";

  // 検索実行
  const performSearch = useCallback(async (searchQuery: string) => {
    if (searchQuery.length < 2) {
      setResults([]);
      return;
    }
    
    setSearching(true);
    try {
      const res = await fetch(`${apiUrl}/api/admin/manual-checkin/?q=${encodeURIComponent(searchQuery)}`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      
      if (res.ok) {
        const data = await res.json();
        setResults(data.results || []);
      }
    } catch (error) {
      console.error("Search error:", error);
    } finally {
      setSearching(false);
    }
  }, [apiUrl]);

  // デバウンス検索
  useEffect(() => {
    const timer = setTimeout(() => {
      performSearch(query);
    }, 300);
    
    return () => clearTimeout(timer);
  }, [query, performSearch]);

  // チェックイン実行
  const performCheckIn = async (ticketId: string) => {
    setLoading(true);
    setCheckInResult(null);
    
    try {
      const res = await fetch(`${apiUrl}/api/admin/manual-checkin/`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify({ ticket_id: ticketId }),
      });
      
      const data = await res.json();
      setCheckInResult(data);
      
      // 結果を反映してリスト更新
      if (data.success) {
        setResults(prev => prev.map(t => 
          t.id === ticketId 
            ? { ...t, status: "entered", entered_at: new Date().toISOString() }
            : t
        ));
      }
    } catch (error) {
      console.error("Check-in error:", error);
      setCheckInResult({
        success: false,
        message: "通信エラーが発生しました",
      });
    } finally {
      setLoading(false);
    }
  };

  // 入場取り消し
  const revertCheckIn = async (ticketId: string) => {
    if (!confirm("このチケットの入場を取り消しますか？")) return;
    
    setLoading(true);
    try {
      const res = await fetch(`${apiUrl}/api/admin/checkin/revert/`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify({ ticket_id: ticketId, reason: "手動取り消し" }),
      });
      
      const data = await res.json();
      if (data.success) {
        setResults(prev => prev.map(t => 
          t.id === ticketId 
            ? { ...t, status: "valid", entered_at: null }
            : t
        ));
        setCheckInResult({
          success: true,
          message: "入場を取り消しました",
        });
      } else {
        setCheckInResult({
          success: false,
          message: data.message || "取り消しに失敗しました",
        });
      }
    } catch (error) {
      console.error("Revert error:", error);
      setCheckInResult({
        success: false,
        message: "通信エラーが発生しました",
      });
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "valid":
        return <span className="px-2 py-1 text-xs bg-green-100 text-green-800 rounded-full">有効</span>;
      case "entered":
        return <span className="px-2 py-1 text-xs bg-blue-100 text-blue-800 rounded-full">入場済み</span>;
      case "cancelled":
        return <span className="px-2 py-1 text-xs bg-red-100 text-red-800 rounded-full">キャンセル</span>;
      default:
        return <span className="px-2 py-1 text-xs bg-gray-100 text-gray-800 rounded-full">{status}</span>;
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">手動チェックイン</h1>
        <p className="text-gray-500 mt-1">名前・メールアドレスでチケットを検索して入場処理</p>
      </div>

      {/* 検索フォーム */}
      <Card className="bg-white border-gray-200">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-gray-900">
            <Search className="h-5 w-5" />
            チケット検索
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="relative">
            <Input
              placeholder="名前、メールアドレス、チケットIDで検索..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pr-10 text-lg"
            />
            {searching && (
              <RefreshCw className="absolute right-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400 animate-spin" />
            )}
          </div>
          {query.length > 0 && query.length < 2 && (
            <p className="text-sm text-amber-600 mt-2">
              2文字以上入力してください
            </p>
          )}
        </CardContent>
      </Card>

      {/* 結果表示 */}
      {checkInResult && (
        <div className={`p-4 rounded-lg flex items-center gap-3 ${
          checkInResult.success 
            ? "bg-green-50 border border-green-200" 
            : "bg-red-50 border border-red-200"
        }`}>
          {checkInResult.success ? (
            <CheckCircle className="h-6 w-6 text-green-600" />
          ) : (
            <XCircle className="h-6 w-6 text-red-600" />
          )}
          <span className={checkInResult.success ? "text-green-800" : "text-red-800"}>
            {checkInResult.message}
          </span>
        </div>
      )}

      {/* 検索結果一覧 */}
      {results.length > 0 && (
        <Card className="bg-white border-gray-200">
          <CardHeader>
            <CardTitle className="text-gray-900">
              検索結果 ({results.length}件)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {results.map((ticket) => (
                <div
                  key={ticket.id}
                  className={`p-4 rounded-lg border ${
                    ticket.status === "entered" 
                      ? "bg-blue-50 border-blue-200" 
                      : ticket.status === "cancelled"
                      ? "bg-red-50 border-red-200"
                      : "bg-white border-gray-200"
                  }`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 space-y-2">
                      <div className="flex items-center gap-2">
                        <User className="h-4 w-4 text-gray-400" />
                        <span className="font-medium">
                          {ticket.guest_info?.name || ticket.guest_info?.guest_name || ticket.reservation_detail?.user_name || (ticket.guest_info?.student_id ? `学籍: ${ticket.guest_info.student_id}` : "未入力")}
                        </span>
                        {getStatusBadge(ticket.status)}
                      </div>
                      
                      <div className="flex items-center gap-2 text-sm text-gray-600">
                        <Mail className="h-4 w-4" />
                        <span>{ticket.reservation_detail?.user_email || "-"}</span>
                      </div>
                      
                      <div className="flex items-center gap-4 text-sm text-gray-600">
                        <div className="flex items-center gap-1">
                          <Ticket className="h-4 w-4" />
                          <span>{ticket.attribute_detail?.display_name}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Calendar className="h-4 w-4" />
                          <span>
                            {ticket.slot_detail?.event_date} {ticket.slot_detail?.start_time}
                          </span>
                        </div>
                      </div>
                      
                      {ticket.entered_at && (
                        <div className="flex items-center gap-1 text-sm text-blue-600">
                          <Clock className="h-4 w-4" />
                          <span>入場: {new Date(ticket.entered_at).toLocaleString("ja-JP")}</span>
                        </div>
                      )}
                      
                      <p className="font-mono text-xs text-gray-400">
                        ID: {ticket.id}
                      </p>
                    </div>
                    
                    <div className="flex-shrink-0">
                      {ticket.status === "valid" ? (
                        <Button
                          onClick={() => performCheckIn(ticket.id)}
                          disabled={loading}
                          className="bg-green-600 hover:bg-green-700"
                        >
                          {loading ? (
                            <RefreshCw className="h-4 w-4 animate-spin" />
                          ) : (
                            <>
                              <CheckCircle className="h-4 w-4 mr-2" />
                              入場処理
                            </>
                          )}
                        </Button>
                      ) : ticket.status === "entered" ? (
                        <Button
                          variant="outline"
                          onClick={() => revertCheckIn(ticket.id)}
                          disabled={loading}
                          className="text-amber-600 border-amber-300 hover:bg-amber-50"
                        >
                          <AlertTriangle className="h-4 w-4 mr-2" />
                          取り消し
                        </Button>
                      ) : (
                        <span className="text-sm text-gray-400">処理不可</span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {query.length >= 2 && !searching && results.length === 0 && (
        <Card className="bg-white border-gray-200">
          <CardContent className="py-12 text-center text-gray-500">
            <Search className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>該当するチケットが見つかりません</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

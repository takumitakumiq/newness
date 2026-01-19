"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { TicketCard } from "@/components/TicketCard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, AlertTriangle } from "lucide-react";
import { fetchApi } from "@/lib/api";
import type { Ticket } from "@/lib/types";

interface ShareResponse {
  success: boolean;
  ticket_id: string;
  expires_at: string;
  ticket: Ticket;
  message?: string;
}

export default function SharePage() {
  const params = useParams<{ token: string }>();
  const token = params?.token;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

    const fetchShare = async (attempt = 0) => {
      if (!token) return;
      setLoading(true);
      setError(null);
      try {
        const data = await fetchApi<ShareResponse>(`/shares/${token}`, { auth: false });
        if (!data.success) {
          throw new Error(data.message || "共有リンクが無効です");
        }
        if (cancelled) return;
        setTicket(data.ticket || null);
        setExpiresAt(data.expires_at || null);
      } catch (e: any) {
        if (cancelled) return;
        if (attempt < 1) {
          await sleep(800);
          return fetchShare(attempt + 1);
        }
        setError(e?.message || "共有リンクの取得に失敗しました");
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    fetchShare();
    return () => {
      cancelled = true;
    };
  }, [token]);

  return (
    <div className="min-h-screen pb-12">
      <div className="container mx-auto px-4 py-8 space-y-6">
        <Card className="border-slate-200">
          <CardHeader>
            <CardTitle className="text-xl">共有チケット</CardTitle>
          </CardHeader>
          <CardContent>
            {expiresAt && (
              <p className="text-sm text-slate-500">有効期限: {new Date(expiresAt).toLocaleString("ja-JP")}</p>
            )}
          </CardContent>
        </Card>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-12 text-slate-500">
            <AlertTriangle className="h-10 w-10 mb-3 text-amber-500" />
            <p>{error}</p>
          </div>
        ) : !ticket ? (
          <div className="flex flex-col items-center justify-center py-12 text-slate-500">
            <p>表示できるチケットがありません</p>
          </div>
        ) : (
          <div className="grid gap-4">
            <TicketCard ticket={ticket} />
          </div>
        )}
      </div>
    </div>
  );
}

"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { motion } from "framer-motion";
import { Gift, Loader2, CheckCircle, AlertCircle, LogIn } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { MaintenanceCheck } from "@/components/MaintenanceCheck";
import { useAuthStore } from "@/store/useAuthStore";
import { acceptTicketTransfer } from "@/lib/api";

export default function TransferAcceptPage() {
  const router = useRouter();
  const params = useParams();
  const token = params.token as string;
  
  const { isAuthenticated, isLoading: authLoading, checkAuth } = useAuthStore();
  const [status, setStatus] = useState<"pending" | "accepting" | "success" | "error">("pending");
  const [error, setError] = useState<string | null>(null);
  const [ticketInfo, setTicketInfo] = useState<any>(null);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  const handleAccept = async () => {
    if (!token) return;
    
    setStatus("accepting");
    setError(null);
    
    try {
      const result = await acceptTicketTransfer(token);
      setTicketInfo(result.ticket);
      setStatus("success");
    } catch (err: any) {
      setError(err.transfer_token?.[0] || err.error || err.message || "チケットの受け取りに失敗しました");
      setStatus("error");
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <MaintenanceCheck>
    <div className="min-h-screen flex items-center justify-center p-4">
      <Card className="glass max-w-md w-full">
        <CardHeader className="text-center">
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className="mx-auto mb-4"
          >
            <Gift className="h-16 w-16 text-festival-neon" />
          </motion.div>
          <CardTitle className="text-2xl">チケット譲渡</CardTitle>
          <CardDescription>
            誰かがあなたにチケットを譲渡しようとしています
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {!isAuthenticated ? (
            <div className="text-center space-y-4">
              <p className="text-muted-foreground">
                チケットを受け取るにはログインが必要です
              </p>
              <Button onClick={() => router.push(`/mypage?redirect=/transfer/${token}`)}>
                <LogIn className="h-4 w-4 mr-2" />
                ログインして受け取る
              </Button>
            </div>
          ) : status === "pending" ? (
            <div className="text-center space-y-4">
              <p className="text-muted-foreground">
                このチケットを受け取りますか？
              </p>
              <Button onClick={handleAccept} variant="neon" size="lg">
                <Gift className="h-5 w-5 mr-2" />
                チケットを受け取る
              </Button>
            </div>
          ) : status === "accepting" ? (
            <div className="text-center py-8">
              <Loader2 className="h-8 w-8 animate-spin mx-auto text-muted-foreground" />
              <p className="mt-4 text-muted-foreground">処理中...</p>
            </div>
          ) : status === "success" ? (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-center space-y-4"
            >
              <CheckCircle className="h-16 w-16 text-green-500 mx-auto" />
              <p className="text-lg font-semibold text-green-500">チケットを受け取りました！</p>
              {ticketInfo && (
                <div className="p-4 bg-muted rounded-lg text-left">
                  <p className="font-medium">
                    {ticketInfo.slot_detail?.event_date} {ticketInfo.slot_detail?.start_time}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {ticketInfo.attribute_detail?.display_name}
                  </p>
                </div>
              )}
              <Button onClick={() => router.push("/mypage")}>
                マイページで確認
              </Button>
            </motion.div>
          ) : (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-center space-y-4"
            >
              <AlertCircle className="h-16 w-16 text-destructive mx-auto" />
              <p className="text-destructive">{error}</p>
              <Button variant="outline" onClick={() => router.push("/")}>
                トップページへ
              </Button>
            </motion.div>
          )}
        </CardContent>
      </Card>
    </div>
    </MaintenanceCheck>
  );
}

"use client";

import { useState, useRef, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { 
  QrCode, 
  Camera, 
  CheckCircle, 
  XCircle, 
  AlertCircle, 
  RefreshCw,
  Keyboard,
  User,
  Calendar,
  Ticket
} from "lucide-react";

interface CheckInResult {
  success: boolean;
  message: string;
  ticket?: {
    id: string;
    guest_info: Record<string, any>;
    attribute_detail: {
      display_name: string;
    };
    slot_detail: {
      event_date: string;
      start_time: string;
    };
    status: string;
  };
}

interface RecentCheckIn {
  id: string;
  name: string;
  type: string;
  time: string;
  success: boolean;
}

export default function ScanPage() {
  const [mode, setMode] = useState<"camera" | "manual">("manual");
  const [manualId, setManualId] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<CheckInResult | null>(null);
  const [recentCheckIns, setRecentCheckIns] = useState<RecentCheckIn[]>([]);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Start camera
  const startCamera = async () => {
    try {
      setCameraError(null);
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" }
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        setScanning(true);
      }
    } catch (error) {
      console.error("Camera error:", error);
      setCameraError("カメラへのアクセスができません。カメラの権限を確認してください。");
    }
  };

  // Stop camera
  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setScanning(false);
  };

  // Check-in API call
  const performCheckIn = async (ticketId: string) => {
    setLoading(true);
    setResult(null);
    
    try {
      const token = localStorage.getItem("access_token");
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "";
      const res = await fetch(`${apiUrl}/api/checkin`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          ticket_uuid: ticketId,
          device_id: "staff-web",
          operator: "staff",
        }),
      });

      const data: CheckInResult = await res.json();
      setResult(data);

      // Add to recent check-ins
      const newCheckIn: RecentCheckIn = {
        id: ticketId.slice(0, 8),
        name: data.ticket?.guest_info?.name || "ゲスト",
        type: data.ticket?.attribute_detail?.display_name || "チケット",
        time: new Date().toLocaleTimeString("ja-JP"),
        success: data.success,
      };
      setRecentCheckIns(prev => [newCheckIn, ...prev.slice(0, 9)]);
      
    } catch (error) {
      console.error("Check-in error:", error);
      setResult({
        success: false,
        message: "通信エラーが発生しました。ネットワーク接続を確認してください。",
      });
    } finally {
      setLoading(false);
    }
  };

  // Handle manual input
  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (manualId.trim()) {
      performCheckIn(manualId.trim());
      setManualId("");
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, []);

  // Auto-start camera when in camera mode
  useEffect(() => {
    if (mode === "camera") {
      startCamera();
    } else {
      stopCamera();
    }
  }, [mode]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">入場受付</h1>
        <p className="text-gray-500 mt-1">QRコードをスキャンまたはチケットIDを入力</p>
      </div>

      {/* Mode Toggle */}
      <div className="flex gap-2">
        <Button
          variant={mode === "camera" ? "default" : "outline"}
          onClick={() => setMode("camera")}
          className="flex-1"
        >
          <Camera className="mr-2 h-4 w-4" />
          カメラスキャン
        </Button>
        <Button
          variant={mode === "manual" ? "default" : "outline"}
          onClick={() => setMode("manual")}
          className="flex-1"
        >
          <Keyboard className="mr-2 h-4 w-4" />
          手動入力
        </Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Scanner / Input Area */}
        <Card className="bg-white border-gray-200">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-gray-900">
              {mode === "camera" ? (
                <>
                  <QrCode className="h-5 w-5" />
                  QRコードスキャン
                </>
              ) : (
                <>
                  <Keyboard className="h-5 w-5" />
                  チケットID入力
                </>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {mode === "camera" ? (
              <div className="space-y-4">
                <div className="relative aspect-square bg-black rounded-xl overflow-hidden">
                  {cameraError ? (
                    <div className="absolute inset-0 flex flex-col items-center justify-center text-white p-4">
                      <AlertCircle className="h-12 w-12 mb-4 text-yellow-400" />
                      <p className="text-center text-sm">{cameraError}</p>
                      <Button 
                        variant="outline" 
                        className="mt-4"
                        onClick={startCamera}
                      >
                        <RefreshCw className="mr-2 h-4 w-4" />
                        再試行
                      </Button>
                    </div>
                  ) : (
                    <>
                      <video
                        ref={videoRef}
                        autoPlay
                        playsInline
                        muted
                        className="w-full h-full object-cover"
                      />
                      {scanning && (
                        <div className="absolute inset-0 flex items-center justify-center">
                          <div className="w-48 h-48 border-4 border-white/50 rounded-2xl">
                            <div className="w-full h-1 bg-indigo-500 animate-pulse" />
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
                <p className="text-sm text-gray-500 text-center">
                  QRコードをカメラに向けてください
                </p>
              </div>
            ) : (
              <form onSubmit={handleManualSubmit} className="space-y-4">
                <div>
                  <Input
                    placeholder="チケットID（UUID）を入力"
                    value={manualId}
                    onChange={(e) => setManualId(e.target.value)}
                    className="text-lg font-mono bg-gray-50 border-gray-200 text-gray-900 placeholder:text-gray-400"
                    disabled={loading}
                  />
                </div>
                <Button type="submit" className="w-full" disabled={loading || !manualId.trim()}>
                  {loading ? (
                    <>
                      <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                      処理中...
                    </>
                  ) : (
                    <>
                      <CheckCircle className="mr-2 h-4 w-4" />
                      チェックイン実行
                    </>
                  )}
                </Button>
              </form>
            )}

            {/* Result Display */}
            {result && (
              <div className={`mt-6 p-4 rounded-xl ${
                result.success 
                  ? "bg-green-50 border-2 border-green-200" 
                  : "bg-red-50 border-2 border-red-200"
              }`}>
                <div className="flex items-start gap-3">
                  {result.success ? (
                    <CheckCircle className="h-6 w-6 text-green-600 flex-shrink-0" />
                  ) : (
                    <XCircle className="h-6 w-6 text-red-600 flex-shrink-0" />
                  )}
                  <div className="flex-1">
                    <p className={`font-bold ${result.success ? "text-green-800" : "text-red-800"}`}>
                      {result.success ? "入場成功！" : "入場失敗"}
                    </p>
                    <p className={`text-sm mt-1 ${result.success ? "text-green-700" : "text-red-700"}`}>
                      {result.message}
                    </p>
                    {result.ticket && (
                      <div className="mt-3 pt-3 border-t border-green-200 space-y-2">
                        <div className="flex items-center gap-2 text-sm text-green-800">
                          <User className="h-4 w-4" />
                          <span>{result.ticket.guest_info?.name || "ゲスト"}</span>
                        </div>
                        <div className="flex items-center gap-2 text-sm text-green-800">
                          <Ticket className="h-4 w-4" />
                          <span>{result.ticket.attribute_detail?.display_name}</span>
                        </div>
                        <div className="flex items-center gap-2 text-sm text-green-800">
                          <Calendar className="h-4 w-4" />
                          <span>
                            {result.ticket.slot_detail?.event_date} {result.ticket.slot_detail?.start_time}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent Check-ins */}
        <Card className="bg-white border-gray-200">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-gray-900">
              <CheckCircle className="h-5 w-5" />
              直近の入場記録
            </CardTitle>
          </CardHeader>
          <CardContent>
            {recentCheckIns.length === 0 ? (
              <div className="text-center py-12 text-gray-400">
                <QrCode className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p>まだ入場記録がありません</p>
              </div>
            ) : (
              <div className="space-y-3">
                {recentCheckIns.map((checkIn, index) => (
                  <div
                    key={index}
                    className={`flex items-center justify-between p-3 rounded-lg ${
                      checkIn.success ? "bg-green-50" : "bg-red-50"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      {checkIn.success ? (
                        <CheckCircle className="h-5 w-5 text-green-600" />
                      ) : (
                        <XCircle className="h-5 w-5 text-red-600" />
                      )}
                      <div>
                        <p className="font-medium text-sm">{checkIn.name}</p>
                        <p className="text-xs text-gray-500">{checkIn.type}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-mono text-xs text-gray-500">{checkIn.id}...</p>
                      <p className="text-xs text-gray-400">{checkIn.time}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

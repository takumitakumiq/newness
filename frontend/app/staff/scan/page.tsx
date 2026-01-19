"use client";

import { useState, useRef, useEffect, useCallback } from "react";
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
  Ticket,
  Volume2,
  VolumeX,
  AlertTriangle
} from "lucide-react";
import { fetchApi, fetchApiRaw } from "@/lib/api";

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

// 二重スキャン防止のキャッシュ（5秒間）
const DUPLICATE_SCAN_THRESHOLD_MS = 5000;
const recentScans = new Map<string, number>();

const QUEUE_STORAGE_KEY = "matsu_checkin_queue";

const loadQueue = (): { ticket_uuid: string; device_id: string; scanned_at: string }[] => {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(QUEUE_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
};

const saveQueue = (queue: { ticket_uuid: string; device_id: string; scanned_at: string }[]) => {
  if (typeof window === "undefined") return;
  localStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(queue));
};

// デバイスID生成・取得（端末識別用）
const getDeviceId = (): string => {
  const storageKey = "matsu_device_id";
  let deviceId = localStorage.getItem(storageKey);
  if (!deviceId) {
    deviceId = `device-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    localStorage.setItem(storageKey, deviceId);
  }
  return deviceId;
};

// 音声ファイルのURL（Web Audio APIで生成するため実際のファイルは不要）
const playBeep = (success: boolean) => {
  try {
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    if (success) {
      // 成功音: 高い音を短く2回
      oscillator.frequency.value = 1000;
      gainNode.gain.value = 0.3;
      oscillator.start();
      setTimeout(() => oscillator.stop(), 100);
    } else {
      // 失敗音: 低い音を長く1回
      oscillator.frequency.value = 300;
      gainNode.gain.value = 0.3;
      oscillator.start();
      setTimeout(() => oscillator.stop(), 300);
    }
  } catch (e) {
    console.warn("Audio playback failed:", e);
  }
};

// バイブレーション
const vibrate = (success: boolean) => {
  if ("vibrate" in navigator) {
    if (success) {
      navigator.vibrate([100, 50, 100]); // 成功: 短く2回
    } else {
      navigator.vibrate([500]); // 失敗: 長く1回
    }
  }
};

export default function ScanPage() {
  const [mode, setMode] = useState<"camera" | "manual">("manual");
  const [manualId, setManualId] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<CheckInResult | null>(null);
  const [recentCheckIns, setRecentCheckIns] = useState<RecentCheckIn[]>([]);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [emergencyStop, setEmergencyStop] = useState(false);
  const [emergencyMessage, setEmergencyMessage] = useState("");
  const [queue, setQueue] = useState(loadQueue());
  const [syncing, setSyncing] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const manualInputRef = useRef<HTMLInputElement>(null);
  const scannerBufferRef = useRef("");
  const scannerTimerRef = useRef<number | null>(null);

  // 緊急停止状態のチェック
  useEffect(() => {
    const checkEmergency = async () => {
      try {
        const data = await fetchApi<{ emergency_stop: boolean; emergency_message?: string }>(
          "/emergency-status",
          { auth: false }
        );
        setEmergencyStop(data.emergency_stop);
        setEmergencyMessage(data.emergency_message || "緊急停止中です");
      } catch (e) {
        console.error("Emergency check failed:", e);
      }
    };
    
    checkEmergency();
    const interval = setInterval(checkEmergency, 10000); // 10秒ごとにチェック
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    saveQueue(queue);
  }, [queue]);

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

  // 二重スキャン防止チェック
  const isDuplicateScan = useCallback((ticketId: string): boolean => {
    const now = Date.now();
    const lastScan = recentScans.get(ticketId);
    
    // 古いエントリを削除
    const keysToDelete: string[] = [];
    recentScans.forEach((timestamp, id) => {
      if (now - timestamp > DUPLICATE_SCAN_THRESHOLD_MS) {
        keysToDelete.push(id);
      }
    });
    keysToDelete.forEach(id => recentScans.delete(id));
    
    if (lastScan && now - lastScan < DUPLICATE_SCAN_THRESHOLD_MS) {
      return true;
    }
    
    recentScans.set(ticketId, now);
    return false;
  }, []);

  // Check-in API call
  const performCheckIn = async (ticketId: string) => {
    // 緊急停止中はチェックイン不可
    if (emergencyStop) {
      setResult({
        success: false,
        message: emergencyMessage || "緊急停止中のためチェックインできません",
      });
      if (soundEnabled) playBeep(false);
      vibrate(false);
      return;
    }
    
    // 二重スキャン防止
    if (isDuplicateScan(ticketId)) {
      setResult({
        success: false,
        message: "このチケットは直前にスキャンされました（5秒以内の再スキャン防止）",
      });
      if (soundEnabled) playBeep(false);
      vibrate(false);
      return;
    }
    
    setLoading(true);
    setResult(null);
    
    try {
      const res = await fetchApiRaw("/checkin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ticket_uuid: ticketId,
          device_id: getDeviceId(),
          operator: "staff",
        }),
        throwOnError: false,
      });

      const data: CheckInResult = await res.json();
      setResult(data);

      // 音とバイブレーション
      if (soundEnabled) playBeep(data.success);
      vibrate(data.success);

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
      const queuedItem = {
        ticket_uuid: ticketId,
        device_id: getDeviceId(),
        scanned_at: new Date().toISOString(),
      };
      setQueue(prev => [...prev, queuedItem]);
      const errorResult = {
        success: false,
        message: "通信エラーが発生しました。ネットワーク接続を確認してください。",
      };
      setResult(errorResult);
      if (soundEnabled) playBeep(false);
      vibrate(false);
    } finally {
      setLoading(false);
    }
  };

  const syncQueue = async () => {
    if (queue.length === 0) return;
    setSyncing(true);
    try {
      const res = await fetchApiRaw("/checkin/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ checkins: queue }),
      });
      if (res.ok) {
        setQueue([]);
      }
    } catch (e) {
      console.error("Batch sync failed", e);
    } finally {
      setSyncing(false);
    }
  };

  // Handle manual input
  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const extracted = extractTicketId(manualId);
    if (extracted) {
      performCheckIn(extracted);
      setManualId("");
    }
  };

  const extractTicketId = (raw: string): string | null => {
    const text = raw.trim();
    if (!text) return null;
    try {
      const url = new URL(text);
      const fromQuery = url.searchParams.get("ticket_uuid") || url.searchParams.get("ticket") || url.searchParams.get("id");
      if (fromQuery) return fromQuery;
      const maybeUuid = url.pathname.split("/").filter(Boolean).pop();
      if (maybeUuid && /^[0-9a-fA-F-]{32,36}$/.test(maybeUuid)) return maybeUuid;
    } catch {
      // not a URL
    }
    return text;
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
      manualInputRef.current?.focus();
    }
  }, [mode]);

  useEffect(() => {
    if (mode !== "manual") return;
    const handleKeydown = (e: KeyboardEvent) => {
      if (e.key === "Enter") {
        const buffer = scannerBufferRef.current.trim();
        if (buffer) {
          const extracted = extractTicketId(buffer);
          if (extracted) performCheckIn(extracted);
          scannerBufferRef.current = "";
          setManualId("");
        }
        return;
      }
      if (e.key.length === 1) {
        scannerBufferRef.current += e.key;
        setManualId(scannerBufferRef.current);
        if (scannerTimerRef.current) window.clearTimeout(scannerTimerRef.current);
        scannerTimerRef.current = window.setTimeout(() => {
          scannerBufferRef.current = "";
        }, 200);
      }
    };
    window.addEventListener("keydown", handleKeydown);
    return () => window.removeEventListener("keydown", handleKeydown);
  }, [mode]);

  return (
    <div className="space-y-6">
      {/* 緊急停止バナー */}
      {emergencyStop && (
        <div className="bg-red-600 text-white p-4 rounded-lg flex items-center gap-3">
          <AlertTriangle className="h-6 w-6 flex-shrink-0" />
          <div>
            <p className="font-bold">緊急停止中</p>
            <p className="text-sm">{emergencyMessage}</p>
          </div>
        </div>
      )}
      
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">入場受付</h1>
          <p className="text-gray-500 mt-1">QRコードをスキャンまたはチケットIDを入力</p>
        </div>
        
        {/* 音声ON/OFFボタン */}
        <Button
          variant="outline"
          size="sm"
          onClick={() => setSoundEnabled(!soundEnabled)}
          className={soundEnabled ? "text-green-600" : "text-gray-400"}
        >
          {soundEnabled ? <Volume2 className="h-5 w-5" /> : <VolumeX className="h-5 w-5" />}
        </Button>
      </div>

      {queue.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 p-3 rounded-lg flex items-center justify-between">
          <div className="text-sm text-amber-800">
            オフラインキュー: {queue.length} 件
          </div>
          <Button size="sm" variant="outline" onClick={syncQueue} disabled={syncing}>
            {syncing ? <RefreshCw className="h-4 w-4 animate-spin mr-2" /> : <RefreshCw className="h-4 w-4 mr-2" />}
            同期
          </Button>
        </div>
      )}

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
                    ref={manualInputRef}
                    placeholder="チケットID（UUID）を入力"
                    value={manualId}
                    onChange={(e) => setManualId(e.target.value)}
                    className="text-lg font-mono bg-gray-50 border-gray-200 text-gray-900 placeholder:text-gray-400"
                    disabled={loading}
                  />
                </div>
                <p className="text-xs text-gray-500">
                  USBバーコードリーダーを接続してQRを読み取ると自動入力されます。
                </p>
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

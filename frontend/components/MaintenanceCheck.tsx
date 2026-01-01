"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

interface EmergencyStatus {
  emergency_stop: boolean;
  emergency_message: string;
  maintenance_mode: boolean;
}

interface MaintenanceCheckProps {
  children: React.ReactNode;
}

export function MaintenanceCheck({ children }: MaintenanceCheckProps) {
  const [status, setStatus] = useState<EmergencyStatus | null>(null);
  const [loading, setLoading] = useState(true);

  const checkStatus = async () => {
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "";
      const res = await fetch(`${apiUrl}/api/emergency-status/`);
      if (res.ok) {
        const data = await res.json();
        setStatus(data);
      }
    } catch (error) {
      console.error("Failed to check emergency status:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    checkStatus();
    // 30秒ごとにステータスを確認
    const interval = setInterval(checkStatus, 30000);
    return () => clearInterval(interval);
  }, []);

  // ローディング中は何も表示しない
  if (loading) {
    return <>{children}</>;
  }

  // 緊急停止またはメンテナンスモード時
  if (status?.emergency_stop || status?.maintenance_mode) {
    return (
      <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
        <div className="max-w-lg mx-4 text-center">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-amber-500/20 mb-6">
            <AlertTriangle className="w-10 h-10 text-amber-400" />
          </div>
          
          <h1 className="text-3xl font-bold text-white mb-4">
            {status?.emergency_stop ? "システム一時停止中" : "メンテナンス中"}
          </h1>
          
          <p className="text-slate-300 text-lg mb-6">
            {status?.emergency_message || 
              (status?.emergency_stop 
                ? "現在、システムは一時的に停止しています。しばらくお待ちください。"
                : "現在、システムメンテナンスを行っています。しばらくお待ちください。"
              )
            }
          </p>

          <div className="bg-slate-800/50 rounded-xl p-6 border border-slate-700">
            <p className="text-slate-400 text-sm mb-4">
              ご不便をおかけして申し訳ございません。<br />
              メンテナンス終了後、自動的にページが更新されます。
            </p>
            
            <button
              onClick={() => window.location.reload()}
              className="inline-flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-white transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
              ページを更新
            </button>
          </div>

          <p className="text-slate-500 text-sm mt-6">
            🎪 洛星文化祭チケットシステム
          </p>
        </div>
      </div>
    );
  }

  // 通常時は子要素を表示
  return <>{children}</>;
}

"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Settings, Save, RefreshCw, Database, Server, Shield, Bell, Clock } from "lucide-react";

export default function SettingsPage() {
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState({
    siteName: "MATSU チケット",
    maxTicketsPerReservation: "5",
    reservationOpenDays: "30",
    checkInBuffer: "30",
    enableNotifications: true,
    maintenanceMode: false,
  });

  const handleSave = async () => {
    setSaving(true);
    // Simulating save
    await new Promise(resolve => setTimeout(resolve, 1000));
    setSaving(false);
    alert("設定を保存しました");
  };

  const sections = [
    {
      title: "基本設定",
      icon: Settings,
      fields: [
        { key: "siteName", label: "サイト名", type: "text" },
        { key: "maxTicketsPerReservation", label: "1予約あたり最大チケット数", type: "number" },
      ],
    },
    {
      title: "予約設定",
      icon: Clock,
      fields: [
        { key: "reservationOpenDays", label: "予約受付開始日数（日前）", type: "number" },
        { key: "checkInBuffer", label: "入場許可時間（分前）", type: "number" },
      ],
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">システム設定</h1>
          <p className="text-sm text-slate-500">各種設定を管理します</p>
        </div>
        <Button onClick={handleSave} disabled={saving}>
          {saving ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
          保存
        </Button>
      </div>

      {/* Settings Sections */}
      <div className="space-y-6">
        {sections.map((section) => {
          const Icon = section.icon;
          return (
            <div key={section.title} className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <div className="flex items-center gap-3 p-4 border-b border-slate-100 bg-slate-50">
                <div className="w-8 h-8 bg-slate-900 rounded-lg flex items-center justify-center">
                  <Icon className="h-4 w-4 text-white" />
                </div>
                <h2 className="font-semibold text-slate-900">{section.title}</h2>
              </div>
              <div className="p-4 space-y-4">
                {section.fields.map((field) => (
                  <div key={field.key} className="grid sm:grid-cols-3 gap-2 items-center">
                    <label className="text-sm font-medium text-slate-700">{field.label}</label>
                    <div className="sm:col-span-2">
                      <Input
                        type={field.type}
                        value={settings[field.key as keyof typeof settings] as string}
                        onChange={(e) => setSettings(s => ({ ...s, [field.key]: e.target.value }))}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}

        {/* Toggle Settings */}
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="flex items-center gap-3 p-4 border-b border-slate-100 bg-slate-50">
            <div className="w-8 h-8 bg-slate-900 rounded-lg flex items-center justify-center">
              <Shield className="h-4 w-4 text-white" />
            </div>
            <h2 className="font-semibold text-slate-900">システム</h2>
          </div>
          <div className="p-4 space-y-4">
            <div className="flex items-center justify-between py-2">
              <div>
                <p className="text-sm font-medium text-slate-900">通知を有効にする</p>
                <p className="text-xs text-slate-500">予約時にメール通知を送信</p>
              </div>
              <button
                onClick={() => setSettings(s => ({ ...s, enableNotifications: !s.enableNotifications }))}
                className={`relative w-11 h-6 rounded-full transition-colors ${settings.enableNotifications ? "bg-emerald-500" : "bg-slate-300"}`}
              >
                <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform shadow ${settings.enableNotifications ? "translate-x-5" : ""}`}></span>
              </button>
            </div>
            <div className="flex items-center justify-between py-2">
              <div>
                <p className="text-sm font-medium text-slate-900">メンテナンスモード</p>
                <p className="text-xs text-slate-500">有効にすると一般ユーザーはアクセス不可</p>
              </div>
              <button
                onClick={() => setSettings(s => ({ ...s, maintenanceMode: !s.maintenanceMode }))}
                className={`relative w-11 h-6 rounded-full transition-colors ${settings.maintenanceMode ? "bg-rose-500" : "bg-slate-300"}`}
              >
                <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform shadow ${settings.maintenanceMode ? "translate-x-5" : ""}`}></span>
              </button>
            </div>
          </div>
        </div>

        {/* Info Cards */}
        <div className="grid sm:grid-cols-2 gap-4">
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center">
                <Server className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="font-semibold text-slate-900">API Status</p>
                <p className="text-xs text-slate-500">バックエンド接続状況</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></div>
              <span className="text-sm text-emerald-600 font-medium">接続中</span>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 bg-violet-50 rounded-xl flex items-center justify-center">
                <Database className="h-5 w-5 text-violet-600" />
              </div>
              <div>
                <p className="font-semibold text-slate-900">Database</p>
                <p className="text-xs text-slate-500">データベース状況</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></div>
              <span className="text-sm text-emerald-600 font-medium">正常</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

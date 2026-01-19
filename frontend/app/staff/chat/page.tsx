"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { 
  Send, 
  MessageSquare, 
  Users, 
  RefreshCw,
  User,
  Wifi,
  WifiOff
} from "lucide-react";
import { useAuthStore } from "@/store/useAuthStore";
import { useStaffChat, type ChatMessage } from "./useStaffChat";

export default function ChatPage() {
  const { user } = useAuthStore();
  const [newMessage, setNewMessage] = useState("");
  const {
    messages,
    loading,
    sending,
    connectionStatus,
    fetchMessages,
    sendMessage,
    reconnect,
  } = useStaffChat();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const isUserNearBottomRef = useRef(true);

  const scrollToBottom = (force = false) => {
    // force=true の場合、または ユーザーが下部付近にいる場合のみスクロール
    if (force || isUserNearBottomRef.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  };

  // スクロール位置を監視して、ユーザーが下部付近にいるか判定
  const handleScroll = useCallback(() => {
    const container = messagesContainerRef.current;
    if (!container) return;
    
    const { scrollTop, scrollHeight, clientHeight } = container;
    // 下から100px以内なら「下部にいる」とみなす
    isUserNearBottomRef.current = scrollHeight - scrollTop - clientHeight < 100;
  }, []);

  const handleSendMessage = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      const sent = await sendMessage(newMessage);
      if (sent) {
        setNewMessage("");
      }
    },
    [newMessage, sendMessage]
  );

  // 初回ロード完了時に一番下へスクロール
  const initialScrollDone = useRef(false);
  useEffect(() => {
    if (!loading && messages.length > 0 && !initialScrollDone.current) {
      scrollToBottom(true);
      initialScrollDone.current = true;
    }
  }, [loading, messages.length]);

  // 新しいメッセージが来た時、ユーザーが下部にいる場合のみスクロール
  const prevMessagesLengthRef = useRef(0);
  useEffect(() => {
    if (messages.length > prevMessagesLengthRef.current && initialScrollDone.current) {
      scrollToBottom(); // isUserNearBottomRef に基づいてスクロールするかを判定
    }
    prevMessagesLengthRef.current = messages.length;
  }, [messages.length]);

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" });
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("ja-JP", { month: "short", day: "numeric" });
  };

  // Group messages by date
  const groupedMessages = useMemo(() => {
    return messages.reduce((groups, message) => {
      const date = formatDate(message.created_at);
      if (!groups[date]) {
        groups[date] = [];
      }
      groups[date].push(message);
      return groups;
    }, {} as Record<string, ChatMessage[]>);
  }, [messages]);

  const getStatusColor = () => {
    switch (connectionStatus) {
      case "connected": return "text-green-500";
      case "connecting": return "text-yellow-500";
      case "disconnected": return "text-gray-400";
      case "error": return "text-red-500";
    }
  };

  const getStatusIcon = () => {
    if (connectionStatus === "connected") {
      return <Wifi className="h-4 w-4" />;
    }
    return <WifiOff className="h-4 w-4" />;
  };

  return (
    <div className="h-[calc(100vh-12rem)] flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">スタッフチャット</h1>
          <p className="text-gray-500 text-sm flex items-center gap-2">
            <span className={getStatusColor()}>{getStatusIcon()}</span>
            {connectionStatus === "connected" ? "リアルタイム接続中" : 
             connectionStatus === "connecting" ? "接続中..." :
             connectionStatus === "error" ? "接続エラー" : "切断されました"}
          </p>
        </div>
        <Button 
          variant="outline" 
          size="sm" 
          onClick={() => {
            if (connectionStatus !== "connected") {
              reconnect();
            } else {
              fetchMessages();
            }
          }}
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${connectionStatus === "connecting" ? "animate-spin" : ""}`} />
          {connectionStatus === "connected" ? "更新" : "再接続"}
        </Button>
      </div>

      <Card className="flex-1 flex flex-col overflow-hidden bg-white border-gray-200">
        <CardHeader className="py-3 border-b border-gray-200 bg-white">
          <CardTitle className="text-base flex items-center gap-2 text-gray-900">
            <Users className="h-4 w-4" />
            スタッフルーム
            <span className="ml-auto text-sm font-normal text-gray-500">
              {messages.length} メッセージ
            </span>
          </CardTitle>
        </CardHeader>
        
        <CardContent 
          ref={messagesContainerRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50"
        >
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <RefreshCw className="h-8 w-8 animate-spin text-gray-400" />
            </div>
          ) : messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-gray-400">
              <MessageSquare className="h-16 w-16 mb-4 opacity-50" />
              <p>まだメッセージがありません</p>
              <p className="text-sm">最初のメッセージを送信しましょう</p>
            </div>
          ) : (
            Object.entries(groupedMessages).map(([date, msgs]) => (
              <div key={date}>
                <div className="flex items-center gap-4 my-4">
                  <div className="flex-1 h-px bg-gray-200" />
                  <span className="text-xs text-gray-500 font-medium">{date}</span>
                  <div className="flex-1 h-px bg-gray-200" />
                </div>
                {msgs.map((message) => {
                  const isOwnMessage = message.user_id === user?.id;
                  return (
                    <div
                      key={message.id}
                      className={`flex gap-3 mb-4 ${isOwnMessage ? "flex-row-reverse" : ""}`}
                    >
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                        isOwnMessage ? "bg-indigo-100 text-indigo-600" : message.is_staff ? "bg-amber-100 text-amber-600" : "bg-gray-100 text-gray-600"
                      }`}>
                        <User className="h-4 w-4" />
                      </div>
                      <div className={`max-w-[70%] ${isOwnMessage ? "items-end" : "items-start"}`}>
                        <div className={`flex items-baseline gap-2 mb-1 ${isOwnMessage ? "flex-row-reverse" : ""}`}>
                          <span className="text-sm font-medium text-gray-900">
                            {message.username}
                            {message.is_staff && <span className="ml-1 text-xs text-amber-600">●</span>}
                          </span>
                          <span className="text-xs text-gray-400">
                            {formatTime(message.created_at)}
                          </span>
                        </div>
                        <div className={`rounded-2xl px-4 py-2 ${
                          isOwnMessage 
                            ? "bg-indigo-600 text-white rounded-tr-sm" 
                            : "bg-gray-100 text-gray-900 rounded-tl-sm"
                        }`}>
                          <p className="text-sm whitespace-pre-wrap break-words">
                            {message.content}
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ))
          )}
          <div ref={messagesEndRef} />
        </CardContent>

        <div className="p-4 border-t bg-white">
          <form onSubmit={handleSendMessage} className="flex gap-2">
            <Input
              placeholder="メッセージを入力..."
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              disabled={sending}
              className="flex-1 bg-gray-50 border-gray-200 text-gray-900 placeholder:text-gray-400"
            />
            <Button type="submit" disabled={sending || !newMessage.trim()}>
              {sending ? (
                <RefreshCw className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </form>
        </div>
      </Card>
    </div>
  );
}

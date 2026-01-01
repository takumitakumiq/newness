"use client";

import { useState, useEffect, useRef, useCallback } from "react";
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

interface ChatMessage {
  id: string | number;
  user_id: number;
  username: string;
  content: string;
  created_at: string;
  is_staff: boolean;
}

type ConnectionStatus = "connecting" | "connected" | "disconnected" | "error";

export default function ChatPage() {
  const { user } = useAuthStore();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("connecting");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttempts = useRef(0);
  const reconnectEnabledRef = useRef(true);
  const manualCloseRef = useRef(false);
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

  // WebSocket connection
  const connectWebSocket = useCallback(() => {
    // 既存接続があれば閉じる（重複接続防止）
    if (wsRef.current) {
      manualCloseRef.current = true;
      try {
        wsRef.current.close();
      } catch {
        // ignore
      }
      wsRef.current = null;
    }

    const token = localStorage.getItem("access_token");
    if (!token) {
      setConnectionStatus("error");
      setLoading(false);
      return;
    }

    // Build WebSocket URL
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "";
    if (!apiUrl) {
      console.error("NEXT_PUBLIC_API_URL is not set");
      setConnectionStatus("error");
      setLoading(false);
      return;
    }
    const wsProtocol = apiUrl.startsWith("https") ? "wss" : "ws";
    const wsHost = apiUrl.replace(/^https?:\/\//, "").replace(/\/+$/, "");
    if (!wsHost) {
      console.error("Invalid NEXT_PUBLIC_API_URL:", apiUrl);
      setConnectionStatus("error");
      setLoading(false);
      return;
    }
    const wsUrl = `${wsProtocol}://${wsHost}/ws/chat/?token=${token}`;

    setConnectionStatus("connecting");

    let ws: WebSocket;
    try {
      manualCloseRef.current = false;
      ws = new WebSocket(wsUrl);
    } catch (e) {
      console.error("Failed to create WebSocket:", e);
      setConnectionStatus("error");
      setLoading(false);
      return;
    }
    wsRef.current = ws;

    ws.onopen = () => {
      setConnectionStatus("connected");
      reconnectAttempts.current = 0;
      console.log("WebSocket connected");
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        
        if (data.type === "history") {
          // Initial history load
          setMessages(data.messages || []);
          setLoading(false);
        } else if (data.type === "message") {
          // New message received
          setMessages((prev) => [...prev, data]);
        } else if (data.type === "error") {
          console.error("Chat error:", data.message);
        }
      } catch (e) {
        console.error("Failed to parse WebSocket message:", e);
      }
    };

    ws.onclose = (event) => {
      setConnectionStatus("disconnected");
      console.log("WebSocket disconnected:", event.code);

      // 意図的に閉じた場合（画面遷移/StrictModeのクリーンアップ等）は再接続しない
      if (!reconnectEnabledRef.current || manualCloseRef.current) {
        return;
      }
      
      // Auto-reconnect with exponential backoff
      if (event.code !== 4001) { // 4001 = unauthorized, don't retry
        const delay = Math.min(1000 * Math.pow(2, reconnectAttempts.current), 30000);
        reconnectAttempts.current++;
        
        reconnectTimeoutRef.current = setTimeout(() => {
          console.log(`Reconnecting... (attempt ${reconnectAttempts.current})`);
          connectWebSocket();
        }, delay);
      }
    };

    ws.onerror = () => {
      setConnectionStatus("error");
      setLoading(false);
    };
  }, []);

  // Disconnect WebSocket
  const disconnectWebSocket = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }
    if (wsRef.current) {
      manualCloseRef.current = true;
      wsRef.current.close();
      wsRef.current = null;
    }
  }, []);

  // Send message via WebSocket
  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || sending) return;

    if (wsRef.current?.readyState === WebSocket.OPEN) {
      setSending(true);
      wsRef.current.send(JSON.stringify({
        type: "message",
        content: newMessage.trim()
      }));
      setNewMessage("");
      setSending(false);
    } else {
      // Fallback to REST API if WebSocket is not connected
      setSending(true);
      try {
        const token = localStorage.getItem("access_token");
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || "";
        const res = await fetch(`${apiUrl}/api/chat/messages/`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ content: newMessage.trim() }),
        });

        if (res.ok) {
          setNewMessage("");
          // Message will come via WebSocket, or fetch if disconnected
        }
      } catch (error) {
        console.error("Failed to send message:", error);
      } finally {
        setSending(false);
      }
    }
  };

  // Fetch messages via REST (fallback)
  const fetchMessages = async () => {
    try {
      const token = localStorage.getItem("access_token");
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "";
      const res = await fetch(`${apiUrl}/api/chat/messages/`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setMessages(Array.isArray(data) ? data : []);
      }
    } catch (error) {
      console.error("Failed to fetch messages:", error);
    } finally {
      setLoading(false);
    }
  };

  // Connect on mount
  useEffect(() => {
    reconnectEnabledRef.current = true;
    connectWebSocket();
    
    return () => {
      reconnectEnabledRef.current = false;
      disconnectWebSocket();
    };
  }, [connectWebSocket, disconnectWebSocket]);

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
  const groupedMessages = messages.reduce((groups, message) => {
    const date = formatDate(message.created_at);
    if (!groups[date]) {
      groups[date] = [];
    }
    groups[date].push(message);
    return groups;
  }, {} as Record<string, ChatMessage[]>);

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
              disconnectWebSocket();
              connectWebSocket();
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
          <form onSubmit={sendMessage} className="flex gap-2">
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

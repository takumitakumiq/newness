"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { fetchApi } from "@/lib/api";

export interface ChatMessage {
  id: string | number;
  user_id: number;
  username: string;
  content: string;
  created_at: string;
  is_staff: boolean;
}

export type ConnectionStatus = "connecting" | "connected" | "disconnected" | "error";

const buildWebSocketUrl = (apiUrl: string, token: string) => {
  if (!apiUrl || !token) return null;
  const wsProtocol = apiUrl.startsWith("https") ? "wss" : "ws";
  const wsHost = apiUrl.replace(/^https?:\/\//, "").replace(/\/+$/, "");
  if (!wsHost) return null;
  return `${wsProtocol}://${wsHost}/ws/chat/?token=${token}`;
};

const toChatMessage = (data: any): ChatMessage => ({
  id: data?.id,
  user_id: data?.user_id,
  username: data?.username,
  content: data?.content,
  created_at: data?.created_at,
  is_staff: Boolean(data?.is_staff),
});

export const useStaffChat = () => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("connecting");
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttempts = useRef(0);
  const reconnectEnabledRef = useRef(true);
  const manualCloseRef = useRef(false);

  const connectWebSocket = useCallback(() => {
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

    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "";
    const wsUrl = buildWebSocketUrl(apiUrl, token);
    if (!wsUrl) {
      console.error("Invalid NEXT_PUBLIC_API_URL:", apiUrl);
      setConnectionStatus("error");
      setLoading(false);
      return;
    }

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
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        if (data.type === "history") {
          setMessages((data.messages || []).map(toChatMessage));
          setLoading(false);
        } else if (data.type === "message") {
          setMessages((prev) => [...prev, toChatMessage(data)]);
        } else if (data.type === "error") {
          console.error("Chat error:", data.message);
        }
      } catch (e) {
        console.error("Failed to parse WebSocket message:", e);
      }
    };

    ws.onclose = (event) => {
      setConnectionStatus("disconnected");

      if (!reconnectEnabledRef.current || manualCloseRef.current) {
        return;
      }

      if (event.code !== 4001) {
        const delay = Math.min(1000 * Math.pow(2, reconnectAttempts.current), 30000);
        reconnectAttempts.current += 1;

        reconnectTimeoutRef.current = setTimeout(() => {
          connectWebSocket();
        }, delay);
      }
    };

    ws.onerror = () => {
      setConnectionStatus("error");
      setLoading(false);
    };
  }, []);

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

  const fetchMessages = useCallback(async () => {
    try {
      const data = await fetchApi<ChatMessage[] | unknown>("/chat/messages");
      setMessages(Array.isArray(data) ? data.map(toChatMessage) : []);
    } catch (error) {
      console.error("Failed to fetch messages:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  const sendMessage = useCallback(
    async (content: string) => {
      const trimmed = content.trim();
      if (!trimmed || sending) return false;

      if (wsRef.current?.readyState === WebSocket.OPEN) {
        setSending(true);
        wsRef.current.send(
          JSON.stringify({
            type: "message",
            content: trimmed,
          })
        );
        setSending(false);
        return true;
      }

      setSending(true);
      try {
        await fetchApi("/chat/messages", {
          method: "POST",
          body: JSON.stringify({ content: trimmed }),
        });
        return true;
      } catch (error) {
        console.error("Failed to send message:", error);
        return false;
      } finally {
        setSending(false);
      }
    },
    [sending]
  );

  const reconnect = useCallback(() => {
    disconnectWebSocket();
    connectWebSocket();
  }, [connectWebSocket, disconnectWebSocket]);

  useEffect(() => {
    reconnectEnabledRef.current = true;
    connectWebSocket();

    return () => {
      reconnectEnabledRef.current = false;
      disconnectWebSocket();
    };
  }, [connectWebSocket, disconnectWebSocket]);

  return {
    messages,
    loading,
    sending,
    connectionStatus,
    fetchMessages,
    sendMessage,
    reconnect,
  };
};

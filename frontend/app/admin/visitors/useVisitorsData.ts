"use client";

import { useEffect, useMemo, useState } from "react";
import { fetchApi } from "@/lib/api";

export interface Reservation {
  id: string;
  guest_identifier: string;
  user_name: string;
  user_email: string;
  total_tickets: number;
  created_at: string;
  tickets?: Ticket[];
}

export interface Ticket {
  id: string;
  status: string;
  status_display: string;
  guest_info: Record<string, any>;
  slot_detail: { event_date: string; start_time: string };
  attribute_detail: { display_name: string };
  entered_at: string | null;
}

export type ViewMode = "reservations" | "tickets";
export type TicketStatusFilter = "all" | "valid" | "entered" | "cancelled";

export const useVisitorsData = () => {
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [view, setView] = useState<ViewMode>("reservations");
  const [statusFilter, setStatusFilter] = useState<TicketStatusFilter>("all");
  const [dateFilter, setDateFilter] = useState<string>("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Reservation | null>(null);
  const [editingRes, setEditingRes] = useState<Reservation | null>(null);
  const [editingTicket, setEditingTicket] = useState<Ticket | null>(null);
  const [viewingTicket, setViewingTicket] = useState<Ticket | null>(null);
  const [editForm, setEditForm] = useState({ user_name: "", user_email: "" });
  const [ticketForm, setTicketForm] = useState<{ status: string; guest_info: Record<string, any> }>({ status: "", guest_info: {} });

  const pageSize = 15;
  const fetchReservations = async () => {
    setLoading(true);
    try {
      const data = await fetchApi<{ results: Reservation[] } | Reservation[]>("/reservations");
      setReservations(Array.isArray(data) ? data : data.results || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const fetchTickets = async () => {
    setLoading(true);
    try {
      const data = await fetchApi<{ results: Ticket[] } | Ticket[]>("/tickets");
      setTickets(Array.isArray(data) ? data : data.results || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const fetchDetail = async (id: string) => {
    const data = await fetchApi<Reservation>(`/reservations/${id}`);
    setSelected(data);
  };

  const updateReservation = async () => {
    if (!editingRes) return;
    try {
      await fetchApi(`/reservations/${editingRes.id}`, {
        method: "PATCH",
        body: JSON.stringify(editForm),
      });
      fetchReservations();
      setEditingRes(null);
    } catch (e) {
      console.error(e);
      alert("エラーが発生しました");
    }
  };

  const deleteReservation = async (id: string) => {
    if (!confirm("この予約を削除しますか？関連するチケットも削除されます。")) return;
    try {
      await fetchApi(`/reservations/${id}`, { method: "DELETE" });
      fetchReservations();
      setSelected(null);
    } catch (e) {
      console.error(e);
      alert("エラーが発生しました");
    }
  };

  const updateTicket = async () => {
    if (!editingTicket) return;
    try {
      const body: Record<string, any> = {
        status: ticketForm.status,
        guest_info: ticketForm.guest_info,
      };
      await fetchApi(`/tickets/${editingTicket.id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      fetchTickets();
      setEditingTicket(null);
    } catch (e) {
      console.error(e);
      alert("エラーが発生しました");
    }
  };

  const cancelTicket = async (id: string) => {
    if (!confirm("このチケットをキャンセルしますか？")) return;
    try {
      await fetchApi(`/tickets/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: "cancelled" }),
      });
      fetchTickets();
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    if (view === "reservations") fetchReservations();
    else fetchTickets();
  }, [view]);

  const filteredRes = useMemo(() => {
    const s = search.toLowerCase();
    return reservations
      .filter(r =>
        r.user_name?.toLowerCase().includes(s) ||
        r.user_email?.toLowerCase().includes(s) ||
        r.guest_identifier?.toLowerCase().includes(s)
      )
      .filter(r => !dateFilter || r.created_at?.slice(0, 10) === dateFilter);
  }, [reservations, search, dateFilter]);

  const filteredTix = useMemo(() => {
    const s = search.toLowerCase();
    return tickets.filter(t => {
      const matchSearch = t.id?.toLowerCase().includes(s) ||
        t.guest_info?.name?.toLowerCase().includes(s) ||
        t.guest_info?.guest_name?.toLowerCase().includes(s) ||
        t.guest_info?.student_id?.toLowerCase().includes(s) ||
        t.attribute_detail?.display_name?.toLowerCase().includes(s);
      const matchStatus = statusFilter === "all" || t.status === statusFilter;
      const matchDate = !dateFilter || t.slot_detail?.event_date === dateFilter;
      return matchSearch && matchStatus && matchDate;
    });
  }, [tickets, search, statusFilter, dateFilter]);

  const data = view === "reservations" ? filteredRes : filteredTix;
  const paged = data.slice((page - 1) * pageSize, page * pageSize);
  const totalPages = Math.ceil(data.length / pageSize);
  const ticketCounts = useMemo(() => ({
    all: tickets.length,
    valid: tickets.filter(t => t.status === "valid").length,
    entered: tickets.filter(t => t.status === "entered").length,
    cancelled: tickets.filter(t => t.status === "cancelled").length,
  }), [tickets]);

  const getGuestDisplayText = (info?: Record<string, any>): string => {
    if (!info) return "-";
    const name = info.name || info.guest_name;
    if (name) return name;
    if (info.student_id) return `学籍: ${info.student_id}`;
    if (info.graduation_year) return `卒業: ${info.graduation_year}`;
    const firstValue = Object.values(info)[0];
    return firstValue ? String(firstValue) : "-";
  };

  const exportCSV = () => {
    const rows = view === "reservations"
      ? [["ID", "氏名", "メール", "枚数", "日時"], ...filteredRes.map(r => [r.id, r.user_name, r.user_email, r.total_tickets, r.created_at])]
      : [["ID", "日付", "時間", "種別", "名前", "ステータス"], ...filteredTix.map(t => [t.id, t.slot_detail?.event_date, t.slot_detail?.start_time, t.attribute_detail?.display_name, getGuestDisplayText(t.guest_info), t.status_display])];
    const csv = rows.map(r => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${view}.csv`;
    a.click();
  };

  return {
    pageSize,
    reservations,
    tickets,
    loading,
    search,
    view,
    statusFilter,
    dateFilter,
    page,
    selected,
    editingRes,
    editingTicket,
    viewingTicket,
    editForm,
    ticketForm,
    data,
    paged,
    totalPages,
    ticketCounts,
    setSearch,
    setView,
    setStatusFilter,
    setDateFilter,
    setPage,
    setSelected,
    setEditingRes,
    setEditingTicket,
    setViewingTicket,
    setEditForm,
    setTicketForm,
    fetchReservations,
    fetchTickets,
    fetchDetail,
    updateReservation,
    deleteReservation,
    updateTicket,
    cancelTicket,
    exportCSV,
    getGuestDisplayText,
  };
};

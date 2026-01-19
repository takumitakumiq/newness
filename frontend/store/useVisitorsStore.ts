import { create } from "zustand";
import type { Reservation, Ticket, ViewMode, TicketStatusFilter } from "@/app/admin/visitors/types";

interface VisitorsState {
  search: string;
  view: ViewMode;
  statusFilter: TicketStatusFilter;
  dateFilter: string;
  page: number;
  selected: Reservation | null;
  editingRes: Reservation | null;
  editingTicket: Ticket | null;
  viewingTicket: Ticket | null;
  editForm: { user_name: string; user_email: string };
  ticketForm: { status: string; guest_info: Record<string, any> };

  setSearch: (value: string) => void;
  setView: (value: ViewMode) => void;
  setStatusFilter: (value: TicketStatusFilter) => void;
  setDateFilter: (value: string) => void;
  setPage: (value: number) => void;
  setSelected: (value: Reservation | null) => void;
  setEditingRes: (value: Reservation | null) => void;
  setEditingTicket: (value: Ticket | null) => void;
  setViewingTicket: (value: Ticket | null) => void;
  setEditForm: (value: { user_name: string; user_email: string }) => void;
  setTicketForm: (value: { status: string; guest_info: Record<string, any> }) => void;
  updateEditForm: (updater: (prev: { user_name: string; user_email: string }) => { user_name: string; user_email: string }) => void;
  updateTicketForm: (updater: (prev: { status: string; guest_info: Record<string, any> }) => { status: string; guest_info: Record<string, any> }) => void;

  openEditRes: (value: Reservation) => void;
  openEditTicket: (value: Ticket) => void;
  openViewTicket: (value: Ticket) => void;
}

export const useVisitorsStore = create<VisitorsState>((set) => ({
  search: "",
  view: "reservations",
  statusFilter: "all",
  dateFilter: "",
  page: 1,
  selected: null,
  editingRes: null,
  editingTicket: null,
  viewingTicket: null,
  editForm: { user_name: "", user_email: "" },
  ticketForm: { status: "", guest_info: {} },

  setSearch: (value) => set({ search: value, page: 1 }),
  setView: (value) => set({ view: value, page: 1 }),
  setStatusFilter: (value) => set({ statusFilter: value, page: 1 }),
  setDateFilter: (value) => set({ dateFilter: value, page: 1 }),
  setPage: (value) => set({ page: value }),
  setSelected: (value) => set({ selected: value }),
  setEditingRes: (value) => set({ editingRes: value }),
  setEditingTicket: (value) => set({ editingTicket: value }),
  setViewingTicket: (value) => set({ viewingTicket: value }),
  setEditForm: (value) => set({ editForm: value }),
  setTicketForm: (value) => set({ ticketForm: value }),
  updateEditForm: (updater) => set((state) => ({ editForm: updater(state.editForm) })),
  updateTicketForm: (updater) => set((state) => ({ ticketForm: updater(state.ticketForm) })),

  openEditRes: (value) => set({
    editingRes: value,
    editForm: { user_name: value.user_name || "", user_email: value.user_email || "" },
  }),
  openEditTicket: (value) => set({
    editingTicket: value,
    ticketForm: { status: value.status, guest_info: { name: "", ...value.guest_info } },
  }),
  openViewTicket: (value) => set({ viewingTicket: value }),
}));

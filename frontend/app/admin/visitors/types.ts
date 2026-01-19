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

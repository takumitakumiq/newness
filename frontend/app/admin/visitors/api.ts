import type { Reservation, Ticket } from "./types";
import { fetchApi } from "@/lib/api";

export const fetchReservations = async (): Promise<Reservation[]> => {
  const data = await fetchApi<{ results: Reservation[] } | Reservation[]>(
    "/reservations"
  );
  return Array.isArray(data) ? data : data.results || [];
};

export const fetchTickets = async (): Promise<Ticket[]> => {
  const data = await fetchApi<{ results: Ticket[] } | Ticket[]>("/tickets");
  return Array.isArray(data) ? data : data.results || [];
};

export const fetchReservationDetail = async (id: string): Promise<Reservation> => {
  return fetchApi<Reservation>(`/reservations/${id}`);
};

export const updateReservation = async (payload: { id: string; data: { user_name: string; user_email: string } }) => {
  return fetchApi<Reservation>(`/reservations/${payload.id}`, {
    method: "PATCH",
    body: JSON.stringify(payload.data),
  });
};

export const deleteReservation = async (id: string) => {
  await fetchApi(`/reservations/${id}`, { method: "DELETE" });
};

export const updateTicket = async (payload: { id: string; data: { status?: string; guest_info?: Record<string, any> } }) => {
  return fetchApi<Ticket>(`/tickets/${payload.id}`, {
    method: "PATCH",
    body: JSON.stringify(payload.data),
  });
};

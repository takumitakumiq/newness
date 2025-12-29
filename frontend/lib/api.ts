/**
 * MATSU - API Client
 */
import type {
  EntrySlot,
  AttributeConfig,
  Reservation,
  ReservationListItem,
  Ticket,
  CheckoutRequest,
  CheckoutResponse,
  CheckInRequest,
  CheckInResponse,
  ApiError,
  User,
  LoginRequest,
  LoginResponse,
  RegisterRequest,
} from "./types";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "";

/**
 * Get stored auth token
 */
function getAuthToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('access_token');
}

/**
 * Generic fetch wrapper with error handling
 */
async function fetchApi<T>(
  endpoint: string,
  options?: RequestInit & { auth?: boolean }
): Promise<T> {
  const url = `${API_BASE}/api${endpoint}`;
  
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...options?.headers as Record<string, string>,
  };
  
  // Add auth header if requested
  if (options?.auth !== false) {
    const token = getAuthToken();
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }
  }
  
  const response = await fetch(url, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const error: ApiError = await response.json().catch(() => ({
      message: `HTTP Error: ${response.status}`,
    }));
    throw error;
  }

  return response.json();
}

// === Entry Slots ===

export async function getSlots(date?: string): Promise<EntrySlot[]> {
  const params = date ? `?event_date=${date}` : "";
  const data = await fetchApi<{ results: EntrySlot[] } | EntrySlot[]>(
    `/slots${params}`
  );
  return Array.isArray(data) ? data : data.results;
}

export async function getSlot(id: string): Promise<EntrySlot> {
  return fetchApi<EntrySlot>(`/slots/${id}`);
}

// === Attribute Configs ===

export async function getAttributes(): Promise<AttributeConfig[]> {
  const data = await fetchApi<{ results: AttributeConfig[] } | AttributeConfig[]>(
    `/attributes`
  );
  return Array.isArray(data) ? data : data.results;
}

export async function getAttribute(id: string): Promise<AttributeConfig> {
  return fetchApi<AttributeConfig>(`/attributes/${id}`);
}

// === Reservations ===

export async function getReservations(
  userId?: string
): Promise<ReservationListItem[]> {
  const params = userId ? `?user_id=${encodeURIComponent(userId)}` : "";
  const data = await fetchApi<
    { results: ReservationListItem[] } | ReservationListItem[]
  >(`/reservations${params}`);
  return Array.isArray(data) ? data : data.results;
}

export async function getReservation(id: string): Promise<Reservation> {
  return fetchApi<Reservation>(`/reservations/${id}`);
}

// === Tickets ===

export async function getTicketsByUser(userId: string): Promise<Ticket[]> {
  return fetchApi<Ticket[]>(
    `/tickets/by_user?user_id=${encodeURIComponent(userId)}`
  );
}

export async function getTicket(id: string): Promise<Ticket> {
  return fetchApi<Ticket>(`/tickets/${id}`);
}

// === Checkout ===

export async function checkout(
  request: CheckoutRequest
): Promise<CheckoutResponse> {
  return fetchApi<CheckoutResponse>(`/checkout`, {
    method: "POST",
    body: JSON.stringify(request),
  });
}

// === Check-in ===

export async function checkIn(request: CheckInRequest): Promise<CheckInResponse> {
  return fetchApi<CheckInResponse>(`/checkin`, {
    method: "POST",
    body: JSON.stringify(request),
  });
}

// === Health Check ===

export async function healthCheck(): Promise<{ status: string; service: string }> {
  return fetchApi<{ status: string; service: string }>(`/health`, { auth: false });
}

// === Authentication ===

export async function login(data: LoginRequest): Promise<LoginResponse> {
  const response = await fetchApi<LoginResponse>(`/auth/login`, {
    method: "POST",
    body: JSON.stringify(data),
    auth: false,
  });
  
  // Store tokens
  if (typeof window !== 'undefined') {
    localStorage.setItem('access_token', response.access);
    localStorage.setItem('refresh_token', response.refresh);
  }
  
  return response;
}

export async function register(data: RegisterRequest): Promise<User> {
  return fetchApi<User>(`/auth/register`, {
    method: "POST",
    body: JSON.stringify(data),
    auth: false,
  });
}

export async function logout(): Promise<void> {
  const refresh = typeof window !== 'undefined' ? localStorage.getItem('refresh_token') : null;
  
  if (refresh) {
    try {
      await fetchApi(`/auth/logout`, {
        method: "POST",
        body: JSON.stringify({ refresh }),
      });
    } catch {
      // Ignore errors on logout
    }
  }
  
  if (typeof window !== 'undefined') {
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
  }
}

export async function refreshToken(): Promise<LoginResponse | null> {
  const refresh = typeof window !== 'undefined' ? localStorage.getItem('refresh_token') : null;
  
  if (!refresh) return null;
  
  try {
    const response = await fetchApi<LoginResponse>(`/auth/refresh`, {
      method: "POST",
      body: JSON.stringify({ refresh }),
      auth: false,
    });
    
    if (typeof window !== 'undefined') {
      localStorage.setItem('access_token', response.access);
      if (response.refresh) {
        localStorage.setItem('refresh_token', response.refresh);
      }
    }
    
    return response;
  } catch {
    // Token invalid, clear storage
    if (typeof window !== 'undefined') {
      localStorage.removeItem('access_token');
      localStorage.removeItem('refresh_token');
    }
    return null;
  }
}

export async function getCurrentUser(): Promise<User | null> {
  const token = getAuthToken();
  if (!token) return null;
  
  try {
    return await fetchApi<User>(`/auth/me`);
  } catch {
    return null;
  }
}

export async function updateProfile(data: Partial<User>): Promise<User> {
  return fetchApi<User>(`/auth/me`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

// === Mypage ===

export async function getMyReservations(): Promise<Reservation[]> {
  const data = await fetchApi<{ results: Reservation[] } | Reservation[]>(
    `/mypage/reservations`
  );
  return Array.isArray(data) ? data : data.results;
}

export async function getMyTickets(): Promise<Ticket[]> {
  const data = await fetchApi<{ results: Ticket[] } | Ticket[]>(
    `/mypage/tickets`
  );
  return Array.isArray(data) ? data : data.results;
}

export async function cancelTicket(ticketId: string): Promise<{ status: string; message: string }> {
  return fetchApi<{ status: string; message: string }>(`/tickets/${ticketId}/cancel`, {
    method: "POST",
  });
}

export async function updateTicketInfo(ticketId: string, guestInfo: Record<string, any>): Promise<Ticket> {
  return fetchApi<Ticket>(`/tickets/${ticketId}/update_info`, {
    method: "PATCH",
    body: JSON.stringify({ guest_info: guestInfo }),
  });
}

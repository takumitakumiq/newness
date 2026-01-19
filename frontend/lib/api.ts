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
export async function fetchApi<T>(
  endpoint: string,
  options?: RequestInit & { auth?: boolean }
): Promise<T> {
  // Ensure trailing slash for Django REST framework compatibility
  // Split endpoint into path and query string
  const [path, queryString] = endpoint.split('?');
  const normalizedPath = path.endsWith('/') ? path : `${path}/`;
  const normalizedEndpoint = queryString ? `${normalizedPath}?${queryString}` : normalizedPath;
  const base = API_BASE || "";
  const url = `${base}/api${normalizedEndpoint}`;
  
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

  if (response.status === 204) {
    return undefined as T;
  }

  const text = await response.text();
  if (!text) {
    return undefined as T;
  }

  return JSON.parse(text) as T;
}

export async function fetchApiRaw(
  endpoint: string,
  options?: RequestInit & { auth?: boolean; throwOnError?: boolean }
): Promise<Response> {
  const [path, queryString] = endpoint.split('?');
  const normalizedPath = path.endsWith('/') ? path : `${path}/`;
  const normalizedEndpoint = queryString ? `${normalizedPath}?${queryString}` : normalizedPath;
  const base = API_BASE || "";
  const url = `${base}/api${normalizedEndpoint}`;

  const headers: Record<string, string> = {
    ...options?.headers as Record<string, string>,
  };

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

  if (!response.ok && options?.throwOnError !== false) {
    let error: ApiError = { message: `HTTP Error: ${response.status}` };
    try {
      const data = await response.json();
      if (data && typeof data === "object") {
        error = data as ApiError;
      }
    } catch {
      // ignore parse errors
    }
    throw error;
  }

  return response;
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

export async function getTicketsByUser(
  userId: string,
  options?: { by?: "user_id" | "guest_identifier" }
): Promise<Ticket[]> {
  const key = options?.by === "guest_identifier" ? "guest_identifier" : "user_id";
  return fetchApi<Ticket[]>(
    `/tickets/by_user?${key}=${encodeURIComponent(userId)}`
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

export async function createShareLink(
  ticketId: string,
  expiresInHours = 24,
  maxAccesses = 0
): Promise<{ token: string; expires_at: string }> {
  return fetchApi<{ token: string; expires_at: string }>(`/shares/create/`, {
    method: "POST",
    body: JSON.stringify({ ticket_id: ticketId, expires_in_hours: expiresInHours, max_accesses: maxAccesses }),
  });
}

export async function updateTicketInfo(ticketId: string, guestInfo: Record<string, any>, attributeId?: string): Promise<Ticket> {
  const body: Record<string, any> = { guest_info: guestInfo };
  if (attributeId) {
    body.attribute_id = attributeId;
  }
  return fetchApi<Ticket>(`/tickets/${ticketId}/update_info`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

// === Announcements ===

export interface Announcement {
  id: string;
  title: string;
  content: string;
  priority: 'info' | 'warning' | 'critical';
  priority_display: string;
  is_active: boolean;
  target_slot: string | null;
  created_at: string;
  updated_at: string;
}

export async function getAnnouncements(): Promise<Announcement[]> {
  const data = await fetchApi<{ results: Announcement[] } | Announcement[]>(
    `/announcements`,
    { auth: false }
  );
  return Array.isArray(data) ? data : data.results;
}

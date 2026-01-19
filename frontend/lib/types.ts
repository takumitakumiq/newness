/**
 * MATSU - TypeScript Type Definitions
 */

// === API Response Types ===

export interface EntrySlot {
  id: string;
  event_date: string;
  start_time: string;
  end_time: string | null;
  capacity: number;
  booked_count: number;
  remaining: number;
  availability_status: 'available' | 'limited' | 'few_left' | 'sold_out';
  is_active: boolean;
  entry_closed?: boolean;
}

export interface FormFieldCondition {
  field: string;           // 条件となるフィールドのkey
  operator: 'equals' | 'notEquals' | 'contains' | 'isTrue' | 'isFalse';
  value?: string | boolean; // 比較する値（isTrue/isFalseの場合は不要）
}

export interface FormField {
  key: string;
  label: string;
  type: 'text' | 'boolean' | 'select' | 'number' | 'email' | 'tel' | 'textarea';
  required?: boolean;
  options?: { value: string; label: string }[];
  placeholder?: string;
  description?: string;
  showWhen?: FormFieldCondition; // この条件を満たす時のみ表示
}

export interface AttributeConfig {
  id: string;
  target_type: string;
  display_name: string;
  max_total_limit: number;
  form_schema: FormField[];
  description: string;
  sort_order: number;
  is_active: boolean;
  is_cancellable: boolean;
  is_modifiable: boolean;
  cancel_deadline_hours: number;
}

export interface Ticket {
  id: string;
  reservation_id: string;
  slot: string;
  slot_detail: EntrySlot;
  attribute: string;
  attribute_detail: AttributeConfig;
  guest_info: Record<string, any>;
  status: 'valid' | 'entered' | 'cancelled';
  status_display: string;
  entered_at: string | null;
  created_at: string;
}

export interface Reservation {
  id: string;
  guest_identifier: string;
  user_name: string;
  user_email: string;
  total_tickets: number;
  created_at: string;
  updated_at: string;
  tickets: Ticket[];
}

export interface ReservationListItem {
  id: string;
  guest_identifier: string;
  user_name: string;
  user_email: string;
  total_tickets: number;
  created_at: string;
}

// === Request Types ===

export interface TicketRequest {
  slot_id: string;
  attribute_id: string;
  guest_info: Record<string, any>;
}

export interface CheckoutRequest {
  guest_identifier?: string;
  user_name?: string;
  user_email?: string;
  tickets: TicketRequest[];
}

export interface CheckoutResponse {
  reservation_id: string;
  ticket_ids: string[];
  total_tickets: number;
  created_at: string;
}

export interface CheckInRequest {
  ticket_uuid: string;
  device_id?: string;
  operator?: string;
}

export interface CheckInResponse {
  success: boolean;
  message: string;
  ticket?: Ticket;
}

// === Cart Types ===

export interface CartItem {
  id: string; // Temporary cart ID
  slot: EntrySlot;
  attribute: AttributeConfig;
  guest_info: Record<string, any>;
}

export interface CartState {
  items: CartItem[];
  userId: string;
  userName: string;
  userEmail: string;
}

// === UI State Types ===

export interface ApiError {
  message: string;
  errors?: Record<string, string[]>;
}

// === Auth Types ===

export interface User {
  id: number;
  username: string;
  email: string;
  first_name: string;
  last_name: string;
  date_joined: string;
  is_staff: boolean;
  is_superuser?: boolean;
}

export interface LoginRequest {
  username: string;
  password: string;
}

export interface LoginResponse {
  access: string;
  refresh: string;
}

export interface RegisterRequest {
  username: string;
  email: string;
  password: string;
  password_confirm: string;
  first_name?: string;
  last_name?: string;
}

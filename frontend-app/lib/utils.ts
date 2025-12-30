import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Format date to Japanese locale string
 */
export function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString("ja-JP", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short",
  });
}

/**
 * Format time to HH:MM format
 */
export function formatTime(timeString: string): string {
  return timeString.slice(0, 5);
}

/**
 * Format datetime to Japanese locale string
 */
export function formatDateTime(dateTimeString: string): string {
  const date = new Date(dateTimeString);
  return date.toLocaleString("ja-JP", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Get availability badge color class
 */
export function getAvailabilityColor(status: string): string {
  switch (status) {
    case "available":
      return "bg-green-500/20 text-green-400 border-green-500/30";
    case "limited":
      return "bg-yellow-500/20 text-yellow-400 border-yellow-500/30";
    case "few_left":
      return "bg-orange-500/20 text-orange-400 border-orange-500/30";
    case "sold_out":
      return "bg-red-500/20 text-red-400 border-red-500/30";
    default:
      return "bg-gray-500/20 text-gray-400 border-gray-500/30";
  }
}

/**
 * Get availability label
 */
export function getAvailabilityLabel(status: string): string {
  switch (status) {
    case "available":
      return "空きあり";
    case "limited":
      return "残りわずか";
    case "few_left":
      return "残り僅少";
    case "sold_out":
      return "完売";
    default:
      return "不明";
  }
}

/**
 * Get status badge color class
 */
export function getStatusColor(status: string): string {
  switch (status) {
    case "valid":
      return "bg-green-500/20 text-green-400";
    case "entered":
      return "bg-blue-500/20 text-blue-400";
    case "cancelled":
      return "bg-red-500/20 text-red-400";
    default:
      return "bg-gray-500/20 text-gray-400";
  }
}

/**
 * Generate unique ID for cart items
 */
export function generateCartItemId(): string {
  return `cart-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

/**
 * Sanitize user input to prevent XSS
 */
export function sanitizeInput(input: string): string {
  const div = document.createElement('div');
  div.textContent = input;
  return div.innerHTML;
}

/**
 * Validate email format
 */
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  return emailRegex.test(email);
}

/**
 * Validate phone number (Japanese format)
 */
export function isValidPhoneNumber(phone: string): boolean {
  // Accepts formats: 090-1234-5678, 09012345678, 03-1234-5678, etc.
  const phoneRegex = /^(0\d{1,4}-?\d{1,4}-?\d{4}|0\d{9,10})$/;
  return phoneRegex.test(phone.replace(/[^\d-]/g, ''));
}

/**
 * Format phone number to standard format
 */
export function formatPhoneNumber(phone: string): string {
  const cleaned = phone.replace(/\D/g, '');
  if (cleaned.length === 10) {
    return cleaned.replace(/(\d{3})(\d{3})(\d{4})/, '$1-$2-$3');
  } else if (cleaned.length === 11) {
    return cleaned.replace(/(\d{3})(\d{4})(\d{4})/, '$1-$2-$3');
  }
  return phone;
}

/**
 * Truncate long text with ellipsis
 */
export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength) + '...';
}

/**
 * Parse API error response
 */
export function parseApiError(error: any): string {
  if (typeof error === 'string') return error;
  if (error?.message) return error.message;
  if (error?.error) return error.error;
  if (error?.errors) {
    const firstError = Object.values(error.errors)[0];
    if (Array.isArray(firstError)) return firstError[0];
    return String(firstError);
  }
  return 'エラーが発生しました。もう一度お試しください。';
}

/**
 * Debounce function for search inputs
 */
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout;
  return function executedFunction(...args: Parameters<T>) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

/**
 * Check if date is in the past
 */
export function isPastDate(dateString: string): boolean {
  const date = new Date(dateString);
  const now = new Date();
  return date < now;
}

/**
 * Calculate time until event
 */
export function getTimeUntilEvent(dateString: string, timeString: string): string {
  const eventDateTime = new Date(`${dateString}T${timeString}`);
  const now = new Date();
  const diffMs = eventDateTime.getTime() - now.getTime();
  
  if (diffMs < 0) return '開催終了';
  
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  
  if (days > 0) return `あと${days}日`;
  if (hours > 0) return `あと${hours}時間`;
  return '本日開催';
}

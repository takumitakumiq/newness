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
  return `cart-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

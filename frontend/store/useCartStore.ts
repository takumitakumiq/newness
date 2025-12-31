/**
 * MATSU - Cart Store (Zustand)
 * Global state management for shopping cart
 */
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { CartItem, EntrySlot, AttributeConfig } from "@/lib/types";
import { generateCartItemId } from "@/lib/utils";

interface CartStore {
  // State
  items: CartItem[];
  userId: string;
  userName: string;
  userEmail: string;
  
  // Computed
  totalCount: () => number;
  getCountByAttribute: (attributeId: string) => number;
  getCountBySlot: (slotId: string) => number;
  
  // Actions
  addItem: (slot: EntrySlot, attribute: AttributeConfig) => string | null;
  removeItem: (itemId: string) => void;
  updateGuestInfo: (itemId: string, guestInfo: Record<string, any>) => void;
  setUserInfo: (userId: string, userName: string, userEmail: string) => void;
  clearCart: () => void;
  
  // Validation
  canAddItem: (attributeId: string, maxLimit: number) => boolean;
}

export const useCartStore = create<CartStore>()(
  persist(
    (set, get) => ({
      // Initial state
      items: [],
      userId: "",
      userName: "",
      userEmail: "",
      
      // Computed values
      totalCount: () => get().items.length,
      
      getCountByAttribute: (attributeId: string) => {
        return get().items.filter((item) => item.attribute.id === attributeId).length;
      },
      
      getCountBySlot: (slotId: string) => {
        return get().items.filter((item) => item.slot.id === slotId).length;
      },
      
      // Check if can add more items for this attribute type
      canAddItem: (attributeId: string, maxLimit: number) => {
        const currentCount = get().getCountByAttribute(attributeId);
        return currentCount < maxLimit;
      },
      
      // Add item to cart
      addItem: (slot: EntrySlot, attribute: AttributeConfig) => {
        const state = get();
        
        // Check quota
        if (!state.canAddItem(attribute.id, attribute.max_total_limit)) {
          return null; // Quota exceeded
        }
        
        // Check slot availability
        const currentSlotCount = state.getCountBySlot(slot.id);
        if (slot.remaining <= currentSlotCount) {
          return null; // No availability
        }
        
        const itemId = generateCartItemId();
        const newItem: CartItem = {
          id: itemId,
          slot,
          attribute,
          guest_info: {},
        };
        
        set((state) => ({
          items: [...state.items, newItem],
        }));
        
        return itemId;
      },
      
      // Remove item from cart
      removeItem: (itemId: string) => {
        set((state) => ({
          items: state.items.filter((item) => item.id !== itemId),
        }));
      },
      
      // Update guest info for a specific cart item
      updateGuestInfo: (itemId: string, guestInfo: Record<string, any>) => {
        set((state) => ({
          items: state.items.map((item) =>
            item.id === itemId ? { ...item, guest_info: guestInfo } : item
          ),
        }));
      },
      
      // Set user information
      setUserInfo: (userId: string, userName: string, userEmail: string) => {
        set({ userId, userName, userEmail });
      },
      
      // Clear entire cart
      clearCart: () => {
        set({ items: [], userId: "", userName: "", userEmail: "" });
      },
    }),
    {
      name: "matsu-cart",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        items: state.items,
        userId: state.userId,
        userName: state.userName,
        userEmail: state.userEmail,
      }),
    }
  )
);

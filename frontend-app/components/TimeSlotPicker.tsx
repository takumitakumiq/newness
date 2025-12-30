"use client";

import { motion } from "framer-motion";
import { Calendar, Clock, Users } from "lucide-react";
import { cn, formatDate, formatTime, getAvailabilityColor, getAvailabilityLabel } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import type { EntrySlot } from "@/lib/types";

interface TimeSlotPickerProps {
  slots: EntrySlot[];
  selectedSlotId?: string;
  onSelect: (slot: EntrySlot) => void;
  disabled?: boolean;
}

export function TimeSlotPicker({
  slots,
  selectedSlotId,
  onSelect,
  disabled = false,
}: TimeSlotPickerProps) {
  // Group slots by date
  const slotsByDate = slots.reduce((acc, slot) => {
    const date = slot.event_date;
    if (!acc[date]) {
      acc[date] = [];
    }
    acc[date].push(slot);
    return acc;
  }, {} as Record<string, EntrySlot[]>);

  return (
    <div className="space-y-6">
      {Object.entries(slotsByDate).map(([date, dateSlots]) => (
        <div key={date} className="space-y-3">
          <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <Calendar className="h-4 w-4" />
            <span>{formatDate(date)}</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {dateSlots.map((slot) => (
              <TimeSlotCard
                key={slot.id}
                slot={slot}
                isSelected={selectedSlotId === slot.id}
                onSelect={() => onSelect(slot)}
                disabled={disabled || slot.availability_status === "sold_out"}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

interface TimeSlotCardProps {
  slot: EntrySlot;
  isSelected: boolean;
  onSelect: () => void;
  disabled: boolean;
}

function TimeSlotCard({ slot, isSelected, onSelect, disabled }: TimeSlotCardProps) {
  const isSoldOut = slot.availability_status === "sold_out";
  
  return (
    <motion.button
      type="button"
      onClick={onSelect}
      disabled={disabled}
      whileHover={!disabled ? { scale: 1.02 } : undefined}
      whileTap={!disabled ? { scale: 0.98 } : undefined}
      className={cn(
        "relative flex flex-col items-center justify-center p-4 rounded-xl border-2 transition-all",
        "bg-card/50 backdrop-blur-sm",
        isSelected
          ? "border-festival-neon bg-festival-neon/10 shadow-lg shadow-cyan-500/20"
          : "border-border hover:border-muted-foreground/50",
        disabled && "opacity-50 cursor-not-allowed",
        isSoldOut && "opacity-40"
      )}
    >
      {/* Time */}
      <div className="flex items-center gap-1.5 text-lg font-bold">
        <Clock className="h-4 w-4 text-muted-foreground" />
        <span>{formatTime(slot.start_time)}</span>
        {slot.end_time && (
          <>
            <span className="text-muted-foreground">-</span>
            <span>{formatTime(slot.end_time)}</span>
          </>
        )}
      </div>
      
      {/* Availability */}
      <div className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
        <Users className="h-3 w-3" />
        <span>残り {slot.remaining} / {slot.capacity}</span>
      </div>
      
      {/* Status Badge */}
      <Badge
        className={cn(
          "mt-2 text-xs",
          getAvailabilityColor(slot.availability_status)
        )}
      >
        {getAvailabilityLabel(slot.availability_status)}
      </Badge>
      
      {/* Selected indicator */}
      {isSelected && (
        <motion.div
          layoutId="slot-selection"
          className="absolute inset-0 rounded-xl border-2 border-festival-neon"
          initial={false}
          transition={{ type: "spring", stiffness: 500, damping: 30 }}
        />
      )}
    </motion.button>
  );
}

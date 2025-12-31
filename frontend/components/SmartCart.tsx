"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ShoppingCart, Trash2, ChevronUp, ChevronDown, Ticket } from "lucide-react";
import { useCartStore } from "@/store/useCartStore";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatDate, formatTime, cn } from "@/lib/utils";

interface SmartCartProps {
  onCheckout: () => void;
}

export function SmartCart({ onCheckout }: SmartCartProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const { items, removeItem, totalCount } = useCartStore();
  const count = totalCount();

  if (count === 0) return null;

  return (
    <>
      {/* Backdrop when expanded */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 z-40"
            onClick={() => setIsExpanded(false)}
          />
        )}
      </AnimatePresence>

      {/* Cart bar */}
      <motion.div
        layout
        className={cn(
          "fixed bottom-0 left-0 right-0 z-50",
          "bg-card/95 backdrop-blur-lg border-t border-border",
          "shadow-2xl shadow-black/20"
        )}
      >
        <div className="container max-w-2xl mx-auto">
          {/* Collapsed header */}
          <div
            className="w-full flex items-center justify-between p-4 cursor-pointer"
            onClick={() => setIsExpanded(!isExpanded)}
          >
            <div className="flex items-center gap-3">
              <div className="relative">
                <ShoppingCart className="h-6 w-6" />
                <Badge className="absolute -top-2 -right-2 h-5 w-5 p-0 flex items-center justify-center bg-festival-neon text-black">
                  {count}
                </Badge>
              </div>
              <span className="font-medium">
                {count}枚のチケット
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="neon"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  onCheckout();
                }}
              >
                購入へ進む
              </Button>
              {isExpanded ? (
                <ChevronDown className="h-5 w-5 text-muted-foreground" />
              ) : (
                <ChevronUp className="h-5 w-5 text-muted-foreground" />
              )}
            </div>
          </div>

          {/* Expanded content */}
          <AnimatePresence>
            {isExpanded && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ type: "spring", damping: 25, stiffness: 300 }}
                className="overflow-hidden"
              >
                <div className="px-4 pb-4 space-y-2 max-h-[50vh] overflow-y-auto">
                  {items.map((item) => (
                    <motion.div
                      key={item.id}
                      layout
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, x: -100 }}
                      className="flex items-center justify-between p-3 rounded-lg bg-muted/50"
                    >
                      <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-festival-violet/20">
                          <Ticket className="h-4 w-4 text-festival-neon" />
                        </div>
                        <div>
                          <p className="font-medium text-sm">
                            {item.attribute.display_name}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {formatDate(item.slot.event_date)} {formatTime(item.slot.start_time)}
                          </p>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => removeItem(item.id)}
                        className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </motion.div>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </>
  );
}

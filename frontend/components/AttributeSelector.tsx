"use client";

import { motion, AnimatePresence } from "framer-motion";
import { Plus, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { AttributeConfig } from "@/lib/types";

interface AttributeSelectorProps {
  attributes: AttributeConfig[];
  selectedAttributeId?: string;
  onSelect: (attribute: AttributeConfig) => void;
  getCount: (attributeId: string) => number;
}

export function AttributeSelector({
  attributes,
  selectedAttributeId,
  onSelect,
  getCount,
}: AttributeSelectorProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {attributes.map((attr) => {
        const count = getCount(attr.id);
        const isSelected = selectedAttributeId === attr.id;
        const isMaxed = count >= attr.max_total_limit;
        
        return (
          <motion.div
            key={attr.id}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            <button
              type="button"
              onClick={() => onSelect(attr)}
              disabled={isMaxed}
              className={cn(
                "w-full p-4 rounded-xl border-2 text-left transition-all",
                "bg-card/50 backdrop-blur-sm",
                isSelected
                  ? "border-festival-neon bg-festival-neon/10 shadow-lg shadow-cyan-500/20"
                  : "border-border hover:border-muted-foreground/50",
                isMaxed && "opacity-50 cursor-not-allowed"
              )}
            >
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-semibold text-lg">{attr.display_name}</h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    {attr.description || `最大${attr.max_total_limit}枚まで`}
                  </p>
                </div>
                
                <div className="flex items-center gap-2">
                  {count > 0 && (
                    <Badge variant="secondary" className="text-xs">
                      {count}/{attr.max_total_limit}
                    </Badge>
                  )}
                  
                  <AnimatePresence mode="wait">
                    {isSelected ? (
                      <motion.div
                        key="check"
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        exit={{ scale: 0 }}
                        className="w-8 h-8 rounded-full bg-festival-neon flex items-center justify-center"
                      >
                        <Check className="h-5 w-5 text-black" />
                      </motion.div>
                    ) : !isMaxed && (
                      <motion.div
                        key="plus"
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        exit={{ scale: 0 }}
                        className="w-8 h-8 rounded-full bg-muted flex items-center justify-center"
                      >
                        <Plus className="h-5 w-5 text-muted-foreground" />
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>
              
              {/* Progress bar */}
              <div className="mt-3 h-1.5 bg-muted rounded-full overflow-hidden">
                <motion.div
                  className="h-full bg-festival-neon"
                  initial={{ width: 0 }}
                  animate={{ width: `${(count / attr.max_total_limit) * 100}%` }}
                  transition={{ type: "spring", stiffness: 300, damping: 25 }}
                />
              </div>
            </button>
          </motion.div>
        );
      })}
    </div>
  );
}

"use client";

import { QRCodeSVG } from "qrcode.react";
import { motion } from "framer-motion";
import { Calendar, Clock, User, CheckCircle, XCircle } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn, formatDate, formatTime, getStatusColor } from "@/lib/utils";
import type { Ticket } from "@/lib/types";

interface TicketCardProps {
  ticket: Ticket;
  compact?: boolean;
}

export function TicketCard({ ticket, compact = false }: TicketCardProps) {
  const isValid = ticket.status === "valid";
  const isEntered = ticket.status === "entered";
  
  // Generate header color based on event date
  const dateHash = ticket.slot_detail.event_date.split("-").reduce((a, b) => a + parseInt(b), 0);
  const headerColors = [
    "from-purple-600 to-indigo-600",
    "from-cyan-600 to-blue-600",
    "from-pink-600 to-rose-600",
    "from-emerald-600 to-teal-600",
  ];
  const headerColor = headerColors[dateHash % headerColors.length];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -4 }}
      transition={{ type: "spring", stiffness: 300, damping: 25 }}
    >
      <Card className="overflow-hidden bg-card/80 backdrop-blur-sm border-border/50">
        {/* Header with gradient */}
        <CardHeader className={cn(
          "py-3 px-4 bg-gradient-to-r text-white",
          headerColor
        )}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              <span className="font-medium">
                {formatDate(ticket.slot_detail.event_date)}
              </span>
            </div>
            <Badge className={cn("text-xs", getStatusColor(ticket.status))}>
              {ticket.status_display}
            </Badge>
          </div>
        </CardHeader>

        <CardContent className={cn("p-4", compact ? "pb-3" : "pb-6")}>
          <div className={cn(
            "flex gap-4",
            compact ? "flex-row items-center" : "flex-col sm:flex-row"
          )}>
            {/* QR Code */}
            <div className={cn(
              "flex-shrink-0 p-3 bg-white rounded-lg",
              compact ? "w-20 h-20" : "w-32 h-32 mx-auto sm:mx-0"
            )}>
              <QRCodeSVG
                value={ticket.id}
                size={compact ? 64 : 112}
                level="M"
                includeMargin={false}
              />
            </div>

            {/* Ticket Info */}
            <div className="flex-1 space-y-2">
              <div className="flex items-center gap-2">
                <User className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium">
                  {ticket.attribute_detail.display_name}
                </span>
              </div>
              
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Clock className="h-3.5 w-3.5" />
                <span>
                  {formatTime(ticket.slot_detail.start_time)}
                  {ticket.slot_detail.end_time && ` - ${formatTime(ticket.slot_detail.end_time)}`}
                </span>
              </div>

              {/* Status indicator */}
              {!compact && (
                <div className="pt-2">
                  {isValid && (
                    <div className="flex items-center gap-2 text-green-400">
                      <CheckCircle className="h-5 w-5" />
                      <span className="text-sm font-medium">入場可能</span>
                    </div>
                  )}
                  {isEntered && (
                    <div className="flex items-center gap-2 text-blue-400">
                      <CheckCircle className="h-5 w-5" />
                      <span className="text-sm font-medium">
                        入場済み ({ticket.entered_at && new Date(ticket.entered_at).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" })})
                      </span>
                    </div>
                  )}
                  {ticket.status === "cancelled" && (
                    <div className="flex items-center gap-2 text-red-400">
                      <XCircle className="h-5 w-5" />
                      <span className="text-sm font-medium">キャンセル済み</span>
                    </div>
                  )}
                </div>
              )}

              {/* Ticket ID */}
              <p className="text-xs text-muted-foreground font-mono truncate">
                {ticket.id}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

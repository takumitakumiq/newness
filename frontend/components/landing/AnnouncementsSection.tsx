"use client";

import { motion } from "framer-motion";
import { AlertTriangle, AlertCircle, Info } from "lucide-react";
import type { Announcement } from "@/lib/api";

interface AnnouncementsSectionProps {
  announcements: Announcement[];
}

const getAnnouncementIcon = (priority: string) => {
  switch (priority) {
    case "critical":
      return <AlertCircle className="h-5 w-5" />;
    case "warning":
      return <AlertTriangle className="h-5 w-5" />;
    default:
      return <Info className="h-5 w-5" />;
  }
};

const getAnnouncementStyle = (priority: string) => {
  switch (priority) {
    case "critical":
      return "bg-red-50 border-red-200 text-red-800 dark:bg-red-500/20 dark:border-red-500/50 dark:text-red-200";
    case "warning":
      return "bg-yellow-50 border-yellow-200 text-yellow-900 dark:bg-yellow-500/20 dark:border-yellow-500/50 dark:text-yellow-200";
    default:
      return "bg-blue-50 border-blue-200 text-blue-800 dark:bg-blue-500/20 dark:border-blue-500/50 dark:text-blue-200";
  }
};

export function AnnouncementsSection({ announcements }: AnnouncementsSectionProps) {
  if (!announcements.length) return null;

  return (
    <section className="space-y-3">
      {announcements.map((announcement) => (
        <motion.div
          key={announcement.id}
          initial={{ opacity: 1, y: 0 }}
          animate={{ opacity: 1, y: 0 }}
          className={`p-4 rounded-lg border flex items-start gap-3 ${getAnnouncementStyle(announcement.priority)}`}
        >
          {getAnnouncementIcon(announcement.priority)}
          <div>
            <h4 className="font-semibold">{announcement.title}</h4>
            <p className="text-sm opacity-90">{announcement.content}</p>
          </div>
        </motion.div>
      ))}
    </section>
  );
}

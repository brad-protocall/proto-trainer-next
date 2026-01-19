/**
 * Shared formatting utilities for dashboards and components
 */

import type { AssignmentStatus } from "@/types";

/**
 * Format a date string for display
 */
export function formatDate(dateStr: string | null): string | null {
  if (!dateStr) return null;
  const date = new Date(dateStr);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/**
 * Get the number of days until a due date
 * Returns negative numbers for overdue dates
 */
export function getDaysUntilDue(dueDateStr: string | null): number | null {
  if (!dueDateStr) return null;
  const now = new Date();
  const dueDate = new Date(dueDateStr);
  const diffTime = dueDate.getTime() - now.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays;
}

/**
 * Get Tailwind CSS classes for assignment status badges
 */
export function getStatusColor(status: AssignmentStatus): string {
  switch (status) {
    case "pending":
      return "bg-yellow-500/20 text-yellow-300 border-yellow-500/30";
    case "in_progress":
      return "bg-blue-500/20 text-blue-300 border-blue-500/30";
    case "completed":
      return "bg-green-500/20 text-green-300 border-green-500/30";
    default:
      return "bg-gray-500/20 text-gray-300 border-gray-500/30";
  }
}

/**
 * Get status icon emoji
 */
export function getStatusIcon(status: AssignmentStatus): string {
  switch (status) {
    case "pending":
      return "⏳";
    case "in_progress":
      return "🎙️";
    case "completed":
      return "✓";
    default:
      return "•";
  }
}

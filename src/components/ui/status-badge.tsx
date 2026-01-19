"use client";

import { AssignmentStatus } from "@/types";
import { getStatusColor, getStatusIcon } from "@/lib/format";

interface StatusBadgeProps {
  status: AssignmentStatus;
  className?: string;
}

export function StatusBadge({ status, className = "" }: StatusBadgeProps) {
  return (
    <span
      className={`px-2 py-1 rounded border text-xs font-marfa ${getStatusColor(status)} ${className}`}
    >
      {getStatusIcon(status)} {status.replace("_", " ")}
    </span>
  );
}

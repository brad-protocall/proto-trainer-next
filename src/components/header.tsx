"use client";

import Image from "next/image";
import { UserRole } from "@/types";

interface HeaderProps {
  title: string;
  role: UserRole;
  onRoleChange: (role: UserRole) => void;
}

export default function Header({
  title,
  role,
  onRoleChange,
}: HeaderProps) {
  return (
    <div className="flex flex-row items-center p-4 bg-brand-navy rounded-xl my-4 gap-4">
      {/* Role Toggle - Left side */}
      <select
        value={role}
        onChange={(e) => onRoleChange(e.target.value as UserRole)}
        className="w-32 bg-brand-navy border border-brand-orange/30 text-white
                   rounded-md px-3 py-1.5 text-sm font-marfa
                   focus:outline-none focus:ring-2 focus:ring-brand-orange"
      >
        <option value="counselor">Counselor</option>
        <option value="supervisor">Supervisor</option>
      </select>

      <p className="text-2xl text-white font-marfa font-semibold grow text-center">
        {title}
      </p>

      {/* Right side - Protocall logo */}
      <Image
        src="/logo-main.svg"
        alt="Protocall"
        width={120}
        height={32}
        className="h-8 w-auto"
        priority
      />
    </div>
  );
}

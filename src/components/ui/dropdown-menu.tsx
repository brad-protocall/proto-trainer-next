"use client";

import { useRef, useEffect, ReactNode } from "react";

interface DropdownItem {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  loading?: boolean;
  variant?: "default" | "primary";
}

interface DropdownMenuProps {
  items: DropdownItem[];
  isOpen: boolean;
  onClose: () => void;
  children: ReactNode;
  onToggle: () => void;
}

export function DropdownMenu({
  items,
  isOpen,
  onClose,
  onToggle,
  children,
}: DropdownMenuProps) {
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        onClose();
      }
    };
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen, onClose]);

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={onToggle}
        className="text-gray-400 hover:text-white p-1"
        aria-label="Options"
      >
        {children}
      </button>
      {isOpen && (
        <div className="absolute right-0 mt-1 w-48 bg-gray-800 rounded-lg shadow-lg py-1 z-10 border border-gray-700">
          {items.map((item, index) => (
            <button
              key={index}
              onClick={() => {
                item.onClick();
                onClose();
              }}
              disabled={item.disabled || item.loading}
              className={`w-full text-left px-4 py-2 text-sm font-marfa
                disabled:opacity-50 disabled:cursor-not-allowed
                ${
                  item.variant === "primary"
                    ? "text-brand-orange hover:bg-gray-700"
                    : "text-gray-300 hover:bg-gray-700"
                }`}
            >
              {item.loading ? "Loading..." : item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Account, ApiResponse } from "@/types";
import type { AuthFetchFn } from "@/lib/fetch";

interface AccountSearchDropdownProps {
  accounts: Account[];
  selectedAccountId: string | null;
  onSelect: (accountId: string | null) => void;
  authFetch: AuthFetchFn;
  onAccountsChanged: () => void;
}

export default function AccountSearchDropdown({
  accounts,
  selectedAccountId,
  onSelect,
  authFetch,
  onAccountsChanged,
}: AccountSearchDropdownProps) {
  const [search, setSearch] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(0);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newAccountName, setNewAccountName] = useState("");
  const [newAccountNumber, setNewAccountNumber] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selectedAccount = accounts.find((a) => a.id === selectedAccountId) ?? null;

  const filtered = search.trim()
    ? accounts
        .filter((a) => {
          const q = search.toLowerCase();
          return (
            a.name.toLowerCase().includes(q) ||
            (a.accountNumber && a.accountNumber.includes(q))
          );
        })
        .slice(0, 10)
    : [];

  // Close dropdown when clicking outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Reset highlight when filtered results change
  useEffect(() => {
    setHighlightIndex(0);
  }, [filtered.length]);

  const handleSelect = useCallback(
    (accountId: string) => {
      onSelect(accountId);
      setSearch("");
      setIsOpen(false);
    },
    [onSelect]
  );

  const handleClear = useCallback(() => {
    onSelect(null);
    setSearch("");
  }, [onSelect]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen || filtered.length === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightIndex((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      handleSelect(filtered[highlightIndex].id);
    } else if (e.key === "Escape") {
      setIsOpen(false);
    }
  };

  const handleCreate = async () => {
    if (!newAccountName.trim()) {
      setCreateError("Account name is required");
      return;
    }
    setCreating(true);
    setCreateError(null);
    try {
      const body: Record<string, string> = { name: newAccountName.trim() };
      if (newAccountNumber.trim()) body.accountNumber = newAccountNumber.trim();

      const response = await authFetch("/api/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data: ApiResponse<Account> = await response.json();
      if (!data.ok) throw new Error(data.error.message);

      // Refresh accounts list, then select the new account
      await onAccountsChanged();
      onSelect(data.data.id);
      setShowCreateForm(false);
      setNewAccountName("");
      setNewAccountNumber("");
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Failed to create account");
    } finally {
      setCreating(false);
    }
  };

  // If an account is selected, show it as a chip
  if (selectedAccount && !isOpen) {
    return (
      <div ref={containerRef}>
        <div className="flex items-center gap-2">
          <div className="flex-1 flex items-center gap-2 bg-gray-800 border border-gray-600 rounded px-3 py-2">
            <span className="text-white font-marfa text-sm">
              {selectedAccount.name}
              {selectedAccount.accountNumber && (
                <span className="text-gray-400 ml-1">[{selectedAccount.accountNumber}]</span>
              )}
            </span>
            <button
              type="button"
              onClick={handleClear}
              className="ml-auto text-gray-400 hover:text-white text-sm"
              title="Clear selection"
            >
              ✕
            </button>
          </div>
          <button
            type="button"
            className="px-3 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded text-sm whitespace-nowrap"
            onClick={() => {
              setShowCreateForm(true);
              setIsOpen(false);
            }}
          >
            + New
          </button>
        </div>
        {showCreateForm && (
          <CreateForm
            name={newAccountName}
            setName={setNewAccountName}
            number={newAccountNumber}
            setNumber={setNewAccountNumber}
            creating={creating}
            error={createError}
            onCreate={handleCreate}
            onCancel={() => {
              setShowCreateForm(false);
              setNewAccountName("");
              setNewAccountNumber("");
              setCreateError(null);
            }}
          />
        )}
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative">
      <div className="flex gap-2">
        <div className="flex-1 relative">
          <input
            ref={inputRef}
            type="text"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setIsOpen(e.target.value.trim().length > 0);
            }}
            onFocus={() => {
              if (search.trim()) setIsOpen(true);
            }}
            onKeyDown={handleKeyDown}
            placeholder="Search by account name or number..."
            className="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2
                       text-white font-marfa focus:outline-none focus:border-brand-orange
                       placeholder:text-gray-500 text-sm"
          />
          {/* Dropdown results */}
          {isOpen && filtered.length > 0 && (
            <ul className="absolute z-50 top-full left-0 right-0 mt-1 bg-gray-800 border border-gray-600
                           rounded shadow-lg max-h-60 overflow-y-auto">
              {filtered.map((account, i) => (
                <li
                  key={account.id}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    handleSelect(account.id);
                  }}
                  onMouseEnter={() => setHighlightIndex(i)}
                  className={`px-3 py-2 cursor-pointer text-sm font-marfa ${
                    i === highlightIndex
                      ? "bg-brand-orange/20 text-white"
                      : "text-gray-300 hover:bg-gray-700"
                  }`}
                >
                  {account.name}
                  {account.accountNumber && (
                    <span className="text-gray-500 ml-1">[{account.accountNumber}]</span>
                  )}
                </li>
              ))}
            </ul>
          )}
          {isOpen && search.trim() && filtered.length === 0 && (
            <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-gray-800 border border-gray-600
                            rounded shadow-lg px-3 py-2 text-sm text-gray-400">
              No accounts match &ldquo;{search}&rdquo;
            </div>
          )}
        </div>
        <button
          type="button"
          className="px-3 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded text-sm whitespace-nowrap"
          onClick={() => {
            setShowCreateForm(true);
            setIsOpen(false);
          }}
        >
          + New
        </button>
      </div>
      {showCreateForm && (
        <CreateForm
          name={newAccountName}
          setName={setNewAccountName}
          number={newAccountNumber}
          setNumber={setNewAccountNumber}
          creating={creating}
          error={createError}
          onCreate={handleCreate}
          onCancel={() => {
            setShowCreateForm(false);
            setNewAccountName("");
            setNewAccountNumber("");
            setCreateError(null);
          }}
        />
      )}
    </div>
  );
}

/** Inline form for creating a new account */
function CreateForm({
  name,
  setName,
  number,
  setNumber,
  creating,
  error,
  onCreate,
  onCancel,
}: {
  name: string;
  setName: (v: string) => void;
  number: string;
  setNumber: (v: string) => void;
  creating: boolean;
  error: string | null;
  onCreate: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="mt-2 p-3 bg-gray-800/50 border border-gray-600 rounded-lg space-y-2">
      <div className="flex gap-2">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Account name"
          className="flex-1 bg-gray-900 border border-gray-600 rounded px-3 py-1.5
                     text-white font-marfa text-sm focus:outline-none focus:border-brand-orange
                     placeholder:text-gray-500"
          autoFocus
        />
        <input
          type="text"
          value={number}
          onChange={(e) => setNumber(e.target.value)}
          placeholder="Number (optional)"
          className="w-32 bg-gray-900 border border-gray-600 rounded px-3 py-1.5
                     text-white font-marfa text-sm focus:outline-none focus:border-brand-orange
                     placeholder:text-gray-500"
        />
      </div>
      <div className="flex gap-2 items-center">
        <button
          type="button"
          onClick={onCreate}
          disabled={creating}
          className={`px-3 py-1.5 rounded text-sm font-marfa ${
            creating
              ? "bg-gray-600 text-gray-400 cursor-wait"
              : "bg-brand-orange hover:bg-brand-orange/80 text-white"
          }`}
        >
          {creating ? "Creating..." : "Create"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={creating}
          className="px-3 py-1.5 text-gray-400 hover:text-white text-sm"
        >
          Cancel
        </button>
        {error && <span className="text-xs text-red-400">{error}</span>}
      </div>
    </div>
  );
}

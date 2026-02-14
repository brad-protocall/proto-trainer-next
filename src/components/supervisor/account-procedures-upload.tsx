"use client";

import { useState } from "react";
import { Account, ApiResponse, ProcedureHistoryEntry } from "@/types";
import type { AuthFetchFn } from "@/lib/fetch";

interface AccountProceduresUploadProps {
  account: Account;
  authFetch: AuthFetchFn;
  onAccountsChanged: () => void | Promise<void>;
  showHistory?: boolean;
}

/** Shared component for uploading/viewing account procedure PDFs */
export default function AccountProceduresUpload({
  account,
  authFetch,
  onAccountsChanged,
  showHistory = true,
}: AccountProceduresUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);

  const history = (account.procedureHistory ?? []) as ProcedureHistoryEntry[];
  const latestUpload = history.length > 0 ? history[history.length - 1] : null;

  const handleUpload = async (file: File) => {
    setUploading(true);
    setUploadError(null);
    setUploadSuccess(null);

    try {
      const form = new FormData();
      form.append("policiesFile", file);

      const response = await authFetch(`/api/accounts/${account.id}`, {
        method: "PATCH",
        body: form,
      });

      const data: ApiResponse<Account> = await response.json();
      if (!data.ok) throw new Error(data.error.message);

      setUploadSuccess(`Uploaded ${file.name}`);
      await onAccountsChanged();
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-3">
      <div className="flex items-center justify-between">
        <div className="text-sm text-gray-300">
          {latestUpload ? (
            <span>
              <span className="text-green-400">&#9679;</span>{" "}
              {latestUpload.filename} &middot;{" "}
              {new Date(latestUpload.uploadedAt).toLocaleDateString()}
            </span>
          ) : (
            <span className="text-gray-500">No procedures uploaded</span>
          )}
        </div>
        <label
          className={`cursor-pointer px-3 py-1 text-xs rounded font-marfa ${
            uploading
              ? "bg-gray-600 text-gray-400 cursor-wait"
              : "bg-blue-600 hover:bg-blue-500 text-white"
          }`}
        >
          {uploading ? "Uploading..." : latestUpload ? "Replace PDF" : "Upload Procedures PDF"}
          <input
            type="file"
            accept=".pdf"
            disabled={uploading}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleUpload(file);
              e.target.value = ""; // Reset to allow re-upload of same file
            }}
            className="hidden"
          />
        </label>
      </div>
      {uploadError && (
        <p className="text-xs text-red-400 mt-2">{uploadError}</p>
      )}
      {uploadSuccess && (
        <p className="text-xs text-green-400 mt-2">{uploadSuccess}</p>
      )}
      {showHistory && history.length > 1 && (
        <details className="mt-2">
          <summary className="text-xs text-gray-500 cursor-pointer hover:text-gray-400">
            Upload history ({history.length} uploads)
          </summary>
          <ul className="mt-1 space-y-1">
            {[...history].reverse().map((entry, i) => (
              <li key={i} className="text-xs text-gray-500">
                {entry.filename} &middot;{" "}
                {new Date(entry.uploadedAt).toLocaleDateString()}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

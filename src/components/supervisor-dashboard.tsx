"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import {
  Scenario,
  User,
  Account,
  ApiResponse,
  FlagListItem,
} from "@/types";
import { createAuthFetch } from "@/lib/fetch";
import { formatDate } from "@/lib/format";
import ScenarioTab from "./supervisor/scenario-tab";
import AssignmentTab from "./supervisor/assignment-tab";

const SEVERITY_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  critical: { bg: "bg-red-500/20", text: "text-red-300", label: "Critical" },
  warning: { bg: "bg-yellow-500/20", text: "text-yellow-300", label: "Warning" },
  info: { bg: "bg-blue-500/20", text: "text-blue-300", label: "Info" },
};

const FLAG_TYPE_LABELS: Record<string, string> = {
  user_feedback: "User Feedback",
  ai_guidance_concern: "AI Guidance Concern",
  jailbreak: "Jailbreak Attempt",
  inappropriate: "Inappropriate Content",
  off_topic: "Off Topic",
  pii_sharing: "PII Sharing",
  system_gaming: "System Gaming",
  role_confusion: "Role Confusion",
  prompt_leakage: "Prompt Leakage",
  character_break: "Character Break",
  behavior_omission: "Behavior Omission",
  unauthorized_elements: "Unauthorized Elements",
};

interface SupervisorDashboardProps {
  supervisorId?: string | null;
}

export default function SupervisorDashboard({ supervisorId: propSupervisorId }: SupervisorDashboardProps) {
  const [activeTab, setActiveTab] = useState<"scenarios" | "assignments" | "flags">("scenarios");
  const [error, setError] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = useState("");

  // Shared reference data
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [allSupervisors, setAllSupervisors] = useState<User[]>([]);
  const [learners, setLearners] = useState<User[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [globalScenarios, setGlobalScenarios] = useState<Scenario[]>([]);

  // Flags state (inline — only ~50 lines of JSX)
  const [flags, setFlags] = useState<FlagListItem[]>([]);
  const [flagsLoading, setFlagsLoading] = useState(false);
  const [pendingFlagCount, setPendingFlagCount] = useState(0);

  const authFetch = useMemo(
    () => (currentUser ? createAuthFetch(currentUser.id) : fetch),
    [currentUser]
  );

  const loadGlobalScenarios = useCallback(async () => {
    try {
      const response = await authFetch("/api/scenarios?isOneTime=false");
      const data: ApiResponse<Scenario[]> = await response.json();
      if (data.ok) setGlobalScenarios(data.data);
    } catch (err) {
      console.error("Failed to load global scenarios", err);
    }
  }, [authFetch]);

  const loadFlags = useCallback(async () => {
    if (!currentUser) return;
    setFlagsLoading(true);
    try {
      const response = await authFetch("/api/flags?status=pending");
      const data: ApiResponse<FlagListItem[]> = await response.json();
      if (!data.ok) throw new Error(data.error.message);
      setFlags(data.data);
      setPendingFlagCount(data.data.length);
    } catch (err) {
      console.error("Failed to load flags", err);
    } finally {
      setFlagsLoading(false);
    }
  }, [currentUser, authFetch]);

  const loadAccounts = useCallback(async () => {
    try {
      const response = await authFetch("/api/accounts");
      const data: ApiResponse<Account[]> = await response.json();
      if (data.ok) setAccounts(data.data);
    } catch (err) {
      console.error("Failed to load accounts", err);
    }
  }, [authFetch]);

  const isDemoMode = process.env.NEXT_PUBLIC_DEMO_MODE === "true";

  const handleSupervisorChange = (supervisorId: string) => {
    window.location.href = `/supervisor?supervisorId=${supervisorId}`;
  };

  // Load supervisor user, accounts, learners on mount
  useEffect(() => {
    const loadSupervisorUser = async () => {
      try {
        const response = await fetch("/api/users?role=supervisor");
        const data: ApiResponse<User[]> = await response.json();
        if (data.ok && data.data.length > 0) {
          const supervisors = data.data;
          setAllSupervisors(supervisors);

          // Select from URL param or default to first
          let selectedUser: User | undefined;
          if (propSupervisorId) {
            selectedUser = supervisors.find(s => s.id === propSupervisorId);
          }
          if (!selectedUser) {
            selectedUser = supervisors[0];
          }
          setCurrentUser(selectedUser);
        }
      } catch (err) {
        console.error("Failed to load supervisor user:", err);
      }
    };

    const loadLearners = async () => {
      try {
        const response = await fetch("/api/users?role=learner");
        const data: ApiResponse<User[]> = await response.json();
        if (data.ok) setLearners(data.data);
      } catch (err) {
        console.error("Failed to load learners", err);
      }
    };

    loadSupervisorUser();
    loadAccounts();
    loadLearners();
  }, [propSupervisorId, loadAccounts]);

  // Load global scenarios once user is available
  useEffect(() => {
    if (currentUser) {
      loadGlobalScenarios();
    }
  }, [currentUser, loadGlobalScenarios]);

  // Load flags on mount + when switching to flags tab
  useEffect(() => {
    if (currentUser) {
      loadFlags();
    }
  }, [currentUser, loadFlags]);

  useEffect(() => {
    if (activeTab === "flags") {
      loadFlags();
    }
  }, [activeTab, loadFlags]);

  return (
    <div className="pb-8">
      <h1 className="text-2xl font-marfa font-bold text-white mb-6 text-center">
        Supervisor Dashboard
      </h1>

      {/* Demo mode supervisor selector */}
      {isDemoMode && allSupervisors.length > 1 ? (
        <div className="mb-6 border-2 border-yellow-500 rounded-lg p-4 text-center">
          <label className="block text-sm text-gray-300 mb-1">
            <span className="text-yellow-500 font-bold">[DEMO]</span> Switch supervisor:
          </label>
          <select
            value={currentUser?.id || ""}
            onChange={(e) => handleSupervisorChange(e.target.value)}
            className="bg-gray-800 border border-gray-600 rounded-lg px-4 py-2 text-white max-w-xs"
          >
            {allSupervisors.map((supervisor) => (
              <option key={supervisor.id} value={supervisor.id}>
                {supervisor.displayName}
              </option>
            ))}
          </select>
        </div>
      ) : currentUser ? (
        <div className="mb-6">
          <p className="text-sm text-gray-400">
            Logged in as: <span className="text-white">{currentUser.displayName}</span>
          </p>
        </div>
      ) : null}

      {/* Error display */}
      {error && (
        <div className="mb-4 p-3 bg-red-500/20 border border-red-500 rounded-lg text-red-300">
          {error}
          <button
            onClick={() => setError(null)}
            className="ml-4 text-red-400 hover:text-red-200"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-gray-700 mb-6">
        <button
          onClick={() => setActiveTab("scenarios")}
          className={`px-4 py-2 font-marfa font-medium transition-colors
                     ${
                       activeTab === "scenarios"
                         ? "text-brand-orange border-b-2 border-brand-orange"
                         : "text-gray-400 hover:text-white"
                     }`}
        >
          Scenarios
        </button>
        <button
          onClick={() => setActiveTab("assignments")}
          className={`px-4 py-2 font-marfa font-medium transition-colors
                     ${
                       activeTab === "assignments"
                         ? "text-brand-orange border-b-2 border-brand-orange"
                         : "text-gray-400 hover:text-white"
                     }`}
        >
          Assignments
        </button>
        <button
          onClick={() => setActiveTab("flags")}
          className={`px-4 py-2 font-marfa font-medium transition-colors flex items-center gap-2
                     ${
                       activeTab === "flags"
                         ? "text-brand-orange border-b-2 border-brand-orange"
                         : "text-gray-400 hover:text-white"
                     }`}
        >
          Flags
          {pendingFlagCount > 0 && (
            <span className="bg-red-500 text-white text-xs font-bold px-1.5 py-0.5 rounded-full min-w-[20px] text-center">
              {pendingFlagCount}
            </span>
          )}
        </button>
      </div>

      {/* Scenarios Tab */}
      {activeTab === "scenarios" && currentUser && (
        <ScenarioTab
          authFetch={authFetch}
          userId={currentUser.id}
          learners={learners}
          accounts={accounts}
          categoryFilter={categoryFilter}
          onScenariosChanged={loadGlobalScenarios}
          onAccountsChanged={loadAccounts}
        />
      )}

      {/* Assignments Tab */}
      {activeTab === "assignments" && currentUser && (
        <AssignmentTab
          authFetch={authFetch}
          learners={learners}
          globalScenarios={globalScenarios}
          categoryFilter={categoryFilter}
          setCategoryFilter={setCategoryFilter}
        />
      )}

      {/* Flags Tab */}
      {activeTab === "flags" && (
        <div>
          {flagsLoading ? (
            <p className="text-gray-400">Loading flags...</p>
          ) : flags.length === 0 ? (
            <p className="text-gray-400">No pending flags. All clear!</p>
          ) : (
            <div className="space-y-3">
              {flags.map((flag) => {
                const severity = SEVERITY_STYLES[flag.severity] || SEVERITY_STYLES.info;
                return (
                  <div
                    key={flag.id}
                    className="bg-brand-navy border border-gray-700 rounded-lg p-4"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-grow">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`text-xs px-2 py-0.5 rounded ${severity.bg} ${severity.text}`}>
                            {severity.label}
                          </span>
                          <span className="text-xs px-2 py-0.5 rounded bg-gray-600 text-gray-300">
                            {FLAG_TYPE_LABELS[flag.type] || flag.type}
                          </span>
                        </div>
                        <p className="text-white text-sm font-marfa mt-1">{flag.details}</p>
                        <div className="flex items-center gap-3 mt-2 text-xs text-gray-500">
                          <span>
                            Scenario: {flag.session?.scenario?.title || "Free Practice"}
                          </span>
                          <span>
                            Learner: {flag.session?.user?.displayName || "Unknown"}
                          </span>
                          <span>
                            {flag.session?.modelType === "phone" ? "Voice" : "Chat"}
                          </span>
                          <span>{formatDate(flag.createdAt)}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

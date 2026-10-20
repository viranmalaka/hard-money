"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { ArrowLeft, Users, UserPlus, Shield, Trash2, ArrowRightLeft, LogOut, Check } from "lucide-react";
import { useSync } from "@/components/sync-provider";

interface Member {
  id: string;
  householdId: string;
  userId: string;
  role: "OWNER" | "CO_OWNER" | "CONTRIBUTOR_ADD_ONLY" | "VIEWER";
  createdAt: string;
  user: {
    id: string;
    name: string;
    email: string;
  };
}

interface Household {
  id: string;
  name: string;
  ownerId: string;
  isOwner: boolean;
  myRole: "OWNER" | "CO_OWNER" | "CONTRIBUTOR_ADD_ONLY" | "VIEWER";
  createdAt: string;
  members: Member[];
}

export default function HouseholdPage() {
  const { sync, userId } = useSync();
  const [households, setHouseholds] = useState<Household[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Create household state
  const [newHouseholdName, setNewHouseholdName] = useState("");
  const [creating, setCreating] = useState(false);

  // Invite member state
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"CO_OWNER" | "CONTRIBUTOR_ADD_ONLY" | "VIEWER">("CO_OWNER");
  const [inviting, setInviting] = useState(false);

  // Mobile bottom-sheet role picker state
  const [selectedMemberForSheet, setSelectedMemberForSheet] = useState<Member | null>(null);

  const fetchHouseholds = async () => {
    try {
      const res = await fetch("/api/households", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setHouseholds(data.households || []);
      }
    } catch (err: unknown) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetch("/api/households", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.households) {
          setHouseholds(data.households);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const triggerSync = async () => {
    await sync();
  };

  const handleCreateHousehold = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newHouseholdName.trim()) return;
    setCreating(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch("/api/households", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newHouseholdName.trim() }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to create household");
      }
      setNewHouseholdName("");
      setSuccess("Household created successfully");
      await fetchHouseholds();
      await triggerSync();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to create household");
    } finally {
      setCreating(false);
    }
  };

  const handleInviteMember = async (householdId: string, e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail.trim()) return;
    setInviting(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch(`/api/households/${householdId}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: inviteEmail.trim(), role: inviteRole }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to invite member");
      }
      setInviteEmail("");
      setSuccess("Member added successfully");
      await fetchHouseholds();
      await triggerSync();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to invite member");
    } finally {
      setInviting(false);
    }
  };

  const handleChangeRole = async (householdId: string, memberId: string, newRole: string) => {
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch(`/api/households/${householdId}/members/${memberId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: newRole }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to change role");
      }
      setSuccess("Member role updated");
      setSelectedMemberForSheet(null);
      await fetchHouseholds();
      await triggerSync();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to change role");
    }
  };

  const handleRemoveMember = async (householdId: string, memberId: string) => {
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch(`/api/households/${householdId}/members/${memberId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to remove member");
      }
      setSuccess("Member removed");
      await fetchHouseholds();
      await triggerSync();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to remove member");
    }
  };

  const handleLeaveHousehold = async (household: Household) => {
    setError(null);
    setSuccess(null);

    if (household.isOwner && household.members.length > 1) {
      setError("Owner cannot leave without transferring ownership first");
      return;
    }

    const myMember = household.members.find((m) => m.userId === userId);
    if (!myMember) return;

    try {
      const res = await fetch(`/api/households/${household.id}/members/${myMember.id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to leave household");
      }
      setSuccess("You have left the household");
      await fetchHouseholds();
      await triggerSync();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to leave household");
    }
  };

  const handleTransferOwnership = async (householdId: string, targetUserId: string) => {
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch(`/api/households/${householdId}/transfer-ownership`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newOwnerId: targetUserId }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to transfer ownership");
      }
      setSuccess("Ownership transferred successfully");
      await fetchHouseholds();
      await triggerSync();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to transfer ownership");
    }
  };

  const activeHousehold = households[0] || null;

  return (
    <main className="flex-1 max-w-4xl mx-auto w-full px-4 py-4 space-y-5">
      <div className="flex items-center gap-3">
        <Link
          href="/more" transitionTypes={["nav-back"]}
          className="p-1 rounded hover:bg-[var(--surface-hover)] text-[var(--text-muted)] hover:text-[var(--text)] transition-colors"
        >
          <ArrowLeft size={18} />
        </Link>
        <div>
          <h1 className="text-base font-semibold tracking-tight text-[var(--text)] flex items-center gap-2">
            <Users size={18} className="text-[var(--accent)]" />
            <span>Household Collaboration</span>
          </h1>
          <p className="text-xs text-[var(--text-muted)]">
            Share finances with family members with granular role privacy.
          </p>
        </div>
      </div>

      {error && (
        <div className="p-3 rounded bg-[var(--expense)]/10 border border-[var(--expense)]/30 text-xs text-[var(--expense)]">
          {error}
        </div>
      )}

      {success && (
        <div className="p-3 rounded bg-[var(--income)]/10 border border-[var(--income)]/30 text-xs text-[var(--income)] flex items-center gap-1.5">
          <Check size={14} />
          <span>{success}</span>
        </div>
      )}

      {loading ? (
        <div className="p-8 text-center text-xs text-[var(--text-muted)]">Loading household data...</div>
      ) : !activeHousehold ? (
        /* Create Household Form */
        <div className="flat-card p-5 space-y-4">
          <div className="space-y-1">
            <h2 className="text-sm font-semibold text-[var(--text)]">Create a Household</h2>
            <p className="text-xs text-[var(--text-muted)]">
              Start sharing accounts and budgets with family members. You will be the household OWNER.
            </p>
          </div>

          <form onSubmit={handleCreateHousehold} className="space-y-3">
            <div>
              <label
                htmlFor="household-name-input"
                className="block text-xs font-medium text-[var(--text-muted)] mb-1"
              >
                Household Name
              </label>
              <input
                id="household-name-input"
                data-testid="household-name-input"
                type="text"
                value={newHouseholdName}
                onChange={(e) => setNewHouseholdName(e.target.value)}
                placeholder="e.g. Silva Family Treasury"
                className="w-full h-9 px-3 rounded bg-[var(--bg)] border border-hairline text-xs text-[var(--text)] focus:outline-none focus:border-[var(--accent)]"
              />
            </div>

            <button
              type="submit"
              data-testid="household-create-btn"
              disabled={creating || !newHouseholdName.trim()}
              className="px-4 py-2 rounded bg-[var(--accent)] text-white text-xs font-semibold hover:opacity-90 active:scale-95 transition-all disabled:opacity-50"
            >
              {creating ? "Creating..." : "Create Household"}
            </button>
          </form>
        </div>
      ) : (
        /* Household Overview & Member Management */
        <div className="space-y-5">
          <div className="flat-card p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <span data-testid="household-name" className="text-sm font-semibold text-[var(--text)]">
                  {activeHousehold.name}
                </span>
                <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-[var(--accent)]/15 text-[var(--accent)] border border-[var(--accent)]/30">
                  My Role: {activeHousehold.myRole}
                </span>
              </div>
              <p className="text-xs text-[var(--text-muted)] mt-0.5">
                {activeHousehold.members.length} {activeHousehold.members.length === 1 ? "member" : "members"}
              </p>
            </div>

            <button
              type="button"
              data-testid="household-leave-btn"
              onClick={() => handleLeaveHousehold(activeHousehold)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded border border-hairline hover:bg-[var(--expense)]/10 text-[var(--expense)] text-xs font-medium transition-colors self-start sm:self-auto"
            >
              <LogOut size={13} />
              <span>Leave Household</span>
            </button>
          </div>

          {/* Members List */}
          <div className="space-y-2">
            <span className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider px-1">
              Household Members
            </span>

            <div
              data-testid="household-member-list"
              className="flat-card divide-y divide-hairline overflow-hidden"
            >
              {activeHousehold.members.map((member) => {
                const isSelf = member.userId === userId;
                const canManageRoles =
                  (activeHousehold.myRole === "OWNER" || activeHousehold.myRole === "CO_OWNER") &&
                  member.role !== "OWNER";
                const canTransfer = activeHousehold.isOwner && !isSelf;
                const canRemove =
                  (activeHousehold.myRole === "OWNER" ||
                    (activeHousehold.myRole === "CO_OWNER" && member.role !== "OWNER")) &&
                  !isSelf;

                return (
                  <div
                    key={member.id}
                    data-testid="household-member-row"
                    className="p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-[var(--surface-hover)] border border-hairline flex items-center justify-center text-xs font-semibold text-[var(--text)]">
                        {member.user.name ? member.user.name.charAt(0).toUpperCase() : "U"}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold text-[var(--text)]">
                            {member.user.name}
                          </span>
                          {isSelf && (
                            <span className="text-[10px] text-[var(--text-muted)]">(You)</span>
                          )}
                          <span
                            data-testid="member-role-badge"
                            className="px-1.5 py-0.2 rounded text-[10px] font-mono font-medium bg-[var(--surface-hover)] text-[var(--text-muted)] border border-hairline"
                          >
                            {member.role}
                          </span>
                        </div>
                        <p className="text-[11px] text-[var(--text-muted)]">{member.user.email}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 self-end sm:self-auto">
                      {/* Desktop Role Selector */}
                      {canManageRoles ? (
                        <>
                          <div className="hidden sm:block">
                            <select
                              data-testid="member-role-select"
                              value={member.role}
                              onChange={(e) =>
                                handleChangeRole(activeHousehold.id, member.id, e.target.value)
                              }
                              className="h-7 px-2 rounded bg-[var(--bg)] border border-hairline text-xs text-[var(--text)] focus:outline-none focus:border-[var(--accent)]"
                            >
                              <option value="CO_OWNER">CO_OWNER</option>
                              <option value="CONTRIBUTOR_ADD_ONLY">CONTRIBUTOR_ADD_ONLY</option>
                              <option value="VIEWER">VIEWER</option>
                            </select>
                          </div>

                          {/* Mobile button to open bottom-sheet role picker */}
                          <div className="sm:hidden">
                            <button
                              type="button"
                              data-testid="member-role-sheet-btn"
                              onClick={() => setSelectedMemberForSheet(member)}
                              className="h-7 px-2.5 rounded bg-[var(--surface-hover)] border border-hairline text-xs font-medium text-[var(--text)]"
                            >
                              Role: {member.role}
                            </button>
                          </div>
                        </>
                      ) : null}

                      {/* Transfer Ownership Button */}
                      {canTransfer && (
                        <button
                          type="button"
                          data-testid="member-transfer-btn"
                          title="Transfer Ownership"
                          onClick={() =>
                            handleTransferOwnership(activeHousehold.id, member.userId)
                          }
                          className="h-7 px-2 rounded border border-hairline hover:bg-surface text-xs font-medium text-[var(--text)] flex items-center gap-1"
                        >
                          <ArrowRightLeft size={12} />
                          <span className="hidden sm:inline">Transfer</span>
                        </button>
                      )}

                      {/* Remove Member Button */}
                      {canRemove && (
                        <button
                          type="button"
                          data-testid="member-remove-btn"
                          title="Remove Member"
                          onClick={() => handleRemoveMember(activeHousehold.id, member.id)}
                          className="h-7 px-2 rounded border border-hairline hover:bg-[var(--expense)]/10 text-xs font-medium text-[var(--expense)] flex items-center gap-1"
                        >
                          <Trash2 size={12} />
                          <span className="hidden sm:inline">Remove</span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Add / Invite Member (Visible to OWNER & CO_OWNER) */}
          {(activeHousehold.myRole === "OWNER" || activeHousehold.myRole === "CO_OWNER") && (
            <div className="space-y-2">
              <span className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider px-1">
                Add Household Member
              </span>

              <form
                onSubmit={(e) => handleInviteMember(activeHousehold.id, e)}
                className="flat-card p-4 space-y-3"
              >
                <p className="text-xs text-[var(--text-muted)]">
                  Enter a registered user&apos;s email address to assign them a role directly.
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="sm:col-span-2 space-y-1">
                    <label
                      htmlFor="household-invite-email"
                      className="block text-xs font-medium text-[var(--text-muted)]"
                    >
                      User Email
                    </label>
                    <input
                      id="household-invite-email"
                      data-testid="household-invite-email"
                      type="email"
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                      placeholder="e.g. spouse@example.com"
                      className="w-full h-8 px-2.5 rounded bg-[var(--bg)] border border-hairline text-xs text-[var(--text)] focus:outline-none focus:border-[var(--accent)]"
                    />
                  </div>

                  <div className="space-y-1">
                    <label
                      htmlFor="household-invite-role"
                      className="block text-xs font-medium text-[var(--text-muted)]"
                    >
                      Assigned Role
                    </label>
                    <select
                      id="household-invite-role"
                      data-testid="household-invite-role"
                      value={inviteRole}
                      onChange={(e) =>
                        setInviteRole(
                          e.target.value as "CO_OWNER" | "CONTRIBUTOR_ADD_ONLY" | "VIEWER"
                        )
                      }
                      className="w-full h-8 px-2.5 rounded bg-[var(--bg)] border border-hairline text-xs text-[var(--text)] focus:outline-none focus:border-[var(--accent)]"
                    >
                      <option value="CO_OWNER">CO_OWNER (Full Read/Write)</option>
                      <option value="CONTRIBUTOR_ADD_ONLY">
                        CONTRIBUTOR_ADD_ONLY (Add Only, No Balances)
                      </option>
                      <option value="VIEWER">VIEWER (Read-Only)</option>
                    </select>
                  </div>
                </div>

                <button
                  type="submit"
                  data-testid="household-invite-btn"
                  disabled={inviting || !inviteEmail.trim()}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-[var(--accent)] text-white text-xs font-semibold hover:opacity-90 active:scale-95 transition-all disabled:opacity-50"
                >
                  <UserPlus size={14} />
                  <span>{inviting ? "Adding..." : "Add Member"}</span>
                </button>
              </form>
            </div>
          )}

          {/* Capability Matrix Reference Card */}
          <div className="p-4 rounded bg-[var(--surface-hover)]/30 border border-hairline space-y-2">
            <span className="text-xs font-semibold text-[var(--text)] flex items-center gap-1.5">
              <Shield size={14} className="text-[var(--accent)]" />
              <span>Role Permissions & Privacy</span>
            </span>
            <ul className="text-[11px] text-[var(--text-muted)] space-y-1 leading-relaxed list-disc list-inside">
              <li>
                <strong>OWNER / CO_OWNER:</strong> Full read & write on shared accounts, transactions,
                FDs, loans, and budgets.
              </li>
              <li>
                <strong>VIEWER:</strong> Read-only access to shared finances. Write mutations are
                blocked.
              </li>
              <li>
                <strong>CONTRIBUTOR_ADD_ONLY:</strong> Can record transactions on shared accounts, but
                never sees account balances, opening balances, or other members&apos; transactions.
              </li>
            </ul>
          </div>
        </div>
      )}

      {/* Mobile Bottom-Sheet Role Picker */}
      {selectedMemberForSheet && activeHousehold && (
        <div
          data-testid="member-role-sheet"
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 overflow-y-auto"
          onClick={() => setSelectedMemberForSheet(null)}
        >
          <div
            className="w-full max-w-lg bg-[var(--surface)] border-t border-hairline rounded-t-xl p-4 pb-sheet-safe md:pb-4 space-y-3 animate-in slide-in-from-bottom modal-sheet-dialog overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-[var(--text)]">
                Assign Role to {selectedMemberForSheet.user.name}
              </span>
              <button
                type="button"
                onClick={() => setSelectedMemberForSheet(null)}
                className="text-xs text-[var(--text-muted)]"
              >
                Close
              </button>
            </div>

            <div className="space-y-1.5">
              {(["CO_OWNER", "CONTRIBUTOR_ADD_ONLY", "VIEWER"] as const).map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() =>
                    handleChangeRole(activeHousehold.id, selectedMemberForSheet.id, r)
                  }
                  className={`w-full p-2.5 rounded text-left text-xs font-medium border flex items-center justify-between transition-colors ${
                    selectedMemberForSheet.role === r
                      ? "border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]"
                      : "border-hairline bg-[var(--bg)] text-[var(--text)] hover:bg-[var(--surface-hover)]"
                  }`}
                >
                  <span>{r}</span>
                  {selectedMemberForSheet.role === r && <Check size={14} />}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

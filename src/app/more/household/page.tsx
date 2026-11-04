"use client";

import React, { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Users, UserPlus, Shield, Trash2, ArrowRightLeft, LogOut, Check, X } from "lucide-react";
import { AppHeader } from "@/components/navigation/app-header";
import { useSync } from "@/components/sync-provider";
import { queryKeys } from "@/lib/api/query-keys";
import {
  createHousehold,
  inviteMember,
  listHouseholds,
  removeMember,
  transferOwnership,
  updateMemberRole,
} from "@/services/household-service";
import { ConfirmationModal } from "@/components/ui/confirmation-modal";

type Member = import("@/services/household-service").HouseholdMember;
type Household = import("@/services/household-service").Household;

export default function HouseholdPage() {
  const { sync, userId } = useSync();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    confirmText: string;
    variant: "danger" | "warning";
    onConfirm: () => Promise<void>;
  }>({
    isOpen: false,
    title: "",
    message: "",
    confirmText: "Confirm",
    variant: "danger",
    onConfirm: async () => {},
  });

  const [newHouseholdName, setNewHouseholdName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"CO_OWNER" | "CONTRIBUTOR_ADD_ONLY" | "VIEWER">("CO_OWNER");
  const [selectedMemberForSheet, setSelectedMemberForSheet] = useState<Member | null>(null);

  const queryClient = useQueryClient();
  const householdsQuery = useQuery({
    queryKey: queryKeys.households.all(),
    queryFn: listHouseholds,
  });
  const households = householdsQuery.data ?? [];
  const loading = householdsQuery.isLoading;

  const invalidateHouseholds = async () => {
    await queryClient.invalidateQueries({ queryKey: queryKeys.households.all() });
    await sync();
  };

  const createMutation = useMutation({
    mutationFn: createHousehold,
    onSuccess: invalidateHouseholds,
  });
  const inviteMutation = useMutation({
    mutationFn: ({ householdId, email, role }: { householdId: string; email: string; role: Exclude<Household["myRole"], "OWNER"> }) =>
      inviteMember(householdId, { email, role }),
    onSuccess: invalidateHouseholds,
  });
  const roleMutation = useMutation({
    mutationFn: ({ householdId, memberId, role }: { householdId: string; memberId: string; role: Exclude<Household["myRole"], "OWNER"> }) =>
      updateMemberRole(householdId, memberId, role),
    onMutate: async ({ householdId, memberId, role }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.households.all() });
      const previous = queryClient.getQueryData<Household[]>(queryKeys.households.all());
      queryClient.setQueryData<Household[]>(queryKeys.households.all(), (current = []) =>
        current.map((household) =>
          household.id !== householdId
            ? household
            : {
                ...household,
                members: household.members.map((member) =>
                  member.id === memberId ? { ...member, role } : member
                ),
              }
        )
      );
      return { previous };
    },
    onError: (_error, _variables, context) => {
      if (context?.previous) queryClient.setQueryData(queryKeys.households.all(), context.previous);
    },
    onSettled: invalidateHouseholds,
  });
  const removeMutation = useMutation({
    mutationFn: ({ householdId, memberId }: { householdId: string; memberId: string }) =>
      removeMember(householdId, memberId),
    onMutate: async ({ householdId, memberId }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.households.all() });
      const previous = queryClient.getQueryData<Household[]>(queryKeys.households.all());
      queryClient.setQueryData<Household[]>(queryKeys.households.all(), (current = []) =>
        current.map((household) =>
          household.id !== householdId
            ? household
            : { ...household, members: household.members.filter((member) => member.id !== memberId) }
        )
      );
      return { previous };
    },
    onError: (_error, _variables, context) => {
      if (context?.previous) queryClient.setQueryData(queryKeys.households.all(), context.previous);
    },
    onSettled: invalidateHouseholds,
  });
  const transferMutation = useMutation({
    mutationFn: ({ householdId, newOwnerId }: { householdId: string; newOwnerId: string }) =>
      transferOwnership(householdId, newOwnerId),
    onSuccess: invalidateHouseholds,
  });
  const creating = createMutation.isPending;
  const inviting = inviteMutation.isPending;

  const handleCreateHousehold = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newHouseholdName.trim()) return;
    setError(null);
    createMutation.reset();
    setSuccess(null);

    try {
      await createMutation.mutateAsync(newHouseholdName.trim());
      setNewHouseholdName("");
      setSuccess("Household created successfully");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to create household");
    }
  };

  const handleInviteMember = async (householdId: string, e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail.trim()) return;
    setError(null);
    setSuccess(null);

    try {
      await inviteMutation.mutateAsync({ householdId, email: inviteEmail.trim(), role: inviteRole });
      setInviteEmail("");
      setSuccess("Member added successfully");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to invite member");
    }
  };

  const handleChangeRole = async (householdId: string, memberId: string, newRole: string) => {
    setError(null);
    setSuccess(null);

    try {
      await roleMutation.mutateAsync({ householdId, memberId, role: newRole as Exclude<Household["myRole"], "OWNER"> });
      setSuccess("Member role updated");
      setSelectedMemberForSheet(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to change role");
    }
  };

  const handleRemoveMember = async (householdId: string, memberId: string) => {
    setError(null);
    setSuccess(null);

    try {
      await removeMutation.mutateAsync({ householdId, memberId });
      setSuccess("Member removed");
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
      await removeMutation.mutateAsync({ householdId: household.id, memberId: myMember.id });
      setSuccess("You have left the household");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to leave household");
    }
  };

  const handleTransferOwnership = async (householdId: string, targetUserId: string) => {
    setError(null);
    setSuccess(null);

    try {
      await transferMutation.mutateAsync({ householdId, newOwnerId: targetUserId });
      setSuccess("Ownership transferred successfully");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to transfer ownership");
    }
  };

  const promptTransferOwnership = (householdId: string, targetUserId: string) => {
    setConfirmModal({
      isOpen: true,
      title: "Transfer Household Ownership",
      message:
        "Are you sure you want to transfer ownership to this member? You will lose Owner privileges and will no longer be able to manage household settings or delete the household.",
      confirmText: "Transfer Ownership",
      variant: "warning",
      onConfirm: async () => {
        await handleTransferOwnership(householdId, targetUserId);
      },
    });
  };

  const promptRemoveMember = (householdId: string, memberId: string) => {
    setConfirmModal({
      isOpen: true,
      title: "Remove Member",
      message:
        "Are you sure you want to remove this member from the household? They will immediately lose access to shared accounts and transactions.",
      confirmText: "Remove Member",
      variant: "danger",
      onConfirm: async () => {
        await handleRemoveMember(householdId, memberId);
      },
    });
  };

  const promptLeaveHousehold = (household: Household) => {
    if (household.isOwner && household.members.length > 1) {
      setError("Owner cannot leave without transferring ownership first");
      return;
    }
    setConfirmModal({
      isOpen: true,
      title: "Leave Household",
      message:
        "Are you sure you want to leave this household? You will lose access to all shared household transactions and accounts.",
      confirmText: "Leave Household",
      variant: "danger",
      onConfirm: async () => {
        await handleLeaveHousehold(household);
      },
    });
  };

  const activeHousehold = households[0] || null;

  return (
    <main className="flex-1 max-w-4xl mx-auto w-full px-5 sm:px-7 pt-4 sm:pt-6 pb-8 space-y-6">
      <AppHeader
        title="Household Collaboration"
        subtitle="Shared Family Treasury & Granular Roles"
        backHref="/more"
        backLabel="Back to More"
      />

      {error && (
        <div className="p-4 rounded-2xl bg-[var(--expense)]/10 border border-[var(--expense)]/30 text-xs font-medium text-[var(--expense)]">
          {error}
        </div>
      )}

      {success && (
        <div className="p-4 rounded-2xl bg-[var(--income)]/10 border border-[var(--income)]/30 text-xs font-semibold text-[var(--income)] flex items-center gap-2">
          <Check size={16} />
          <span>{success}</span>
        </div>
      )}

      {loading ? (
        <div className="rounded-3xl bg-[var(--surface)] border border-[var(--border)] p-10 text-center text-xs text-[var(--text-muted)]">
          Loading household data...
        </div>
      ) : !activeHousehold ? (
        /* Create Household Form */
        <div className="rounded-3xl bg-[var(--surface)] border border-[var(--border)] p-5 sm:p-6 space-y-5 shadow-xs">
          <div className="flex items-start gap-3.5">
            <div className="w-11 h-11 rounded-2xl bg-[var(--accent)]/12 border border-[var(--accent)]/25 flex items-center justify-center text-[var(--accent)] shrink-0">
              <Users size={20} />
            </div>
            <div className="space-y-1">
              <h2 className="text-base font-bold text-[var(--text)]">Create a Household</h2>
              <p className="text-xs text-[var(--text-muted)] leading-relaxed">
                Start sharing accounts and budgets with family members. You will be the household OWNER.
              </p>
            </div>
          </div>

          <form onSubmit={handleCreateHousehold} className="space-y-4">
            <div className="space-y-1.5">
              <label
                htmlFor="household-name-input"
                className="block text-xs font-semibold text-[var(--text-muted)]"
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
                className="w-full h-12 px-4 rounded-2xl bg-[var(--bg)] border border-[var(--border)] text-sm text-[var(--text)] focus:outline-none focus:border-[var(--accent)]"
              />
            </div>

            <button
              type="submit"
              data-testid="household-create-btn"
              disabled={creating || !newHouseholdName.trim()}
              className="h-11 px-5 rounded-2xl bg-[var(--accent)] text-white text-xs font-bold hover:opacity-95 active:scale-[0.98] transition-all disabled:opacity-50 cursor-pointer"
            >
              {creating ? "Creating..." : "Create Household"}
            </button>
          </form>
        </div>
      ) : (
        /* Household Overview & Member Management */
        <div className="space-y-6">
          <div className="rounded-3xl bg-[var(--surface)] border border-[var(--border)] p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-xs">
            <div className="flex items-center gap-3.5 min-w-0">
              <div className="w-12 h-12 rounded-2xl bg-[var(--accent)]/12 border border-[var(--accent)]/25 flex items-center justify-center text-[var(--accent)] shrink-0">
                <Users size={21} />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2.5 flex-wrap">
                  <span data-testid="household-name" className="text-base font-bold text-[var(--text)]">
                    {activeHousehold.name}
                  </span>
                  <span className="px-2.5 py-0.5 rounded-full text-2xs font-bold bg-[var(--accent)]/15 text-[var(--accent)] border border-[var(--accent)]/30">
                    My Role: {activeHousehold.myRole}
                  </span>
                </div>
                <p className="text-xs text-[var(--text-muted)] mt-0.5">
                  {activeHousehold.members.length}{" "}
                  {activeHousehold.members.length === 1 ? "member" : "members"}
                </p>
              </div>
            </div>

            <button
              type="button"
              data-testid="household-leave-btn"
              onClick={() => promptLeaveHousehold(activeHousehold)}
              className="h-11 px-4 inline-flex items-center justify-center gap-2 rounded-2xl border border-[var(--expense)]/25 bg-[var(--expense)]/8 hover:bg-[var(--expense)]/15 text-[var(--expense)] text-xs font-semibold transition-colors self-start sm:self-auto cursor-pointer shrink-0"
            >
              <LogOut size={15} />
              <span>Leave Household</span>
            </button>
          </div>

          {/* Members List */}
          <section className="space-y-2.5">
            <h2 className="text-2xs font-bold text-[var(--text-muted)] uppercase tracking-wider px-1">
              Household Members
            </h2>

            <div
              data-testid="household-member-list"
              className="rounded-3xl bg-[var(--surface)] border border-[var(--border)] divide-y divide-[var(--border)] overflow-hidden shadow-xs"
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
                    className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                  >
                    <div className="flex items-center gap-3.5 min-w-0">
                      <div className="w-10 h-10 rounded-2xl bg-[var(--bg)] border border-[var(--border)] flex items-center justify-center text-xs font-bold text-[var(--accent)] shrink-0">
                        {member.user.name ? member.user.name.charAt(0).toUpperCase() : "U"}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-bold text-[var(--text)]">
                            {member.user.name}
                          </span>
                          {isSelf && (
                            <span className="text-2xs font-medium text-[var(--text-muted)]">
                              (You)
                            </span>
                          )}
                          <span
                            data-testid="member-role-badge"
                            className="px-2 py-0.5 rounded-full text-2xs font-mono font-semibold bg-[var(--bg)] text-[var(--text-muted)] border border-[var(--border)]"
                          >
                            {member.role}
                          </span>
                        </div>
                        <p className="text-xs text-[var(--text-muted)] truncate mt-0.5">
                          {member.user.email}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 self-end sm:self-auto flex-wrap">
                      {canManageRoles ? (
                        <>
                          <div className="hidden sm:block">
                            <select
                              data-testid="member-role-select"
                              value={member.role}
                              onChange={(e) =>
                                handleChangeRole(activeHousehold.id, member.id, e.target.value)
                              }
                              className="h-9 px-3 rounded-xl bg-[var(--bg)] border border-[var(--border)] text-xs font-medium text-[var(--text)] focus:outline-none focus:border-[var(--accent)]"
                            >
                              <option value="CO_OWNER">CO_OWNER</option>
                              <option value="CONTRIBUTOR_ADD_ONLY">CONTRIBUTOR_ADD_ONLY</option>
                              <option value="VIEWER">VIEWER</option>
                            </select>
                          </div>

                          <div className="sm:hidden">
                            <button
                              type="button"
                              data-testid="member-role-sheet-btn"
                              onClick={() => setSelectedMemberForSheet(member)}
                              className="h-9 px-3 rounded-xl bg-[var(--bg)] border border-[var(--border)] text-xs font-semibold text-[var(--text)] cursor-pointer"
                            >
                              Role: {member.role}
                            </button>
                          </div>
                        </>
                      ) : null}

                      {canTransfer && (
                        <button
                          type="button"
                          data-testid="member-transfer-btn"
                          title="Transfer Ownership"
                          onClick={() =>
                            promptTransferOwnership(activeHousehold.id, member.userId)
                          }
                          className="h-9 px-3 rounded-xl border border-[var(--border)] bg-[var(--bg)] hover:bg-[var(--surface-hover)] text-xs font-semibold text-[var(--text)] inline-flex items-center gap-1.5 cursor-pointer"
                        >
                          <ArrowRightLeft size={13} />
                          <span className="hidden sm:inline">Transfer</span>
                        </button>
                      )}

                      {canRemove && (
                        <button
                          type="button"
                          data-testid="member-remove-btn"
                          title="Remove Member"
                          onClick={() => promptRemoveMember(activeHousehold.id, member.id)}
                          className="h-9 px-3 rounded-xl border border-[var(--expense)]/25 bg-[var(--expense)]/8 hover:bg-[var(--expense)]/15 text-xs font-semibold text-[var(--expense)] inline-flex items-center gap-1.5 cursor-pointer"
                        >
                          <Trash2 size={13} />
                          <span className="hidden sm:inline">Remove</span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Add / Invite Member */}
          {(activeHousehold.myRole === "OWNER" || activeHousehold.myRole === "CO_OWNER") && (
            <section className="space-y-2.5">
              <h2 className="text-2xs font-bold text-[var(--text-muted)] uppercase tracking-wider px-1">
                Add Household Member
              </h2>

              <form
                onSubmit={(e) => handleInviteMember(activeHousehold.id, e)}
                className="rounded-3xl bg-[var(--surface)] border border-[var(--border)] p-5 sm:p-6 space-y-4 shadow-xs"
              >
                <p className="text-xs text-[var(--text-muted)] leading-relaxed">
                  Enter a registered user&apos;s email address to assign them a role directly.
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="sm:col-span-2 space-y-1.5">
                    <label
                      htmlFor="household-invite-email"
                      className="block text-xs font-semibold text-[var(--text-muted)]"
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
                      className="w-full h-12 px-4 rounded-2xl bg-[var(--bg)] border border-[var(--border)] text-sm text-[var(--text)] focus:outline-none focus:border-[var(--accent)]"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label
                      htmlFor="household-invite-role"
                      className="block text-xs font-semibold text-[var(--text-muted)]"
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
                      className="w-full h-12 px-4 rounded-2xl bg-[var(--bg)] border border-[var(--border)] text-xs font-medium text-[var(--text)] focus:outline-none focus:border-[var(--accent)]"
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
                  className="h-11 px-5 inline-flex items-center gap-2 rounded-2xl bg-[var(--accent)] text-white text-xs font-bold hover:opacity-95 active:scale-[0.98] transition-all disabled:opacity-50 cursor-pointer"
                >
                  <UserPlus size={15} />
                  <span>{inviting ? "Adding..." : "Add Member"}</span>
                </button>
              </form>
            </section>
          )}

          {/* Capability Matrix Reference Card */}
          <div className="p-5 rounded-3xl bg-[var(--surface)] border border-[var(--border)] space-y-2.5 shadow-xs">
            <span className="text-xs font-bold text-[var(--text)] flex items-center gap-2">
              <Shield size={16} className="text-[var(--accent)]" />
              <span>Role Permissions & Privacy</span>
            </span>
            <ul className="text-xs text-[var(--text-muted)] space-y-1.5 leading-relaxed list-disc list-inside">
              <li>
                <strong className="text-[var(--text)]">OWNER / CO_OWNER:</strong> Full read & write
                on shared accounts, transactions, FDs, loans, and budgets.
              </li>
              <li>
                <strong className="text-[var(--text)]">VIEWER:</strong> Read-only access to shared
                finances. Write mutations are blocked.
              </li>
              <li>
                <strong className="text-[var(--text)]">CONTRIBUTOR_ADD_ONLY:</strong> Can record
                transactions on shared accounts, but never sees account balances, opening balances,
                or other members&apos; transactions.
              </li>
            </ul>
          </div>
        </div>
      )}

      {/* Mobile Bottom-Sheet Role Picker */}
      {selectedMemberForSheet && activeHousehold && (
        <div
          data-testid="member-role-sheet"
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-xs overflow-y-auto"
          onClick={() => setSelectedMemberForSheet(null)}
        >
          <div
            className="w-full max-w-lg bg-[var(--surface)] border-t border-[var(--border)] rounded-t-3xl p-5 pb-sheet-safe md:pb-5 space-y-4 animate-in slide-in-from-bottom modal-sheet-dialog overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold text-[var(--text)]">
                Assign Role to {selectedMemberForSheet.user.name}
              </span>
              <button
                type="button"
                onClick={() => setSelectedMemberForSheet(null)}
                className="w-9 h-9 rounded-xl flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--bg)] cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-2">
              {(["CO_OWNER", "CONTRIBUTOR_ADD_ONLY", "VIEWER"] as const).map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() =>
                    handleChangeRole(activeHousehold.id, selectedMemberForSheet.id, r)
                  }
                  className={`w-full p-3.5 rounded-2xl text-left text-xs font-bold border flex items-center justify-between transition-colors cursor-pointer ${
                    selectedMemberForSheet.role === r
                      ? "border-[var(--accent)] bg-[var(--accent)]/12 text-[var(--accent)]"
                      : "border-[var(--border)] bg-[var(--bg)] text-[var(--text)] hover:bg-[var(--surface-hover)]"
                  }`}
                >
                  <span>{r}</span>
                  {selectedMemberForSheet.role === r && <Check size={16} />}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      <ConfirmationModal
        isOpen={confirmModal.isOpen}
        onClose={() => setConfirmModal((prev) => ({ ...prev, isOpen: false }))}
        onConfirm={confirmModal.onConfirm}
        title={confirmModal.title}
        message={confirmModal.message}
        confirmText={confirmModal.confirmText}
        variant={confirmModal.variant}
      />
    </main>
  );
}

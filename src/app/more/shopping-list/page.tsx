"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, GripVertical, Pencil, Plus, Trash2, X } from "lucide-react";
import { AppHeader } from "@/components/navigation/app-header";
import { useSync } from "@/components/sync-provider";
import {
  localCreateShoppingListItem,
  localDeleteShoppingListItem,
  localUpdateShoppingListItem,
} from "@/lib/sync/client";
import type { LocalShoppingListItem } from "@/lib/db";
import { listHouseholds } from "@/services/household-service";
import { queryKeys } from "@/lib/api/query-keys";
import { listShoppingItems } from "@/services/shopping-list-service";

function sortItems(items: LocalShoppingListItem[]) {
  return [...items].sort((a, b) => {
    if (a.isCompleted !== b.isCompleted) return a.isCompleted ? 1 : -1;
    if (a.isCompleted) {
      return (a.completedAt || a.updatedAt).localeCompare(b.completedAt || b.updatedAt);
    }
    return a.position - b.position || a.createdAt.localeCompare(b.createdAt);
  });
}

export default function ShoppingListPage() {
  const { sync } = useSync();
  const [householdId, setHouseholdId] = useState("");
  const [name, setName] = useState("");
  const [quantity, setQuantity] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editQuantity, setEditQuantity] = useState("");
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const itemsQuery = useQuery<LocalShoppingListItem[]>({
    queryKey: ["shopping-list", "items", householdId],
    queryFn: () => listShoppingItems(householdId),
    enabled: !!householdId,
  });
  const items = useMemo(() => itemsQuery.data ?? [], [itemsQuery.data]);
  const sortedItems = useMemo(() => sortItems(items), [items]);
  const openItems = sortedItems.filter((item) => !item.isCompleted);
  const completedItems = sortedItems.filter((item) => item.isCompleted);

  const householdsQuery = useQuery({
    queryKey: queryKeys.households.all(),
    queryFn: listHouseholds,
  });
  const households = useMemo(() => householdsQuery.data ?? [], [householdsQuery.data]);

  useEffect(() => {
    if (householdId === "" && households.length > 0) {
      queueMicrotask(() => setHouseholdId(households[0].id));
    }
  }, [householdId, households]);

  const queryClient = useQueryClient();

  const addItem = async (event: FormEvent) => {
    event.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName || !householdId) return;
    setError(null);
    try {
      await localCreateShoppingListItem(null, {
        householdId,
        name: trimmedName,
        quantity: quantity.trim() || null,
        isCompleted: false,
        position: openItems.length ? Math.min(...openItems.map((item) => item.position)) - 1 : 0,
      });
      setName("");
      setQuantity("");
      queryClient.invalidateQueries({ queryKey: ["shopping-list", "items", householdId] });
      await sync();
    } catch {
      setError("Unable to add item");
    }
  };

  const toggleItem = async (item: LocalShoppingListItem) => {
    await localUpdateShoppingListItem(null, item.id, {
      isCompleted: !item.isCompleted,
      completedAt: item.isCompleted ? null : new Date().toISOString(),
    });
    queryClient.invalidateQueries({ queryKey: ["shopping-list", "items", householdId] });
    await sync();
  };

  const saveEdit = async (item: LocalShoppingListItem) => {
    const nextName = editName.trim();
    if (!nextName) return;
    await localUpdateShoppingListItem(null, item.id, {
      name: nextName,
      quantity: editQuantity.trim() || null,
    });
    setEditingId(null);
    queryClient.invalidateQueries({ queryKey: ["shopping-list", "items", householdId] });
    await sync();
  };

  const deleteItem = async (id: string) => {
    await localDeleteShoppingListItem(null, id);
    queryClient.invalidateQueries({ queryKey: ["shopping-list", "items", householdId] });
    await sync();
  };

  const clearCompleted = async () => {
    if (!window.confirm(`Clear ${completedItems.length} completed item${completedItems.length === 1 ? "" : "s"}?`)) {
      return;
    }
    await Promise.all(completedItems.map((item) => localDeleteShoppingListItem(null, item.id)));
    queryClient.invalidateQueries({ queryKey: ["shopping-list", "items", householdId] });
    await sync();
  };

  const dropItem = async (targetId: string) => {
    if (!draggedId || draggedId === targetId) return;
    const from = openItems.findIndex((item) => item.id === draggedId);
    const to = openItems.findIndex((item) => item.id === targetId);
    if (from < 0 || to < 0) return;
    const reordered = [...openItems];
    const [moved] = reordered.splice(from, 1);
    reordered.splice(to, 0, moved);
    await Promise.all(
      reordered.map((item, index) => localUpdateShoppingListItem(null, item.id, { position: index }))
    );
    setDraggedId(null);
    setDropTargetId(null);
    queryClient.invalidateQueries({ queryKey: ["shopping-list", "items", householdId] });
    await sync();
  };

  const trackPointerTarget = (event: React.PointerEvent<HTMLElement>) => {
    if (!draggedId) return;
    const element = document.elementFromPoint(event.clientX, event.clientY);
    const row = element?.closest<HTMLElement>("[data-shopping-item-id]");
    const targetId = row?.dataset.shoppingItemId || null;
    setDropTargetId(targetId && openItems.some((item) => item.id === targetId) ? targetId : null);
  };

  const beginEdit = (item: LocalShoppingListItem) => {
    setEditingId(item.id);
    setEditName(item.name);
    setEditQuantity(item.quantity || "");
  };

  return (
    <main className="flex-1 max-w-3xl mx-auto w-full px-5 sm:px-7 pt-4 sm:pt-6 pb-8 space-y-6">
      <AppHeader
        title="Shopping List"
        subtitle="Shared Household Checklist"
        backHref="/more"
        backLabel="Back to More"
      />

      {households.length > 1 && (
        <label className="block text-xs font-semibold text-[var(--text-muted)] space-y-1.5">
          <span>Household</span>
          <select
            value={householdId}
            onChange={(event) => setHouseholdId(event.target.value)}
            className="w-full h-12 px-4 rounded-2xl bg-[var(--surface)] border border-[var(--border)] text-sm text-[var(--text)] focus:outline-none focus:border-[var(--accent)]"
            data-testid="shopping-list-household-select"
          >
            {households.map((household) => (
              <option key={household.id} value={household.id}>
                {household.name}
              </option>
            ))}
          </select>
        </label>
      )}

      <form
        onSubmit={addItem}
        className="rounded-3xl bg-[var(--surface)] border border-[var(--border)] p-4 sm:p-5 flex flex-col sm:flex-row gap-3 sm:items-end shadow-xs"
      >
        <label className="flex-1 text-xs font-semibold text-[var(--text-muted)] space-y-1.5">
          <span>Item</span>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Add an item (e.g. Fresh Milk)"
            maxLength={200}
            className="w-full h-12 px-4 rounded-2xl bg-[var(--bg)] border border-[var(--border)] text-sm text-[var(--text)] focus:outline-none focus:border-[var(--accent)]"
            data-testid="shopping-list-item-input"
          />
        </label>
        <div className="flex gap-3 items-end">
          <label className="flex-1 sm:w-28 text-xs font-semibold text-[var(--text-muted)] space-y-1.5">
            <span>Quantity</span>
            <input
              value={quantity}
              onChange={(event) => setQuantity(event.target.value)}
              placeholder="2 kg"
              maxLength={50}
              className="w-full h-12 px-4 rounded-2xl bg-[var(--bg)] border border-[var(--border)] text-sm text-[var(--text)] focus:outline-none focus:border-[var(--accent)]"
              data-testid="shopping-list-quantity-input"
            />
          </label>
          <button
            type="submit"
            className="h-12 px-5 rounded-2xl bg-[var(--accent)] text-white inline-flex items-center justify-center gap-1.5 text-xs font-bold hover:opacity-95 active:scale-[0.98] transition-all cursor-pointer shrink-0"
            data-testid="shopping-list-add-button"
          >
            <Plus size={16} /> Add
          </button>
        </div>
      </form>

      {(error || householdsQuery.error) && (
        <p className="text-xs font-semibold text-[var(--expense)] px-1">
          {error || "Unable to load households"}
        </p>
      )}

      <section
        className="rounded-3xl bg-[var(--surface)] border border-[var(--border)] divide-y divide-[var(--border)] overflow-hidden shadow-xs"
        aria-label="Shopping items"
        onPointerMove={trackPointerTarget}
      >
        {sortedItems.length === 0 && (
          <p className="p-8 text-center text-sm text-[var(--text-muted)]">
            Your shopping list is empty.
          </p>
        )}
        {sortedItems.map((item) => (
          <div
            key={item.id}
            data-shopping-item-id={item.id}
            draggable={false}
            onDragStart={() => setDraggedId(item.id)}
            onDragOver={(event) => event.preventDefault()}
            onDrop={() => void dropItem(item.id)}
            className={`p-4 flex items-center gap-3 transition-colors ${
              dropTargetId === item.id ? "bg-[var(--surface-hover)]" : ""
            }`}
            data-testid={`shopping-list-item-${item.id}`}
          >
            {!item.isCompleted && (
              <button
                type="button"
                draggable
                aria-label={`Drag to reorder ${item.name}`}
                className="touch-none cursor-grab text-[var(--text-muted)] hover:text-[var(--text)] shrink-0 p-1.5 -m-1.5"
                onPointerDown={(event) => {
                  event.preventDefault();
                  event.currentTarget.setPointerCapture(event.pointerId);
                  setDraggedId(item.id);
                }}
                onPointerMove={trackPointerTarget}
                onPointerUp={(event) => {
                  if (dropTargetId) void dropItem(dropTargetId);
                  event.currentTarget.releasePointerCapture(event.pointerId);
                }}
              >
                <GripVertical size={18} />
              </button>
            )}
            <button
              type="button"
              onClick={() => void toggleItem(item)}
              aria-label={item.isCompleted ? `Uncheck ${item.name}` : `Check ${item.name}`}
              className={`w-6 h-6 rounded-lg border flex items-center justify-center shrink-0 transition-colors cursor-pointer ${
                item.isCompleted
                  ? "bg-[var(--accent)] border-[var(--accent)] text-white"
                  : "border-[var(--text-muted)] hover:border-[var(--accent)]"
              }`}
            >
              {item.isCompleted && <Check size={14} />}
            </button>
            {editingId === item.id ? (
              <form
                className="min-w-0 flex-1 flex flex-wrap items-center gap-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  void saveEdit(item);
                }}
              >
                <input
                  value={editName}
                  onChange={(event) => setEditName(event.target.value)}
                  autoFocus
                  className="min-w-[9rem] flex-1 h-10 px-3 rounded-xl border border-[var(--border)] bg-[var(--bg)] text-sm text-[var(--text)]"
                />
                <input
                  value={editQuantity}
                  onChange={(event) => setEditQuantity(event.target.value)}
                  className="w-20 h-10 px-3 rounded-xl border border-[var(--border)] bg-[var(--bg)] text-sm text-[var(--text)]"
                />
                <div className="flex items-center gap-1.5 basis-full sm:basis-auto sm:ml-auto">
                  <button
                    type="submit"
                    aria-label="Save item"
                    className="w-9 h-9 rounded-xl flex items-center justify-center text-[var(--income)] hover:bg-[var(--income)]/10 cursor-pointer"
                  >
                    <Check size={18} />
                  </button>
                  <button
                    type="button"
                    aria-label="Cancel editing"
                    onClick={() => setEditingId(null)}
                    className="w-9 h-9 rounded-xl flex items-center justify-center text-[var(--text-muted)] hover:bg-[var(--bg)] cursor-pointer"
                  >
                    <X size={18} />
                  </button>
                  <button
                    type="button"
                    aria-label={`Delete ${item.name}`}
                    onClick={() => void deleteItem(item.id)}
                    className="w-9 h-9 rounded-xl flex items-center justify-center text-[var(--expense)] hover:bg-[var(--expense)]/10 cursor-pointer"
                  >
                    <Trash2 size={17} />
                  </button>
                </div>
              </form>
            ) : (
              <div
                className={`min-w-0 flex-1 text-sm font-medium ${
                  item.isCompleted ? "line-through text-[var(--text-muted)]" : "text-[var(--text)]"
                }`}
              >
                {item.name}
                {item.quantity && (
                  <span className="ml-2 px-2 py-0.5 rounded-full bg-[var(--bg)] border border-[var(--border)] text-2xs font-semibold text-[var(--text-muted)]">
                    {item.quantity}
                  </span>
                )}
              </div>
            )}
            {editingId !== item.id && (
              <button
                type="button"
                onClick={() => beginEdit(item)}
                aria-label={`Edit ${item.name}`}
                className="w-9 h-9 rounded-xl flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--bg)] cursor-pointer shrink-0"
              >
                <Pencil size={15} />
              </button>
            )}
          </div>
        ))}
      </section>

      {completedItems.length > 0 && (
        <button
          type="button"
          onClick={() => void clearCompleted()}
          className="h-10 px-4 rounded-2xl border border-[var(--expense)]/25 bg-[var(--expense)]/8 text-xs font-bold text-[var(--expense)] hover:bg-[var(--expense)]/15 transition-colors cursor-pointer"
        >
          Clear completed ({completedItems.length})
        </button>
      )}
    </main>
  );
}

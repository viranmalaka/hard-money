"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLiveQuery } from "dexie-react-hooks";
import { ArrowLeft, Check, GripVertical, Pencil, Plus, Trash2, X } from "lucide-react";
import Link from "next/link";
import { useSync } from "@/components/sync-provider";
import {
  localCreateShoppingListItem,
  localDeleteShoppingListItem,
  localUpdateShoppingListItem,
} from "@/lib/sync/client";
import type { LocalShoppingListItem } from "@/lib/db";
import { listHouseholds } from "@/services/household-service";
import { queryKeys } from "@/lib/api/query-keys";

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
  const { db, sync } = useSync();
  const [householdId, setHouseholdId] = useState("");
  const [name, setName] = useState("");
  const [quantity, setQuantity] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editQuantity, setEditQuantity] = useState("");
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const liveItems = useLiveQuery<LocalShoppingListItem[]>(
    () =>
      householdId
        ? db.shoppingListItems
            .where("householdId")
            .equals(householdId)
            .filter((item) => !item.deletedAt)
            .toArray()
        : Promise.resolve([] as LocalShoppingListItem[]),
    [db, householdId]
  );
  const items = useMemo(() => liveItems ?? [], [liveItems]);
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

  const addItem = async (event: FormEvent) => {
    event.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName || !householdId) return;
    setError(null);
    try {
      await localCreateShoppingListItem(db, {
        householdId,
        name: trimmedName,
        quantity: quantity.trim() || null,
        isCompleted: false,
        position: openItems.length ? Math.min(...openItems.map((item) => item.position)) - 1 : 0,
      });
      setName("");
      setQuantity("");
      await sync();
    } catch {
      setError("Unable to add item");
    }
  };

  const toggleItem = async (item: LocalShoppingListItem) => {
    await localUpdateShoppingListItem(db, item.id, {
      isCompleted: !item.isCompleted,
      completedAt: item.isCompleted ? null : new Date().toISOString(),
    });
    await sync();
  };

  const saveEdit = async (item: LocalShoppingListItem) => {
    const nextName = editName.trim();
    if (!nextName) return;
    await localUpdateShoppingListItem(db, item.id, {
      name: nextName,
      quantity: editQuantity.trim() || null,
    });
    setEditingId(null);
    await sync();
  };

  const deleteItem = async (id: string) => {
    await localDeleteShoppingListItem(db, id);
    await sync();
  };

  const clearCompleted = async () => {
    if (!window.confirm(`Clear ${completedItems.length} completed item${completedItems.length === 1 ? "" : "s"}?`)) {
      return;
    }
    await Promise.all(completedItems.map((item) => localDeleteShoppingListItem(db, item.id)));
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
      reordered.map((item, index) => localUpdateShoppingListItem(db, item.id, { position: index }))
    );
    setDraggedId(null);
    setDropTargetId(null);
    await sync();
  };

  const trackPointerTarget = (event: React.PointerEvent<HTMLButtonElement>) => {
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
    <main className="flex-1 max-w-2xl mx-auto w-full px-4 py-3 space-y-4">
      <div className="flex items-center gap-3">
        <Link href="/more" aria-label="Back to More" className="text-[var(--text-muted)] hover:text-[var(--text)]">
          <ArrowLeft size={18} />
        </Link>
        <div>
          <h1 className="text-base font-semibold tracking-tight text-[var(--text)]">Shopping List</h1>
          <p className="text-[11px] text-[var(--text-muted)]">Shared household items to buy</p>
        </div>
      </div>

      {households.length > 1 && (
        <label className="block text-xs font-semibold text-[var(--text-muted)]">
          Household
          <select
            value={householdId}
            onChange={(event) => setHouseholdId(event.target.value)}
            className="mt-1 w-full h-9 px-3 rounded bg-[var(--bg)] border border-hairline text-sm text-[var(--text)]"
            data-testid="shopping-list-household-select"
          >
            {households.map((household) => (
              <option key={household.id} value={household.id}>{household.name}</option>
            ))}
          </select>
        </label>
      )}

      <form onSubmit={addItem} className="flat-card p-3 flex gap-2 items-end">
        <label className="flex-1 text-[11px] font-semibold text-[var(--text-muted)]">
          Item
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Add an item"
            maxLength={200}
            className="mt-1 w-full h-10 px-3 rounded bg-[var(--bg)] border border-hairline text-sm text-[var(--text)]"
            data-testid="shopping-list-item-input"
          />
        </label>
        <label className="w-24 text-[11px] font-semibold text-[var(--text-muted)]">
          Quantity
          <input
            value={quantity}
            onChange={(event) => setQuantity(event.target.value)}
            placeholder="2 kg"
            maxLength={50}
            className="mt-1 w-full h-10 px-3 rounded bg-[var(--bg)] border border-hairline text-sm text-[var(--text)]"
            data-testid="shopping-list-quantity-input"
          />
        </label>
        <button type="submit" className="h-10 px-3 rounded bg-[var(--accent)] text-white flex items-center gap-1 text-xs font-semibold" data-testid="shopping-list-add-button">
          <Plus size={15} /> Add
        </button>
      </form>

      {(error || householdsQuery.error) && (
        <p className="text-xs text-[var(--expense)]">
          {error || "Unable to load households"}
        </p>
      )}

      <section
        className="flat-card divide-y divide-hairline"
        aria-label="Shopping items"
        onPointerMove={trackPointerTarget}
      >
        {sortedItems.length === 0 && (
          <p className="p-6 text-center text-xs text-[var(--text-muted)]">Your shopping list is empty.</p>
        )}
        {sortedItems.map((item) => (
          <div
            key={item.id}
            data-shopping-item-id={item.id}
            draggable={false}
            onDragStart={() => setDraggedId(item.id)}
            onDragOver={(event) => event.preventDefault()}
            onDrop={() => void dropItem(item.id)}
            className={`p-3 flex items-center gap-2 ${dropTargetId === item.id ? "bg-[var(--surface-hover)]" : ""}`}
            data-testid={`shopping-list-item-${item.id}`}
          >
            {!item.isCompleted && (
              <button
                type="button"
                draggable
                aria-label={`Drag to reorder ${item.name}`}
                className="touch-none cursor-grab text-[var(--text-muted)] shrink-0 p-1 -m-1"
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
              className={`w-5 h-5 rounded border flex items-center justify-center shrink-0 ${item.isCompleted ? "bg-[var(--accent)] border-[var(--accent)] text-white" : "border-[var(--text-muted)]"}`}
            >
              {item.isCompleted && <Check size={13} />}
            </button>
            {editingId === item.id ? (
              <form className="min-w-0 flex-1 flex flex-wrap items-center gap-2" onSubmit={(event) => { event.preventDefault(); void saveEdit(item); }}>
                <input value={editName} onChange={(event) => setEditName(event.target.value)} autoFocus className="min-w-[9rem] flex-1 h-8 px-2 rounded border border-hairline bg-[var(--bg)] text-sm text-[var(--text)]" />
                <input value={editQuantity} onChange={(event) => setEditQuantity(event.target.value)} className="w-14 h-8 px-2 rounded border border-hairline bg-[var(--bg)] text-sm text-[var(--text)]" />
                <div className="flex items-center gap-2 basis-full sm:basis-auto sm:ml-auto">
                  <button type="submit" aria-label="Save item" className="text-[var(--income)] p-1"><Check size={18} /></button>
                  <button type="button" aria-label="Cancel editing" onClick={() => setEditingId(null)} className="text-[var(--text-muted)] p-1"><X size={18} /></button>
                  <button type="button" aria-label={`Delete ${item.name}`} onClick={() => void deleteItem(item.id)} className="text-[var(--expense)] p-1"><Trash2 size={17} /></button>
                </div>
              </form>
            ) : (
              <div className={`min-w-0 flex-1 text-sm ${item.isCompleted ? "line-through text-[var(--text-muted)]" : "text-[var(--text)]"}`}>
                {item.name}
                {item.quantity && <span className="ml-2 text-xs text-[var(--text-muted)]">({item.quantity})</span>}
              </div>
            )}
            {editingId !== item.id && (
              <button type="button" onClick={() => beginEdit(item)} aria-label={`Edit ${item.name}`} className="text-[var(--text-muted)] hover:text-[var(--text)] p-1">
                <Pencil size={15} />
              </button>
            )}
          </div>
        ))}
      </section>

      {completedItems.length > 0 && (
        <button type="button" onClick={() => void clearCompleted()} className="text-xs font-semibold text-[var(--expense)] hover:underline">
          Clear completed ({completedItems.length})
        </button>
      )}
    </main>
  );
}

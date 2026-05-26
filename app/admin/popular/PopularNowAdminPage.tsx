'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

type RankedItemType = 'bill' | 'law' | 'agency_document' | 'cluster' | 'executive_order';

interface RankedItemSummary {
  title: string;
  subtitle: string | null;
  href: string;
}

interface RankedItemRow {
  id: number;
  created_at: string;
  updated_at: string;
  item_type: RankedItemType;
  item_id: number;
  rank: number;
  effectively_ranked_at: string | null;
  ranking_ended_at: string | null;
  item: RankedItemSummary | null;
}

interface RankedItemsResponse {
  active: RankedItemRow[];
  ended: RankedItemRow[];
  notes?: {
    homepageSelection?: string;
  };
}

interface RankedItemMutationRow {
  id: number;
  created_at: string;
  updated_at: string;
  item_type: RankedItemType;
  item_id: number;
  rank: number;
  effectively_ranked_at: string | null;
  ranking_ended_at: string | null;
  item: RankedItemSummary | null;
}

interface EditableRow {
  itemType: RankedItemType;
  itemId: string;
  rank: string;
  effectivelyRankedAt: string;
}

const ITEM_TYPE_OPTIONS: Array<{ value: RankedItemType; label: string }> = [
  { value: 'bill', label: 'Bill' },
  { value: 'law', label: 'Law' },
  { value: 'executive_order', label: 'Executive Order' },
  { value: 'agency_document', label: 'Agency Rule/Document' },
  { value: 'cluster', label: 'Supreme Court Case' },
];

function formatDateTime(value: string | null) {
  if (!value) return '--';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function toInputDateTime(value: string | null) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60 * 1000);
  return local.toISOString().slice(0, 16);
}

function fromInputDateTime(value: string) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function toEditableRow(item: RankedItemRow): EditableRow {
  return {
    itemType: item.item_type,
    itemId: String(item.item_id),
    rank: String(item.rank),
    effectivelyRankedAt: toInputDateTime(item.effectively_ranked_at),
  };
}

function getRankingStatus(row: Pick<RankedItemRow, 'effectively_ranked_at' | 'ranking_ended_at'>) {
  if (row.ranking_ended_at) return 'ended';
  if (!row.effectively_ranked_at) return 'live';
  const effectiveAt = new Date(row.effectively_ranked_at).getTime();
  if (Number.isNaN(effectiveAt)) return 'live';
  return effectiveAt <= Date.now() ? 'live' : 'scheduled';
}

export default function PopularNowAdminPage() {
  const [activeItems, setActiveItems] = useState<RankedItemRow[]>([]);
  const [endedItems, setEndedItems] = useState<RankedItemRow[]>([]);
  const [selectionNote, setSelectionNote] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [reordering, setReordering] = useState(false);
  const [rowPendingId, setRowPendingId] = useState<number | null>(null);
  const [alert, setAlert] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [editableRows, setEditableRows] = useState<Record<number, EditableRow>>({});
  const [showEnded, setShowEnded] = useState(false);
  const [draggedRowId, setDraggedRowId] = useState<number | null>(null);
  const [dragOverRowId, setDragOverRowId] = useState<number | null>(null);

  const [newItemType, setNewItemType] = useState<RankedItemType>('bill');
  const [newItemId, setNewItemId] = useState('');
  const [newRank, setNewRank] = useState('1');
  const [newEffectiveAt, setNewEffectiveAt] = useState('');

  const fetchRankedItems = useCallback(async () => {
    try {
      setLoading(true);
      setAlert(null);

      const response = await fetch('/api/admin/ranked-items', { cache: 'no-store' });
      const payload = (await response.json()) as RankedItemsResponse & { error?: string };

      if (!response.ok) {
        throw new Error(payload.error || 'Failed to load Popular now configuration');
      }

      const active = payload.active ?? [];
      const ended = payload.ended ?? [];
      setActiveItems(active);
      setEndedItems(ended);
      setSelectionNote(payload.notes?.homepageSelection ?? null);

      const nextEditable: Record<number, EditableRow> = {};
      [...active, ...ended].forEach((row) => {
        nextEditable[row.id] = toEditableRow(row);
      });
      setEditableRows(nextEditable);
      setNewRank(String(Math.max(1, active.length + 1)));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load Popular now configuration';
      setAlert({ type: 'error', message });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRankedItems();
  }, [fetchRankedItems]);

  const activeSorted = useMemo(
    () => [...activeItems].sort((a, b) => (a.rank !== b.rank ? a.rank - b.rank : a.id - b.id)),
    [activeItems],
  );
  const liveItemCount = useMemo(
    () => activeSorted.filter((item) => getRankingStatus(item) === 'live').length,
    [activeSorted],
  );
  const scheduledItemCount = activeSorted.length - liveItemCount;

  const applyRowMutation = useCallback((serverRow: RankedItemMutationRow) => {
    const existing = [...activeItems, ...endedItems].find((row) => row.id === serverRow.id);
    const itemSummary =
      serverRow.item ??
      (existing && existing.item_type === serverRow.item_type && existing.item_id === serverRow.item_id
        ? existing.item
        : null);

    const nextRow: RankedItemRow = {
      ...serverRow,
      item: itemSummary,
    };

    setActiveItems((prev) => {
      const withoutCurrent = prev.filter((row) => row.id !== nextRow.id);
      return nextRow.ranking_ended_at === null ? [...withoutCurrent, nextRow] : withoutCurrent;
    });

    setEndedItems((prev) => {
      const withoutCurrent = prev.filter((row) => row.id !== nextRow.id);
      return nextRow.ranking_ended_at !== null ? [...withoutCurrent, nextRow] : withoutCurrent;
    });

    setEditableRows((prev) => ({
      ...prev,
      [nextRow.id]: toEditableRow(nextRow),
    }));
  }, [activeItems, endedItems]);

  const updateEditable = <K extends keyof EditableRow>(id: number, key: K, value: EditableRow[K]) => {
    setEditableRows((prev) => ({
      ...prev,
      [id]: {
        ...prev[id],
        [key]: value,
      },
    }));
  };

  const sendRowUpdate = useCallback(async (id: number, updates: Record<string, unknown>, message: string) => {
    setRowPendingId(id);
    setAlert(null);
    try {
      const response = await fetch('/api/admin/ranked-items', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, updates }),
      });
      const payload = (await response.json()) as { error?: string; rankedItem?: RankedItemMutationRow };
      if (!response.ok) {
        throw new Error(payload.error || 'Failed to update row');
      }
      if (payload.rankedItem) {
        applyRowMutation(payload.rankedItem);
      }
      setAlert({ type: 'success', message });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to update row';
      setAlert({ type: 'error', message: errorMessage });
    } finally {
      setRowPendingId(null);
    }
  }, [applyRowMutation]);

  const handleCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const parsedItemId = Number(newItemId);
    const parsedRank = Number(newRank);

    if (!Number.isFinite(parsedItemId) || parsedItemId <= 0) {
      setAlert({ type: 'error', message: 'Item ID must be a positive number' });
      return;
    }
    if (!Number.isFinite(parsedRank) || parsedRank <= 0) {
      setAlert({ type: 'error', message: 'Rank must be a positive number' });
      return;
    }

    try {
      setSaving(true);
      setAlert(null);

      const response = await fetch('/api/admin/ranked-items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          itemType: newItemType,
          itemId: parsedItemId,
          rank: parsedRank,
          effectivelyRankedAt: fromInputDateTime(newEffectiveAt),
          rankingEndedAt: null,
        }),
      });

      const payload = (await response.json()) as { error?: string; rankedItem?: RankedItemMutationRow };
      if (!response.ok) {
        throw new Error(payload.error || 'Failed to add item');
      }
      if (payload.rankedItem) {
        applyRowMutation(payload.rankedItem);
      }

      setNewItemId('');
      setNewEffectiveAt('');
      setAlert({ type: 'success', message: 'Popular now item added' });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to add item';
      setAlert({ type: 'error', message });
    } finally {
      setSaving(false);
    }
  };

  const handleSaveRow = async (id: number) => {
    const editable = editableRows[id];
    if (!editable) return;

    const parsedItemId = Number(editable.itemId);
    const parsedRank = Number(editable.rank);

    if (!Number.isFinite(parsedItemId) || parsedItemId <= 0) {
      setAlert({ type: 'error', message: 'Item ID must be a positive number' });
      return;
    }
    if (!Number.isFinite(parsedRank) || parsedRank <= 0) {
      setAlert({ type: 'error', message: 'Rank must be a positive number' });
      return;
    }

    await sendRowUpdate(
      id,
      {
        itemType: editable.itemType,
        itemId: parsedItemId,
        rank: parsedRank,
        effectivelyRankedAt: fromInputDateTime(editable.effectivelyRankedAt),
      },
      `Saved row #${id}`,
    );
  };

  const handleEndNow = async (id: number) => {
    await sendRowUpdate(id, { rankingEndedAt: new Date().toISOString() }, `Ended row #${id}`);
  };

  const handleReactivate = async (id: number) => {
    await sendRowUpdate(id, { rankingEndedAt: null }, `Reactivated row #${id}`);
  };

  const moveActiveItem = async (id: number, direction: 'up' | 'down') => {
    const index = activeSorted.findIndex((item) => item.id === id);
    if (index < 0) return;
    if (direction === 'up' && index === 0) return;
    if (direction === 'down' && index === activeSorted.length - 1) return;

    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    const currentItem = activeSorted[index];
    const swapItem = activeSorted[targetIndex];

    if (!currentItem || !swapItem) return;

    try {
      setRowPendingId(id);
      setAlert(null);

      const [firstResp, secondResp] = await Promise.all([
        fetch('/api/admin/ranked-items', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: currentItem.id, updates: { rank: swapItem.rank } }),
        }),
        fetch('/api/admin/ranked-items', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: swapItem.id, updates: { rank: currentItem.rank } }),
        }),
      ]);

      const firstPayload = (await firstResp.json()) as { error?: string; rankedItem?: RankedItemMutationRow };
      const secondPayload = (await secondResp.json()) as { error?: string; rankedItem?: RankedItemMutationRow };

      if (!firstResp.ok || !secondResp.ok) {
        throw new Error(firstPayload.error || secondPayload.error || 'Failed to reorder active items');
      }
      if (firstPayload.rankedItem) applyRowMutation(firstPayload.rankedItem);
      if (secondPayload.rankedItem) applyRowMutation(secondPayload.rankedItem);

      setAlert({ type: 'success', message: 'Updated active ranking order' });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to reorder active items';
      setAlert({ type: 'error', message });
    } finally {
      setRowPendingId(null);
    }
  };

  const reorderActiveRows = useCallback(async (sourceId: number, targetId: number) => {
    if (sourceId === targetId) return;

    const sourceIndex = activeSorted.findIndex((item) => item.id === sourceId);
    const targetIndex = activeSorted.findIndex((item) => item.id === targetId);
    if (sourceIndex < 0 || targetIndex < 0) return;

    const previousRows = activeSorted;
    const reordered = [...previousRows];
    const [moved] = reordered.splice(sourceIndex, 1);
    reordered.splice(targetIndex, 0, moved);

    const ranked = reordered.map((row, index) => ({ ...row, rank: index + 1 }));
    const changed = ranked.filter((row, index) => row.rank !== previousRows[index]?.rank);

    if (changed.length === 0) return;

    setActiveItems(ranked);
    setEditableRows((prev) => {
      const next = { ...prev };
      ranked.forEach((row) => {
        next[row.id] = {
          ...(next[row.id] ?? toEditableRow(row)),
          rank: String(row.rank),
        };
      });
      return next;
    });

    try {
      setReordering(true);
      setAlert(null);
      const responses = await Promise.all(
        changed.map((row) =>
          fetch('/api/admin/ranked-items', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: row.id, updates: { rank: row.rank } }),
          }),
        ),
      );

      const payloads = await Promise.all(
        responses.map(async (response) => (await response.json()) as { error?: string; rankedItem?: RankedItemMutationRow }),
      );

      const failed = responses.findIndex((response) => !response.ok);
      if (failed !== -1) {
        throw new Error(payloads[failed]?.error || 'Failed to persist new ranking order');
      }

      payloads.forEach((payload) => {
        if (payload.rankedItem) {
          applyRowMutation(payload.rankedItem);
        }
      });

      setAlert({ type: 'success', message: 'Updated active ranking order' });
    } catch (error) {
      setActiveItems(previousRows);
      setEditableRows((prev) => {
        const next = { ...prev };
        previousRows.forEach((row) => {
          next[row.id] = {
            ...(next[row.id] ?? toEditableRow(row)),
            rank: String(row.rank),
          };
        });
        return next;
      });
      const message = error instanceof Error ? error.message : 'Failed to reorder active items';
      setAlert({ type: 'error', message });
    } finally {
      setReordering(false);
      setDraggedRowId(null);
      setDragOverRowId(null);
    }
  }, [activeSorted, applyRowMutation]);

  return (
    <div className="space-y-6 px-4 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold text-gray-900">Popular now configuration</h1>
          <p className="mt-2 text-sm text-gray-600">
            Control which items appear on homepage &ldquo;Popular now&rdquo; cards by editing ranked items.
          </p>
          {selectionNote ? <p className="mt-1 text-xs text-gray-500">{selectionNote}</p> : null}
        </div>
        <Link href="/admin" className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">
          Back to Admin Activity
        </Link>
      </div>

      {alert ? (
        <div
          className={[
            'rounded-md border px-4 py-3 text-sm',
            alert.type === 'success' ? 'border-green-300 bg-green-50 text-green-700' : 'border-red-300 bg-red-50 text-red-700',
          ].join(' ')}
        >
          {alert.message}
        </div>
      ) : null}

      <form onSubmit={handleCreate} className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-600">Add ranked item</h2>
        <div className="grid gap-3 md:grid-cols-5">
          <label className="flex flex-col gap-1 text-xs font-medium uppercase text-gray-500">
            Type
            <select
              value={newItemType}
              onChange={(event) => setNewItemType(event.target.value as RankedItemType)}
              className="rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900"
            >
              {ITEM_TYPE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1 text-xs font-medium uppercase text-gray-500">
            Item ID
            <Input
              type="number"
              min={1}
              value={newItemId}
              onChange={(event) => setNewItemId(event.target.value)}
              placeholder="12345"
            />
          </label>

          <label className="flex flex-col gap-1 text-xs font-medium uppercase text-gray-500">
            Rank
            <Input type="number" min={1} value={newRank} onChange={(event) => setNewRank(event.target.value)} />
          </label>

          <label className="flex flex-col gap-1 text-xs font-medium uppercase text-gray-500">
            Effective at
            <Input type="datetime-local" value={newEffectiveAt} onChange={(event) => setNewEffectiveAt(event.target.value)} />
          </label>

          <div className="flex items-end">
            <Button type="submit" disabled={saving}>
              {saving ? 'Adding...' : 'Add to Popular now'}
            </Button>
          </div>
        </div>
      </form>

      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-200 px-4 py-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-600">Active and scheduled rankings</h2>
          <p className="mt-1 text-xs text-gray-500">
            {liveItemCount} live, {scheduledItemCount} scheduled. Homepage displays the top 8 live rows by ascending rank.
          </p>
        </div>
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Rank</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Item</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Type</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Item ID</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Effective</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Updated</th>
              <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 bg-white">
            {loading ? (
              <tr>
                <td className="px-4 py-8 text-center text-sm text-gray-500" colSpan={7}>
                  Loading Popular now items...
                </td>
              </tr>
            ) : activeSorted.length === 0 ? (
              <tr>
                <td className="px-4 py-8 text-center text-sm text-gray-500" colSpan={7}>
                  No active rankings configured.
                </td>
              </tr>
            ) : (
              activeSorted.map((row, index) => {
                const editable = editableRows[row.id] ?? toEditableRow(row);
                const isPending = rowPendingId === row.id;
                const isTop = index === 0;
                const isBottom = index === activeSorted.length - 1;

                return (
                  <tr
                    key={row.id}
                    draggable={!reordering && !isPending}
                    onDragStart={() => setDraggedRowId(row.id)}
                    onDragOver={(event) => {
                      event.preventDefault();
                      if (dragOverRowId !== row.id) {
                        setDragOverRowId(row.id);
                      }
                    }}
                    onDrop={(event) => {
                      event.preventDefault();
                      const sourceId = draggedRowId;
                      if (!sourceId) return;
                      reorderActiveRows(sourceId, row.id);
                    }}
                    onDragEnd={() => {
                      setDraggedRowId(null);
                      setDragOverRowId(null);
                    }}
                    className={dragOverRowId === row.id && draggedRowId !== row.id ? 'bg-blue-50' : undefined}
                  >
                    <td className="px-4 py-3 text-sm">
                      <Input
                        type="number"
                        min={1}
                        value={editable.rank}
                        onChange={(event) => updateEditable(row.id, 'rank', event.target.value)}
                        disabled={isPending}
                      />
                    </td>
                    <td className="max-w-md px-4 py-3 text-sm text-gray-900">
                      <div className="flex items-start gap-2">
                        <div>
                          <div className="font-medium">{row.item?.title ?? `Item ${row.item_id}`}</div>
                          {row.item?.subtitle ? <div className="mt-1 text-xs text-gray-500">{row.item.subtitle}</div> : null}
                        </div>
                        {getRankingStatus(row) === 'scheduled' ? (
                          <span className="whitespace-nowrap rounded bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                            Scheduled
                          </span>
                        ) : (
                          <span className="whitespace-nowrap rounded bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">
                            Live
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <select
                        value={editable.itemType}
                        onChange={(event) => updateEditable(row.id, 'itemType', event.target.value as RankedItemType)}
                        disabled={isPending}
                        className="rounded-md border border-gray-300 px-2 py-1 text-sm"
                      >
                        {ITEM_TYPE_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <Input
                        type="number"
                        min={1}
                        value={editable.itemId}
                        onChange={(event) => updateEditable(row.id, 'itemId', event.target.value)}
                        disabled={isPending}
                      />
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <Input
                        type="datetime-local"
                        value={editable.effectivelyRankedAt}
                        onChange={(event) => updateEditable(row.id, 'effectivelyRankedAt', event.target.value)}
                        disabled={isPending}
                      />
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-500">{formatDateTime(row.updated_at)}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right text-sm">
                      <div className="flex items-center justify-end gap-2">
                        <Button variant="outline" size="sm" onClick={() => moveActiveItem(row.id, 'up')} disabled={isPending || isTop || reordering}>
                          Up
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => moveActiveItem(row.id, 'down')} disabled={isPending || isBottom || reordering}>
                          Down
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => handleSaveRow(row.id)} disabled={isPending || reordering}>
                          {isPending ? 'Saving...' : 'Save'}
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => handleEndNow(row.id)} disabled={isPending || reordering}>
                          End now
                        </Button>
                        {row.item?.href ? (
                          <Link href={row.item.href} className="text-xs text-blue-600 hover:text-blue-800 hover:underline" target="_blank" rel="noreferrer">
                            Open
                          </Link>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-600">Ended rankings</h2>
          <Button variant="ghost" size="sm" onClick={() => setShowEnded((prev) => !prev)}>
            {showEnded ? 'Hide' : `Show (${endedItems.length})`}
          </Button>
        </div>

        {showEnded ? (
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Rank</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Item</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Ended</th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white">
              {endedItems.length === 0 ? (
                <tr>
                  <td className="px-4 py-8 text-center text-sm text-gray-500" colSpan={4}>
                    No ended rows.
                  </td>
                </tr>
              ) : (
                endedItems.map((row) => {
                  const isPending = rowPendingId === row.id;
                  return (
                    <tr key={row.id}>
                      <td className="px-4 py-3 text-sm text-gray-700">{row.rank}</td>
                      <td className="max-w-md px-4 py-3 text-sm text-gray-900">
                        <div className="font-medium">{row.item?.title ?? `Item ${row.item_id}`}</div>
                        <div className="mt-1 text-xs text-gray-500">
                          {ITEM_TYPE_OPTIONS.find((option) => option.value === row.item_type)?.label ?? row.item_type} #{row.item_id}
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-500">{formatDateTime(row.ranking_ended_at)}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-right text-sm">
                        <div className="flex items-center justify-end gap-2">
                          <Button variant="outline" size="sm" onClick={() => handleReactivate(row.id)} disabled={isPending}>
                            Reactivate
                          </Button>
                          {row.item?.href ? (
                            <Link href={row.item.href} className="text-xs text-blue-600 hover:text-blue-800 hover:underline" target="_blank" rel="noreferrer">
                              Open
                            </Link>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        ) : null}
      </div>
    </div>
  );
}

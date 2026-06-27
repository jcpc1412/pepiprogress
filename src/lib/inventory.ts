import { type InventoryItem, localDateKey } from '@/lib/store';

/** True when an item is at/below its low-stock threshold. Expiry tracking was
 * dropped (redesign R2) — only stock depletion surfaces as "attention". Pure. */
export function itemNeedsAttention(item: InventoryItem, _today = localDateKey()): boolean {
  return (
    item.amountRemaining != null &&
    item.lowThreshold != null &&
    item.amountRemaining <= item.lowThreshold
  );
}

/** The subset of inventory needing attention. */
export function inventoryAttention(inventory: InventoryItem[], today = localDateKey()): InventoryItem[] {
  return inventory.filter((i) => itemNeedsAttention(i, today));
}

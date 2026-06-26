import { daysBetween } from '@/lib/dates';
import { localDateKey, type InventoryItem } from '@/lib/store';

/** Items at/below the low-stock threshold or within this many days of expiry surface as "attention". */
export const EXPIRY_SOON_DAYS = 14;

/** True when an item is low on stock or expired/expiring soon (shared by the
 * Protocol attention banner and the inventory reminder). Pure. */
export function itemNeedsAttention(item: InventoryItem, today = localDateKey()): boolean {
  const low =
    item.amountRemaining != null &&
    item.lowThreshold != null &&
    item.amountRemaining <= item.lowThreshold;
  const exp = item.expiry ? daysBetween(today, item.expiry) : null;
  return low || (exp != null && exp <= EXPIRY_SOON_DAYS);
}

/** The subset of inventory needing attention. */
export function inventoryAttention(inventory: InventoryItem[], today = localDateKey()): InventoryItem[] {
  return inventory.filter((i) => itemNeedsAttention(i, today));
}

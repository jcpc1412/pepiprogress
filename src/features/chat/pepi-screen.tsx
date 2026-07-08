import { PepiChat } from '@/features/chat/pepi-chat';

/**
 * Pepi (redesign §4.3, R2-F) — one conversational surface. AI is invisible
 * infrastructure: the user logs or asks in a single thread and Pepi replies as
 * messages (data line for log confirmations, analysis line for questions). Named
 * "Pepi", never "AI" or "Chat" (owner decision 2026-07-06). No charts here —
 * Analysis owns every chart.
 */
export function PepiScreen() {
  return <PepiChat />;
}

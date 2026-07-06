import type { NormalizedSlot } from "./types";

const EMPTY_MESSAGE = "Свободных слотов сейчас нет";

function lineForSlot(slot: NormalizedSlot): string {
  return `${slot.moscowDateLabel} ${slot.moscowTimeLabel} — ${slot.availableTickets} чел. — ${slot.eventTitle}`;
}

function splitLines(lines: string[], maxLength: number): string[] {
  const messages: string[] = [];
  let current = "";

  for (const line of lines) {
    const candidate = current ? `${current}\n${line}` : line;
    if (candidate.length > maxLength && current) {
      messages.push(current.trimEnd());
      current = line;
    } else {
      current = candidate;
    }
  }

  if (current) {
    messages.push(current.trimEnd());
  }

  return messages;
}

export function formatSlotMessages(slots: NormalizedSlot[], maxLength: number): string[] {
  if (slots.length === 0) {
    return [EMPTY_MESSAGE];
  }

  const ordered = [...slots].sort((a, b) => {
    if (a.venueOrder !== b.venueOrder) return a.venueOrder - b.venueOrder;
    if (a.venueSort !== b.venueSort) return a.venueSort - b.venueSort;
    if (a.venueTitle !== b.venueTitle) return a.venueTitle.localeCompare(b.venueTitle, "ru");
    if (a.startsAt !== b.startsAt) return a.startsAt.localeCompare(b.startsAt);
    return a.durationMinutes - b.durationMinutes;
  });

  const lines: string[] = [];
  let currentVenueId: number | null = null;

  for (const slot of ordered) {
    if (currentVenueId !== slot.venueId) {
      if (lines.length > 0) {
        lines.push("");
      }
      lines.push(slot.venueTitle);
      currentVenueId = slot.venueId;
    }
    lines.push(lineForSlot(slot));
  }

  return splitLines(lines, maxLength);
}

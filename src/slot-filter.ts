import type { NormalizedSlot, PadlConfig, PadlEventCard, PadlVenue, RawAvailabilityEvent } from "./types";

function moscowParts(iso: string): { dateLabel: string; timeLabel: string; minutes: number } {
  const formatter = new Intl.DateTimeFormat("ru-RU", {
    timeZone: "Europe/Moscow",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = Object.fromEntries(formatter.formatToParts(new Date(iso)).map((part) => [part.type, part.value]));
  const hour = Number(parts.hour ?? "0");
  const minute = Number(parts.minute ?? "0");
  return {
    dateLabel: `${parts.day ?? "??"}.${parts.month ?? "??"}`,
    timeLabel: `${parts.hour ?? "00"}:${parts.minute ?? "00"}`,
    minutes: hour * 60 + minute,
  };
}

function venueMatches(config: PadlConfig, venue: PadlVenue): boolean {
  if (config.venues.mode === "all") {
    return true;
  }
  return config.venues.values.some((value) => value === String(venue.id) || value === venue.title);
}

function venueOrder(config: PadlConfig, venue: PadlVenue): number {
  if (config.venues.mode === "all") {
    return venue.sort ?? 9999;
  }
  const index = config.venues.values.findIndex((value) => value === String(venue.id) || value === venue.title);
  return index === -1 ? 9999 : index;
}

export function normalizeAndFilterSlots(input: {
  config: PadlConfig;
  venues: PadlVenue[];
  eventCards: PadlEventCard[];
  availabilityEvents: RawAvailabilityEvent[];
}): NormalizedSlot[] {
  const venuesById = new Map(input.venues.map((venue) => [venue.id, venue]));
  const cardsByEventId = new Map<number, PadlEventCard>();

  for (const card of input.eventCards) {
    for (const eventId of card.eventIds) {
      cardsByEventId.set(eventId, card);
    }
  }

  const slots: NormalizedSlot[] = [];

  for (const event of input.availabilityEvents) {
    const card = cardsByEventId.get(event.id);
    if (!card || !input.config.gameTypes.includes(card.eventType)) {
      continue;
    }
    const venue = venuesById.get(card.venueId);
    if (!venue || !venueMatches(input.config, venue)) {
      continue;
    }

    for (const start of event.starts ?? []) {
      const parts = moscowParts(start.starts_at);
      if (parts.minutes < input.config.timeFromMinutes || parts.minutes > input.config.timeToMinutes) {
        continue;
      }

      for (const [durationKey, duration] of Object.entries(start.durations ?? {})) {
        const durationMinutes = Number(durationKey);
        const availableTickets = Number(duration.available_tickets ?? 0);
        const isAvailable = duration.is_available !== false && duration.disabled !== true;
        if (!Number.isFinite(durationMinutes) || !isAvailable || availableTickets !== input.config.requiredPeople) {
          continue;
        }

        slots.push({
          venueId: venue.id,
          venueTitle: venue.title,
          venueOrder: venueOrder(input.config, venue),
          venueSort: venue.sort ?? 9999,
          eventType: card.eventType,
          eventTitle: event.title ?? card.title,
          eventId: event.id,
          startsAt: start.starts_at,
          moscowDateLabel: parts.dateLabel,
          moscowTimeLabel: parts.timeLabel,
          moscowMinutes: parts.minutes,
          durationMinutes,
          availableTickets,
        });
      }
    }
  }

  return slots;
}

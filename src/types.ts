export type VenueFilter =
  | { mode: "all"; values: [] }
  | { mode: "list"; values: string[] };

export type PadlConfig = {
  telegramBotToken: string;
  venues: VenueFilter;
  timeFromMinutes: number;
  timeToMinutes: number;
  requiredPeople: number;
  gameTypes: string[];
  stateSessionExternalId: string;
  timezone: "Europe/Moscow";
  cron: string;
  maxMessageLength: number;
  telegramGetUpdatesTimeoutSeconds: 0;
  httpTimeoutMs: number;
};

export type Subscriber = {
  chatId: number;
  firstSeenAt: string;
  lastStartAt: string;
};

export type BotState = {
  telegramOffset: number | null;
  subscribers: Record<string, Subscriber>;
};

export type PadlVenue = {
  id: number;
  title: string;
  address: string | null;
  workingHours: string | null;
  sort: number | null;
};

export type PadlEventCard = {
  id: number;
  title: string;
  eventType: string;
  venueId: number;
  eventIds: number[];
  sort: number | null;
};

export type RawAvailabilityEvent = {
  id: number;
  title?: string;
  max_tickets_per_booking?: number;
  allowed_durations?: number[];
  starts?: Array<{
    starts_at: string;
    time?: string;
    durations?: Record<string, { available_tickets?: number; is_available?: boolean; disabled?: boolean }>;
  }>;
};

export type NormalizedSlot = {
  venueId: number;
  venueTitle: string;
  venueOrder: number;
  venueSort: number;
  eventType: string;
  eventTitle: string;
  eventId: number;
  startsAt: string;
  moscowDateLabel: string;
  moscowTimeLabel: string;
  moscowMinutes: number;
  durationMinutes: number;
  availableTickets: number;
};

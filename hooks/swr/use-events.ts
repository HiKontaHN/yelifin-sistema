// hooks/swr/use-events.ts
import useSWR from "swr";
import { useAuth } from "@/hooks/use-auth";

// ── Types ──────────────────────────────────────────────────────────────
export type EventStatus = "PLANNED" | "ACTIVE" | "COMPLETED";

export interface Event {
  id:             number;
  public_id:      string;
  name:           string;
  location:       string | null;
  starts_at:      string;
  ends_at:        string;
  fixed_cost:     number;
  notes:          string | null;
  status:         EventStatus;
  total_sales:    number;
  total_expenses: number | null;
  net_profit:     number | null;
  roi:            number | null;
  created_at:     string;
}

export interface EventDetail extends Event {
  summary: {
    total_sales:    number;
    total_tax:      number;
    total_profit:   number | null;
    total_expenses: number | null;
    net_profit:     number | null;
    roi:            number | null;
    sales_count:    number;
    by_account:     Record<string, number>;
  };
  sales: {
    id:             number;
    sale_number:    string;
    subtotal:       number;
    discount:       number;
    tax_rate:       number;
    tax:            number;
    shipping_cost:  number;
    total:          number;
    payment_method: string;
    sold_at:        string;
    customer_name:  string | null;
    account_name:   string | null;
    items_count:    number;
    profit:         number | null;
  }[];
  expenses: {
    id:          number;
    description: string;
    amount:      number | null;
    occurred_at: string;
  }[];
}

export interface CreateEventData {
  name:       string;
  location?:  string;
  starts_at:  string;
  ends_at:    string;
  fixed_cost?: number;
  notes?:     string;
}

export type UpdateEventData = Partial<CreateEventData>;

// ── Fetcher ────────────────────────────────────────────────────────────
async function authFetch(url: string, token: string, options?: RequestInit) {
  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Error en la solicitud");
  }
  return res.json();
}

// ── useEvents ──────────────────────────────────────────────────────────
export function useEvents() {
  const { firebaseUser } = useAuth();

  const { data, isLoading, error, mutate } = useSWR(
    firebaseUser ? ["events", firebaseUser.uid] : null,
    async () => {
      const token = await firebaseUser!.getIdToken();
      return authFetch("/api/events", token);
    },
    { revalidateOnFocus: false }
  );

  return {
    events: (data?.data ?? []) as Event[],
    isLoading,
    error,
    mutate,
  };
}

// ── useEvent (detalle de un evento) ───────────────────────────────────
export function useEvent(id: number | null) {
  const { firebaseUser } = useAuth();

  const { data, isLoading, error, mutate } = useSWR(
    firebaseUser && id ? ["event", id, firebaseUser.uid] : null,
    async () => {
      const token = await firebaseUser!.getIdToken();
      return authFetch(`/api/events/${id}`, token);
    },
    {
      revalidateOnFocus:    false,
      dedupingInterval:     5 * 60_000,
    }
  );

  return {
    event: (data?.data ?? null) as EventDetail | null,
    isLoading,
    error,
    mutate,
  };
}

// ── useCreateEvent ─────────────────────────────────────────────────────
export function useCreateEvent() {
  const { firebaseUser } = useAuth();
  const { mutate } = useEvents();

  const createEvent = async (data: CreateEventData): Promise<Event> => {
    const token = await firebaseUser!.getIdToken();
    const result = await authFetch("/api/events", token, {
      method: "POST",
      body: JSON.stringify(data),
    });
    await mutate();
    return result.data;
  };

  return { createEvent };
}

// ── useUpdateEvent ─────────────────────────────────────────────────────
export function useUpdateEvent() {
  const { firebaseUser } = useAuth();
  const { mutate } = useEvents();

  const updateEvent = async (id: number, data: UpdateEventData): Promise<Event> => {
    const token = await firebaseUser!.getIdToken();
    const result = await authFetch(`/api/events/${id}`, token, {
      method: "PUT",
      body: JSON.stringify(data),
    });
    await mutate();
    return result.data;
  };

  return { updateEvent };
}

// ── useDeleteEvent ─────────────────────────────────────────────────────
export function useDeleteEvent() {
  const { firebaseUser } = useAuth();
  const { mutate } = useEvents();

  const deleteEvent = async (id: number): Promise<void> => {
    const token = await firebaseUser!.getIdToken();
    await authFetch(`/api/events/${id}`, token, { method: "DELETE" });
    await mutate();
  };

  return { deleteEvent };
}
const normalize = (value: string) => value.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim();

export function filterEventsBySearch<T extends { name: string; location: string | null }>(events: T[], search: string): T[] {
  const query = normalize(search);
  if (!query) return events;

  return events.filter(({ name, location }) =>
    normalize(name).includes(query) || normalize(location ?? "").includes(query),
  );
}

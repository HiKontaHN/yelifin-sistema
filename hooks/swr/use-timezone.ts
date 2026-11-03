"use client";

import { useMe } from "@/hooks/swr/use-me";
import { DEFAULT_TIMEZONE, formatInstant } from "@/lib/date-utils";

export function useTimezone() {
  const { org, profile } = useMe();
  return org?.timezone ?? profile?.timezone ?? DEFAULT_TIMEZONE;
}

export function formatInTZ(
  dateStr: string | Date,
  tz: string,
  options: Intl.DateTimeFormatOptions,
) {
  return formatInstant(dateStr, tz, options);
}

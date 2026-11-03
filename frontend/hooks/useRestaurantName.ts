'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { OPS_PATHS } from '@/lib/ops';

type SettingsResponse = { success: true; settings: Record<string, string> };

// Module-level cache so N components rendering the header do not each
// trigger their own fetch. First caller populates it; everyone else
// reads the same promise. The restaurant settings page calls
// refreshRestaurantName() after a successful save so consumers do not
// keep showing the value cached at page load.
let cached: Promise<string> | null = null;
const listeners = new Set<(name: string) => void>();

function loadOnce(): Promise<string> {
  if (!cached) {
    cached = apiFetch<SettingsResponse>(OPS_PATHS.settings)
      .then((res) => res.settings['restaurant.name'] ?? '')
      .catch(() => '');
  }
  return cached;
}

/**
 * Invalidates the cached name and refetches it. Every hook subscriber
 * (header, report shells, …) re-renders with the fresh value.
 */
export function refreshRestaurantName(): void {
  cached = null;
  loadOnce().then((n) => {
    for (const l of listeners) l(n);
  });
}

/**
 * Returns the current restaurant name (Setting key 'restaurant.name'),
 * or an empty string while it is loading / if the fetch fails.
 *
 * Consumers should treat the empty string as 'do not render the name'.
 */
export function useRestaurantName(): string {
  const [name, setName] = useState('');
  useEffect(() => {
    let cancelled = false;
    listeners.add(setName);
    loadOnce().then((n) => {
      if (!cancelled) setName(n);
    });
    return () => {
      cancelled = true;
      listeners.delete(setName);
    };
  }, []);
  return name;
}

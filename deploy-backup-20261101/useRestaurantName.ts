'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { OPS_PATHS } from '@/lib/ops';

type SettingsResponse = { success: true; settings: Record<string, string> };

// Module-level cache so N components rendering the header do not each
// trigger their own fetch. First caller populates it; everyone else
// reads the same promise. Cache survives navigation within the SPA,
// which is fine — the restaurant name rarely changes mid-session.
let cached: Promise<string> | null = null;

function loadOnce(): Promise<string> {
  if (!cached) {
    cached = apiFetch<SettingsResponse>(OPS_PATHS.settings)
      .then((res) => res.settings['restaurant.name'] ?? '')
      .catch(() => '');
  }
  return cached;
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
    loadOnce().then((n) => {
      if (!cancelled) setName(n);
    });
    return () => { cancelled = true; };
  }, []);
  return name;
}

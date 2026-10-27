'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api';

export function IdleTimeout({
  timeoutMinutes = 5,
  warningSeconds = 30,
}: {
  timeoutMinutes?: number;
  warningSeconds?: number;
}) {
  const router = useRouter();
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const lastActivityRef = useRef<number>(Date.now());
  const firedRef = useRef<boolean>(false);
  const warningActiveRef = useRef<boolean>(false);

  useEffect(() => {
    // Reset the activity tracker on any user input
    const touch = () => {
      lastActivityRef.current = Date.now();
      if (warningActiveRef.current) {
        // If user interacts during the warning, cancel the warning
        warningActiveRef.current = false;
        setSecondsLeft(null);
      }
    };

    const events = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll'];
    events.forEach((event) => window.addEventListener(event, touch, { passive: true }));

    // Check every second
    const interval = setInterval(() => {
      const idleMs = Date.now() - lastActivityRef.current;
      const idleSeconds = Math.floor(idleMs / 1000);
      const timeoutSeconds = timeoutMinutes * 60;

      if (idleSeconds >= timeoutSeconds) {
        // Time's up - log out exactly once. Without this guard, the
        // interval would fire POST /logout every second until unmount.
        if (firedRef.current) return;
        firedRef.current = true;
        void (async () => {
          try { await apiFetch('/api/v1/auth/logout', { method: 'POST' }); } catch {}
          // Hard navigation instead of router.push so this works even if
          // the client router state is stale (e.g., after a long idle,
          // or under any timer manipulation).
          window.location.href = '/login';
        })();
      } else if (idleSeconds >= timeoutSeconds - warningSeconds) {
        // Show warning
        warningActiveRef.current = true;
        setSecondsLeft(timeoutSeconds - idleSeconds);
      } else if (warningActiveRef.current) {
        // User interacted, hide warning
        warningActiveRef.current = false;
        setSecondsLeft(null);
      }
    }, 1000);

    return () => {
      events.forEach((event) => window.removeEventListener(event, touch));
      clearInterval(interval);
    };
  }, [timeoutMinutes, warningSeconds, router]);

  if (secondsLeft === null) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <h2 className="text-lg font-medium text-slate-900">Session expiring soon</h2>
        <p className="mt-2 text-sm text-slate-600">
          You will be logged out in <strong>{secondsLeft} seconds</strong> due to inactivity.
          Touch the screen or press any key to stay logged in.
        </p>
        <button
          onClick={() => {
            lastActivityRef.current = Date.now();
            warningActiveRef.current = false;
            setSecondsLeft(null);
          }}
          className="mt-4 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
        >
          I'm still here
        </button>
      </div>
    </div>
  );
}
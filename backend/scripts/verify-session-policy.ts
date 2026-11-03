import { evaluateSession } from '../src/lib/sessionPolicy.js';

const HOUR = 60 * 60 * 1000;
const IDLE = 2;
const MAX_AGE = 24;

// Active user: heartbeat slides the cookie; lastSeen is "just now".
function activeAt(loginMs: number, elapsedMs: number) {
  return evaluateSession({
    nowMs: loginMs + elapsedMs,
    expiresAtMs: loginMs + elapsedMs + 12 * HOUR,
    lastSeenAtMs: loginMs + elapsedMs,
    createdAtMs: loginMs,
    idleHours: IDLE,
    maxAgeHours: MAX_AGE,
  }).kind;
}

// Idle user: no requests since login, so lastSeen stays at login time.
function idleSince(loginMs: number, idleMs: number) {
  return evaluateSession({
    nowMs: loginMs + idleMs,
    expiresAtMs: loginMs + idleMs + 12 * HOUR, // renewal kept the cookie valid
    lastSeenAtMs: loginMs,
    createdAtMs: loginMs,
    idleHours: IDLE,
    maxAgeHours: MAX_AGE,
  }).kind;
}

let failures = 0;
function check(label: string, actual: string, expected: string) {
  const ok = actual === expected;
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}: got ${actual}, expected ${expected}`);
}

// 1. Fresh session, active user -> OK
check('fresh session (0h)', activeAt(0, 0), 'OK');
// 2. Activity extends: lastSeen just now, 1h59m elapsed -> OK
check('1h59m active -> OK', activeAt(0, 1.98 * HOUR), 'OK');
// 3. Inactivity expires: 2h without a request -> IDLE_TIMEOUT
check('2h idle -> IDLE_TIMEOUT', idleSince(0, 2 * HOUR), 'IDLE_TIMEOUT');
// 4. Beyond idle limit -> IDLE_TIMEOUT even when cookie expiry is far off
check('5h idle -> IDLE_TIMEOUT', idleSince(0, 5 * HOUR), 'IDLE_TIMEOUT');
// 5. Active for 23h59m -> still OK (activity extends, under 24h cap)
check('23h59m active -> OK', activeAt(0, 23.98 * HOUR), 'OK');
// 6. Active continuously hits the 24h absolute cap -> MAX_AGE
check('24h active -> MAX_AGE', activeAt(0, 24 * HOUR), 'MAX_AGE');
// 7. Cap wins even if lastSeenAt is recent (constant activity)
{
  const v = evaluateSession({
    nowMs: 25 * HOUR,
    expiresAtMs: 37 * HOUR,
    lastSeenAtMs: 24.99 * HOUR, // user was active 36 seconds ago
    createdAtMs: 0,
    idleHours: IDLE,
    maxAgeHours: MAX_AGE,
  }).kind;
  check('24h cap with recent activity -> MAX_AGE', v, 'MAX_AGE');
}
// 8. Expired cookie fast-path still fires before other checks
{
  const v = evaluateSession({
    nowMs: 1 * HOUR,
    expiresAtMs: 0.5 * HOUR, // cookie already expired
    lastSeenAtMs: 0,
    createdAtMs: 0,
    idleHours: IDLE,
    maxAgeHours: MAX_AGE,
  }).kind;
  check('expired cookie -> EXPIRED', v, 'EXPIRED');
}
// 9. Idle and cookie expiry both reached: whichever is closest fires;
//    idle (2h) precedes cookie (12h), so IDLE_TIMEOUT.
{
  const v = evaluateSession({
    nowMs: 3 * HOUR,
    expiresAtMs: 12 * HOUR,
    lastSeenAtMs: 0,
    createdAtMs: 0,
    idleHours: IDLE,
    maxAgeHours: MAX_AGE,
  }).kind;
  check('idle before cookie expiry -> IDLE_TIMEOUT', v, 'IDLE_TIMEOUT');
}

if (failures > 0) {
  console.error(`${failures} check(s) failed`);
  process.exit(1);
}
console.log('All session-policy checks passed.');

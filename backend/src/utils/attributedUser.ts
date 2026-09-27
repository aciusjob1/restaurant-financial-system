import { ApiError } from '../errors/ApiError.js';

export type ActorRole = 'OWNER' | 'MANAGER' | 'WAITER' | 'AUDITOR';

/**
 * Resolves which user a record should be attributed to, given the
 * authenticated actor and an optional on-behalf-of hint.
 *
 * Phase 19b rules:
 *   WAITER          → self only. onBehalfOfUserId != self → 403.
 *   MANAGER / OWNER → onBehalfOfUserId is required → that user.
 *   AUDITOR / other → 403 (this role cannot create these resources).
 *
 * Returns the attributed user id. Throws ApiError on any violation.
 * Callers still run their own resource-ownership check against the
 * returned id (shift.userId / recon.userId must equal it).
 */
export function resolveAttributedUser(
  actor: { id: string; role: ActorRole },
  onBehalfOfUserId: string | null
): string {
  if (actor.role === 'WAITER') {
    if (onBehalfOfUserId !== null && onBehalfOfUserId !== actor.id) {
      throw new ApiError(
        403,
        'FORBIDDEN',
        'A waiter can only record for themselves.'
      );
    }
    return actor.id;
  }

  if (actor.role === 'MANAGER' || actor.role === 'OWNER') {
    if (!onBehalfOfUserId) {
      throw new ApiError(
        400,
        'VALIDATION_ERROR',
        'onBehalfOfUserId is required when a MANAGER or OWNER creates on behalf of a waiter.'
      );
    }
    return onBehalfOfUserId;
  }

  throw new ApiError(
    403,
    'FORBIDDEN',
    'This role cannot create this resource.'
  );
}
// The signed-in user, as a module singleton rather than a hook: the mutation
// helpers in `lib/` are plain functions called from event handlers, and there is
// only ever one session per tab. `AuthGate` sets it during render.

let userId: string | null = null;

export function setSessionUser(id: string | null): void {
  userId = id;
}

/** Throws rather than write a row the permission rules would hide from everyone. */
export function ownerId(): string {
  if (!userId) {
    throw new Error("No signed-in user — write attempted outside <AuthGate>");
  }
  return userId;
}

/** `$files` create permission goes by path prefix — an upload has no owner yet. */
export function ownedPath(path: string): string {
  return `${ownerId()}/${path}`;
}

/**
 * A `where` clause narrowing a query to your own rows. Not a security measure —
 * the rules already hide everyone else's. It is what keeps a query *complete*:
 * `limit` counts rows before the rules reject them, so an unfiltered limit would
 * spend its budget on other accounts' cards and come back short.
 */
export function mine(): { "owner.id": string } {
  return { "owner.id": ownerId() };
}

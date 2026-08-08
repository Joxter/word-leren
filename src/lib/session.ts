// The signed-in user, held as a module singleton.
//
// Every row this app writes needs an `owner` link (see `instant.perms.ts`), and
// the mutation helpers here in `lib/` are plain functions called from event
// handlers, not hooks. Threading a user id through all of them and their callers
// would touch every page for a value that never differs between them — there is
// exactly one session per tab. `AuthGate` sets it while rendering, before any
// handler underneath it can run, and clears it on sign-out.

let userId: string | null = null;

export function setSessionUser(id: string | null): void {
  userId = id;
}

/**
 * The signed-in user's id, for stamping `owner` on a new row. Throws rather than
 * writing an ownerless row, which the permission rules would make unreadable to
 * everybody including its author.
 */
export function ownerId(): string {
  if (!userId) {
    throw new Error("No signed-in user — write attempted outside <AuthGate>");
  }
  return userId;
}

/**
 * A storage path under the user's own folder. `$files` create permission is by
 * path prefix, because an upload has no owner link yet at the moment it lands.
 */
export function ownedPath(path: string): string {
  return `${ownerId()}/${path}`;
}

/**
 * A `where` clause narrowing a query to the signed-in user's rows, to be spread
 * into `$.where`.
 *
 * The permission rules already hide everyone else's data, so this is not what
 * makes a query safe. It is what makes a query *complete*: `limit` counts rows
 * before the rules get to reject them, so an unfiltered `limit: 500` over a
 * table with several accounts in it would spend the budget on other people's
 * cards and come back short.
 */
export function mine(): { "owner.id": string } {
  return { "owner.id": ownerId() };
}

/**
 * @fileoverview Signals when the initial Keycloak session check has finished.
 *
 * Route guards run as soon as the router starts — on a page reload that is
 * before Keycloak has restored the session, so `keycloak.authenticated` is
 * still false. Guards await `authReady` instead of bouncing the user to /login.
 */

let ready = false;
let resolveReady: () => void = () => undefined;

export const authReady: Promise<void> = new Promise((resolve) => {
  resolveReady = resolve;
});

/** Called by AuthProvider once the session check is done (either outcome). */
export function markAuthReady(): void {
  ready = true;
  resolveReady();
}

export function isAuthReady(): boolean {
  return ready;
}

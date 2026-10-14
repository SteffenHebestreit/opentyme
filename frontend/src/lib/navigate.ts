/** Leaves the app for another site (e.g. back to an OAuth client). Own module so tests can replace it. */
export function leaveTo(url: string): void {
  window.location.assign(url);
}

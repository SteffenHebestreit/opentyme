/**
 * Jest mock for the ESM-only `keycloak-js` package.
 *
 * The real package ships as native ESM (`export default class Keycloak`), which
 * Jest's CommonJS runtime cannot load from node_modules without transformation.
 * Unit tests never exercise real Keycloak network flows, so this lightweight
 * stand-in provides the surface the app touches at import/instantiation time.
 */

export default class Keycloak {
  token?: string;
  refreshToken?: string;
  authenticated = false;
  realmAccess?: { roles: string[] };

  constructor(_config?: unknown) {
    // no-op
  }

  init = jest.fn().mockResolvedValue(false);
  login = jest.fn().mockResolvedValue(undefined);
  logout = jest.fn().mockResolvedValue(undefined);
  register = jest.fn().mockResolvedValue(undefined);
  updateToken = jest.fn().mockResolvedValue(false);
  loadUserProfile = jest.fn().mockResolvedValue({});
  hasRealmRole = jest.fn().mockReturnValue(false);
  hasResourceRole = jest.fn().mockReturnValue(false);
  createLoginUrl = jest.fn().mockReturnValue('');
  createLogoutUrl = jest.fn().mockReturnValue('');
}

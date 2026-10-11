import type { AxiosInstance, AxiosResponse, InternalAxiosRequestConfig } from 'axios';
import { setupAuthInterceptor } from '@/api/interceptors/auth.interceptor';
import * as tokenManager from '@/services/auth/tokenManager';
import { keycloak } from '@/config/keycloak.config';

type ErrorHandler = (error: any) => Promise<never>;

describe('setupAuthInterceptor', () => {
  let responseErrorHandler: ErrorHandler;
  let requestHandler: (config: InternalAxiosRequestConfig) => Promise<InternalAxiosRequestConfig> | InternalAxiosRequestConfig;

  // jsdom's `window.location` and its `replace` method are both non-configurable
  // and read-only, so the navigation itself cannot be spied on. The interceptor
  // gates `clearTokens()` and the `replace('/login')` redirect on the exact same
  // `shouldForceLogout` condition, so asserting on `clearTokens` fully covers the
  // branching logic. The `replace('/login')` call is a harmless no-op in jsdom.

  beforeEach(() => {
    responseErrorHandler = async (error: any) => Promise.reject(error);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  const createAxiosInstance = (): AxiosInstance => {
    const instance = {
      interceptors: {
        request: {
          use: jest.fn((success: typeof requestHandler) => {
            requestHandler = success;
            return 0;
          }),
        },
        response: {
          use: jest.fn((_success: (response: AxiosResponse) => AxiosResponse, errorHandler: ErrorHandler) => {
            responseErrorHandler = errorHandler;
            return 0;
          }),
        },
      },
    };

    return instance as unknown as AxiosInstance;
  };

  it('does not clear tokens on 401 when a non-expired token still exists', async () => {
    const clearTokensSpy = jest.spyOn(tokenManager, 'clearTokens').mockImplementation(() => undefined);
    jest.spyOn(tokenManager, 'getAccessToken').mockReturnValue('token');
    jest.spyOn(tokenManager, 'isTokenExpired').mockReturnValue(false);

    setupAuthInterceptor(createAxiosInstance());

    await expect(responseErrorHandler({ response: { status: 401 } })).rejects.toEqual({ response: { status: 401 } });

    // Token present and unexpired → no forced logout, so tokens are kept.
    expect(clearTokensSpy).not.toHaveBeenCalled();
  });

  it('clears tokens on 401 when the token is missing or expired', async () => {
    const clearTokensSpy = jest.spyOn(tokenManager, 'clearTokens').mockImplementation(() => undefined);
    jest.spyOn(tokenManager, 'getAccessToken').mockReturnValue(null);
    jest.spyOn(tokenManager, 'isTokenExpired').mockReturnValue(true);

    setupAuthInterceptor(createAxiosInstance());

    await expect(responseErrorHandler({ response: { status: 401 } })).rejects.toEqual({ response: { status: 401 } });

    // Missing/expired token → forced logout: tokens cleared (and a /login redirect
    // is triggered, which is a no-op under jsdom).
    expect(clearTokensSpy).toHaveBeenCalled();
  });

  describe('refreshing before a request', () => {
    const config = () => ({ headers: {} }) as unknown as InternalAxiosRequestConfig;

    // keycloak.updateToken is already a jest.fn in the keycloak-js mock, so spies
    // on it share call history between tests
    beforeEach(() => jest.clearAllMocks());

    afterEach(() => {
      keycloak.authenticated = false;
      keycloak.token = undefined;
      keycloak.refreshToken = undefined;
    });

    it('refreshes an expired token first and sends the new one', async () => {
      keycloak.authenticated = true;
      jest.spyOn(tokenManager, 'isTokenExpired').mockReturnValue(true);
      jest.spyOn(tokenManager, 'shouldRefreshToken').mockReturnValue(false);
      const setTokens = jest.spyOn(tokenManager, 'setTokens').mockImplementation(() => undefined);
      jest.spyOn(keycloak, 'updateToken').mockImplementation(async () => {
        keycloak.token = 'fresh';
        keycloak.refreshToken = 'refresh';
        return true;
      });
      jest.spyOn(tokenManager, 'getAccessToken').mockReturnValue('fresh');

      setupAuthInterceptor(createAxiosInstance());
      const sent = await requestHandler(config());

      expect(keycloak.updateToken).toHaveBeenCalledWith(30);
      expect(setTokens).toHaveBeenCalledWith('fresh', 'refresh', undefined);
      expect(sent.headers.Authorization).toBe('Bearer fresh');
    });

    it('does not refresh a token that is still valid for a while', async () => {
      keycloak.authenticated = true;
      jest.spyOn(tokenManager, 'isTokenExpired').mockReturnValue(false);
      jest.spyOn(tokenManager, 'shouldRefreshToken').mockReturnValue(false);
      const updateToken = jest.spyOn(keycloak, 'updateToken');
      jest.spyOn(tokenManager, 'getAccessToken').mockReturnValue('still-good');

      setupAuthInterceptor(createAxiosInstance());
      const sent = await requestHandler(config());

      expect(updateToken).not.toHaveBeenCalled();
      expect(sent.headers.Authorization).toBe('Bearer still-good');
    });

    it('still sends the request when the refresh fails', async () => {
      keycloak.authenticated = true;
      jest.spyOn(tokenManager, 'isTokenExpired').mockReturnValue(true);
      jest.spyOn(keycloak, 'updateToken').mockRejectedValue(new Error('session ended'));
      jest.spyOn(tokenManager, 'getAccessToken').mockReturnValue('old');

      setupAuthInterceptor(createAxiosInstance());
      await expect(requestHandler(config())).resolves.toBeDefined();
    });
  });
});

import type { AxiosInstance, AxiosResponse, InternalAxiosRequestConfig } from 'axios';
import { setupAuthInterceptor } from '@/api/interceptors/auth.interceptor';
import * as tokenManager from '@/services/auth/tokenManager';

type ErrorHandler = (error: any) => Promise<never>;

describe('setupAuthInterceptor', () => {
  let responseErrorHandler: ErrorHandler;

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
          use: jest.fn((_success: (config: InternalAxiosRequestConfig) => InternalAxiosRequestConfig) => 0),
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
});
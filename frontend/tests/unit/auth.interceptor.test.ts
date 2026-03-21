import type { AxiosInstance, AxiosResponse, InternalAxiosRequestConfig } from 'axios';
import { setupAuthInterceptor } from '@/api/interceptors/auth.interceptor';
import * as tokenManager from '@/services/auth/tokenManager';

type ErrorHandler = (error: any) => Promise<never>;

describe('setupAuthInterceptor', () => {
  let responseErrorHandler: ErrorHandler;
  let originalLocation: Location;

  beforeEach(() => {
    responseErrorHandler = async (error: any) => Promise.reject(error);
    originalLocation = window.location;

    Object.defineProperty(window, 'location', {
      configurable: true,
      value: {
        pathname: '/time-tracking',
        replace: jest.fn(),
      },
    });
  });

  afterEach(() => {
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: originalLocation,
    });
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

  it('does not force redirect on 401 when a non-expired token still exists', async () => {
    const clearTokensSpy = jest.spyOn(tokenManager, 'clearTokens').mockImplementation(() => undefined);
    jest.spyOn(tokenManager, 'getAccessToken').mockReturnValue('token');
    jest.spyOn(tokenManager, 'isTokenExpired').mockReturnValue(false);

    setupAuthInterceptor(createAxiosInstance());

    await expect(responseErrorHandler({ response: { status: 401 } })).rejects.toEqual({ response: { status: 401 } });

    expect(clearTokensSpy).not.toHaveBeenCalled();
    expect(window.location.replace).not.toHaveBeenCalled();
  });

  it('redirects to login on 401 when the token is missing or expired', async () => {
    const clearTokensSpy = jest.spyOn(tokenManager, 'clearTokens').mockImplementation(() => undefined);
    jest.spyOn(tokenManager, 'getAccessToken').mockReturnValue(null);
    jest.spyOn(tokenManager, 'isTokenExpired').mockReturnValue(true);

    setupAuthInterceptor(createAxiosInstance());

    await expect(responseErrorHandler({ response: { status: 401 } })).rejects.toEqual({ response: { status: 401 } });

    expect(clearTokensSpy).toHaveBeenCalled();
    expect(window.location.replace).toHaveBeenCalledWith('/login');
  });
});
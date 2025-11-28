/**
 * @fileoverview Settings Service
 * API client for user settings and company information management
 */

import apiClient from './client';
import { Settings } from '../types';

/**
 * Get current user's settings
 */
export const getSettings = async (): Promise<Settings> => {
  const response = await apiClient.get<Settings>('/settings');
  return response.data;
};

/**
 * Update current user's settings
 */
export const updateSettings = async (settings: Partial<Settings>): Promise<Settings> => {
  const response = await apiClient.put<Settings>('/settings', settings);
  return response.data;
};

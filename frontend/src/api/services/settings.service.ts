/**
 * @fileoverview Settings Service
 * API client for user settings and company information management
 */

import apiClient from './client';
import { Settings } from '../types';

/**
 * Get current user's settings
 * Also syncs user_region to localStorage for use by chart components
 */
export const getSettings = async (): Promise<Settings> => {
  const response = await apiClient.get<Settings>('/settings');
  const settings = response.data;
  
  // Sync user_region to localStorage for chart holiday coloring
  if (settings.user_region) {
    localStorage.setItem('user_region', settings.user_region);
  }
  
  return settings;
};

/**
 * Update current user's settings
 */
export const updateSettings = async (settings: Partial<Settings>): Promise<Settings> => {
  const response = await apiClient.put<Settings>('/settings', settings);
  return response.data;
};

/** Result of a connection test against the configured AI / speech-to-text server. */
export interface ConnectionTestResult {
  ok: boolean;
  latencyMs?: number;
  /** Model ids the AI server offers (max 50) */
  models?: string[];
  /** Whether the configured model is among them (null when no model is set) */
  modelFound?: boolean | null;
  code?: 'LLM_UNREACHABLE' | 'LLM_TIMEOUT' | 'LLM_AUTH' | 'LLM_MODEL' | 'STT_UNREACHABLE' | 'STT_TIMEOUT' | 'INVALID_URL';
  message?: string;
}

/**
 * Check that the AI server answers (GET {url}/models). Fields left out use the stored
 * values — so the stored API key is used unless a new one was typed.
 */
export const testAiConnection = async (params: {
  ai_api_url?: string | null;
  ai_api_key?: string;
  ai_model?: string | null;
}): Promise<ConnectionTestResult> => {
  const response = await apiClient.post<ConnectionTestResult>('/settings/test-ai', params);
  return response.data;
};

/** Check that the speech-to-text server answers. */
export const testSttConnection = async (params: {
  stt_api_url?: string | null;
  stt_api_key?: string;
}): Promise<ConnectionTestResult> => {
  const response = await apiClient.post<ConnectionTestResult>('/settings/test-stt', params);
  return response.data;
};

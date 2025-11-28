/**
 * @fileoverview Depreciation API Service
 * Frontend service for depreciation reporting and asset management
 */

import api from './client';

export interface DepreciationSummary {
  year: number;
  summary: {
    total_assets_under_depreciation: number;
    immediate_deductions: number;
    no_depreciation: number;
    total_tax_deductible: number;
    immediate_amount: number;
    depreciation_amount: number;
    deferred_amount: number;
    avg_depreciation_years: number;
  };
  by_category: Array<{
    useful_life_category: string;
    count: number;
    total_net_amount: number;
    total_tax_deductible: number;
    avg_years: number;
  }>;
  monthly: Array<{
    month: number;
    assets_count: number;
    tax_deductible: number;
    asset_value: number;
  }>;
}

export interface Asset {
  id: string;
  description: string;
  category: string;
  purchase_date: string;
  net_amount: number;
  depreciation_years: number;
  useful_life_category: string;
  depreciation_method: string;
  first_year_deduction: number;
  annual_depreciation: number;
  years_elapsed: number;
  remaining_value: number;
  status: 'active' | 'fully_depreciated';
}

export interface AssetRegister {
  total: number;
  assets: Asset[];
}

export interface DepreciationSchedule {
  current_year: number;
  schedule: Array<{
    year: number;
    total_depreciation: number;
    assets: Array<{
      id: string;
      description: string;
      category: string;
      annual_depreciation: number;
      year_of_depreciation: number;
      remaining_years: number;
    }>;
  }>;
}

export interface AssetDepreciationDetail {
  asset: Asset & {
    purchase_year: number;
    purchase_month: number;
  };
  yearly_depreciation: Array<{
    year: number;
    amount: number;
    is_current_year: boolean;
    is_past: boolean;
  }>;
  total_depreciated: number;
  remaining_value: number;
}

/**
 * Get depreciation summary by year
 */
export const getDepreciationSummary = async (year?: number): Promise<DepreciationSummary> => {
  const params = year ? { year } : {};
  const response = await api.get('/depreciation/summary', { params });
  return response.data;
};

/**
 * Get asset register with optional filters
 */
export const getAssetRegister = async (filters?: {
  year?: number;
  category?: string;
  status?: 'active' | 'fully_depreciated';
}): Promise<AssetRegister> => {
  const response = await api.get('/depreciation/asset-register', { params: filters });
  return response.data;
};

/**
 * Get depreciation schedule (future projections)
 */
export const getDepreciationSchedule = async (years: number = 5): Promise<DepreciationSchedule> => {
  const response = await api.get('/depreciation/schedule', { params: { years } });
  return response.data;
};

/**
 * Get detailed depreciation info for specific asset
 */
export const getAssetDepreciation = async (assetId: string): Promise<AssetDepreciationDetail> => {
  const response = await api.get(`/depreciation/asset/${assetId}`);
  return response.data;
};

const depreciationService = {
  getDepreciationSummary,
  getAssetRegister,
  getDepreciationSchedule,
  getAssetDepreciation,
};

export default depreciationService;

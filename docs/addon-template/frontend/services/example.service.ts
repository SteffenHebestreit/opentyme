/**
 * Example API Service
 * 
 * Frontend service for making API calls to the addon backend.
 */

interface ProcessResponse {
  success: boolean;
  data?: any;
  message?: string;
  error?: string;
}

interface StatusResponse {
  success: boolean;
  status?: {
    initialized: boolean;
    version: string;
    timestamp: string;
  };
}

/**
 * Get addon status
 */
export const getStatus = async (): Promise<StatusResponse> => {
  const response = await fetch('/api/addons/example/status');
  return response.json();
};

/**
 * Get user's data
 */
export const getData = async (): Promise<ProcessResponse> => {
  const response = await fetch('/api/addons/example/data');
  return response.json();
};

/**
 * Process data
 */
export const processData = async (input: any): Promise<ProcessResponse> => {
  const response = await fetch('/api/addons/example/process', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ input }),
  });
  return response.json();
};

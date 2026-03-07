/**
 * Example Page Component
 * 
 * This is a full page component that will be accessible via routing.
 * Route: /example-addon
 */

import React, { useState, useEffect } from 'react';

const ExamplePage: React.FC = () => {
  const [status, setStatus] = useState<any>(null);
  const [data, setData] = useState<any>(null);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);

  // Load status on mount
  useEffect(() => {
    loadStatus();
  }, []);

  const loadStatus = async () => {
    try {
      const response = await fetch('/api/addons/example/status');
      const result = await response.json();
      setStatus(result.status);
    } catch (error) {
      console.error('Failed to load status:', error);
    }
  };

  const loadData = async () => {
    try {
      const response = await fetch('/api/addons/example/data');
      const result = await response.json();
      setData(result.data);
    } catch (error) {
      console.error('Failed to load data:', error);
    }
  };

  const handleProcess = async () => {
    if (!input.trim()) {
      alert('Please enter some input');
      return;
    }

    setLoading(true);
    
    try {
      const response = await fetch('/api/addons/example/process', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ input }),
      });

      const result = await response.json();
      
      if (result.success) {
        setData(result.data);
        setInput('');
        alert('Data processed successfully!');
      } else {
        alert(`Error: ${result.message}`);
      }
    } catch (error) {
      console.error('Failed to process data:', error);
      alert('Failed to process data');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container mx-auto p-6">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Example Addon
          </h1>
          <p className="text-gray-600">
            This is a demonstration page for the example addon template.
          </p>
        </div>

        {/* Status Card */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">Addon Status</h2>
          {status ? (
            <div className="space-y-2">
              <div className="flex items-center">
                <span className="w-32 text-gray-600">Initialized:</span>
                <span className={status.initialized ? 'text-green-600' : 'text-red-600'}>
                  {status.initialized ? '✓ Yes' : '✗ No'}
                </span>
              </div>
              <div className="flex items-center">
                <span className="w-32 text-gray-600">Version:</span>
                <span>{status.version}</span>
              </div>
              <div className="flex items-center">
                <span className="w-32 text-gray-600">Last Check:</span>
                <span className="text-sm text-gray-500">
                  {new Date(status.timestamp).toLocaleString()}
                </span>
              </div>
            </div>
          ) : (
            <p className="text-gray-500">Loading status...</p>
          )}
        </div>

        {/* Data Processing Card */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">Process Data</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Input Data
              </label>
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Enter some text to process"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                disabled={loading}
              />
            </div>
            <button
              onClick={handleProcess}
              disabled={loading}
              className="px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700 disabled:opacity-50"
            >
              {loading ? 'Processing...' : 'Process Data'}
            </button>
          </div>
        </div>

        {/* Results Card */}
        {data && (
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold mb-4">Results</h2>
            <pre className="bg-gray-100 p-4 rounded overflow-x-auto">
              {JSON.stringify(data, null, 2)}
            </pre>
          </div>
        )}

        {/* Load Data Button */}
        <div className="mt-4">
          <button
            onClick={loadData}
            className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700"
          >
            Load Saved Data
          </button>
        </div>
      </div>
    </div>
  );
};

export default ExamplePage;

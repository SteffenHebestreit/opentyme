/**
 * Example Button - Slot Component
 * 
 * This component is injected into the "expense-form-actions" slot.
 * It demonstrates how to create a slot component that receives context.
 */

import React, { useState } from 'react';

interface ExampleButtonProps {
  // Context passed from the slot location
  expense?: any;
  onUpdate?: (data: any) => void;
}

const ExampleButton: React.FC<ExampleButtonProps> = ({ expense, onUpdate }) => {
  const [loading, setLoading] = useState(false);

  const handleClick = async () => {
    setLoading(true);
    
    try {
      // Example: Call addon API
      console.log('[Example Addon] Processing expense:', expense);
      
      // Simulate async operation
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Update the parent component if callback provided
      if (onUpdate) {
        onUpdate({
          processed: true,
          timestamp: new Date().toISOString(),
        });
      }
      
      alert('Example action completed!');
    } catch (error) {
      console.error('[Example Addon] Error:', error);
      alert('Example action failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      className="px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700 disabled:opacity-50"
    >
      {loading ? 'Processing...' : '✨ Example Action'}
    </button>
  );
};

export default ExampleButton;

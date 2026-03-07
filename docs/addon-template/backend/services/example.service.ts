/**
 * Example Service
 * 
 * Business logic for the example addon.
 * Services should be stateful and manage their own lifecycle.
 */

export class ExampleService {
  private initialized: boolean = false;
  private data: Map<string, any> = new Map();

  /**
   * Initialize the service
   * Called during addon initialization
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      console.warn('[ExampleService] Already initialized');
      return;
    }

    console.log('[ExampleService] Initializing...');
    
    // Perform initialization tasks
    // e.g., connect to external APIs, load configuration, etc.
    
    this.initialized = true;
    console.log('[ExampleService] Initialized successfully');
  }

  /**
   * Check if the service is initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Example method: Process data
   */
  async processData(userId: string, input: any): Promise<any> {
    if (!this.initialized) {
      throw new Error('Service not initialized');
    }

    console.log(`[ExampleService] Processing data for user ${userId}`);
    
    // Your business logic here
    const result = {
      processed: true,
      input,
      timestamp: new Date().toISOString(),
    };

    // Store in memory (in production, use a database)
    this.data.set(userId, result);

    return result;
  }

  /**
   * Example method: Get user data
   */
  async getUserData(userId: string): Promise<any> {
    return this.data.get(userId) || null;
  }

  /**
   * Cleanup resources
   * Called during addon shutdown
   */
  async cleanup(): Promise<void> {
    console.log('[ExampleService] Cleaning up...');
    
    this.data.clear();
    this.initialized = false;
    
    console.log('[ExampleService] Cleanup complete');
  }
}

// Export singleton instance
export const exampleService = new ExampleService();

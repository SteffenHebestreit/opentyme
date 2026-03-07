/**
 * Backend Entry Point
 * 
 * This file exports the addon plugin that will be loaded by OpenTYME.
 * It defines the initialization logic, routes, and lifecycle hooks.
 */

import { Router } from 'express';
import routes from './routes';
import { exampleService } from './services/example.service';

// Define the plugin interface matching OpenTYME's expectations
interface AddonPlugin {
  name: string;
  initialize?: (context: PluginContext) => Promise<void>;
  routes?: Router;
  onUserInit?: (userId: string) => Promise<void>;
  shutdown?: () => Promise<void>;
}

interface PluginContext {
  app: any;
  logger: any;
  database: any;
}

// Export the plugin configuration
export const plugin: AddonPlugin = {
  name: 'example-addon',
  
  /**
   * Initialize the addon
   * Called once when the application starts
   */
  async initialize(context: PluginContext): Promise<void> {
    const { logger } = context;
    
    logger.info('[Example Addon] Initializing...');
    
    try {
      // Initialize services
      await exampleService.initialize();
      
      logger.info('[Example Addon] Initialized successfully');
    } catch (error: any) {
      logger.error('[Example Addon] Initialization failed:', error.message);
      throw error;
    }
  },
  
  /**
   * Provide routes
   * These will be mounted at the prefix defined in addon-manifest.json
   */
  routes,
  
  /**
   * Per-user initialization
   * Called when a user first accesses addon functionality
   */
  async onUserInit(userId: string): Promise<void> {
    console.log(`[Example Addon] Initializing for user: ${userId}`);
    // Perform any user-specific setup here
  },
  
  /**
   * Shutdown hook
   * Called when the application is shutting down
   */
  async shutdown(): Promise<void> {
    console.log('[Example Addon] Shutting down...');
    await exampleService.cleanup();
  }
};

// Default export
export default plugin;

import React, { createContext, useContext, useReducer, useEffect, ReactNode } from 'react';

// Define types for the application state
export interface User {
  id: string;
  email: string;
  username: string;
  role: 'user' | 'admin';
}

interface AppState {
  user: User | null;
  isAuthenticated: boolean;
  theme: 'light' | 'dark'; // For future dark/light theme implementation
}

type AppAction =
  | { type: 'LOGIN_SUCCESS'; payload: User }
  | { type: 'LOGOUT' }
  | { type: 'SET_THEME'; payload: 'light' | 'dark' };

// Initial state
const initialState: AppState = {
  user: null,
  isAuthenticated: false,
  theme: 'dark', // Default to dark theme
};

// Reducer function
function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'LOGIN_SUCCESS':
      return {
        ...state,
        user: action.payload,
        isAuthenticated: true,
      };
    case 'LOGOUT':
      return {
        ...state,
        user: null,
        isAuthenticated: false,
      };
    case 'SET_THEME':
      return {
        ...state,
        theme: action.payload,
      };
    default:
      return state;
  }
}

// Create context
const AppContext = createContext<{
  state: AppState;
  dispatch: React.Dispatch<AppAction>;
} | null>(null);

// Provider component
export function AppProvider({ children }: { children: ReactNode }) {
  // Initialize theme from localStorage or system preference
  const [state, dispatch] = useReducer(appReducer, initialState);

  useEffect(() => {
    const storedTheme = localStorage.getItem('theme') as 'light' | 'dark' | null;

    // Only use stored theme if exists, otherwise keep initial dark theme
    if (storedTheme) {
      dispatch({ type: 'SET_THEME', payload: storedTheme });
    }
  }, []); // Run only on mount

  useEffect(() => {
    // Apply the theme class to the root HTML element
    document.documentElement.classList.toggle('dark', state.theme === 'dark');
    
    // Save theme preference to localStorage
    localStorage.setItem('theme', state.theme);
  }, [state.theme]);

  return (
    <AppContext.Provider value={{ state, dispatch }}>
      {children}
    </AppContext.Provider>
  );
}

// Custom hook to consume the context
export function useApp() {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
}

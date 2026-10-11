import React, { createContext, useContext, useReducer, useEffect, ReactNode } from 'react';

// Define types for the application state
export interface User {
  id: string;
  email: string;
  username: string;
  role: 'user' | 'admin';
}

export type ResolvedTheme = 'light' | 'dark';
export type ThemePreference = ResolvedTheme | 'system';
/**
 * Colour vision the status and chart colours are tuned for. `redgreen` swaps the
 * green/red/amber status colours for blue/orange/yellow (protanopia, deuteranopia).
 */
export type ColorVision = 'standard' | 'redgreen';

interface AppState {
  activeProjectId?: string | null;
  user: User | null;
  isAuthenticated: boolean;
  /** The theme actually shown (system preference already resolved). */
  theme: ResolvedTheme;
  /** What the user picked: a fixed theme or "follow the OS". */
  themePreference: ThemePreference;
  colorVision: ColorVision;
}

type AppAction =
  | { type: 'LOGIN_SUCCESS'; payload: User }
  | { type: 'LOGOUT' }
  | { type: 'SET_THEME'; payload: ThemePreference }
  | { type: 'SYSTEM_THEME_CHANGED'; payload: ResolvedTheme }
  | { type: 'SET_COLOR_VISION'; payload: ColorVision };

const THEME_STORAGE_KEY = 'theme';
// Also read before first paint by the inline script in index.html — keep the key in sync
const COLOR_VISION_STORAGE_KEY = 'colorVision';

const readStoredColorVision = (): ColorVision => {
  try {
    return localStorage.getItem(COLOR_VISION_STORAGE_KEY) === 'redgreen' ? 'redgreen' : 'standard';
  } catch {
    return 'standard';
  }
};

const systemTheme = (): ResolvedTheme =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';

const readStoredPreference = (): ThemePreference => {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    if (stored === 'light' || stored === 'dark' || stored === 'system') return stored;
  } catch {
    // storage unavailable (private mode) — fall through
  }
  return 'system';
};

const resolve = (preference: ThemePreference): ResolvedTheme =>
  preference === 'system' ? systemTheme() : preference;

const createInitialState = (): AppState => {
  const themePreference = readStoredPreference();
  return {
    user: null,
    isAuthenticated: false,
    themePreference,
    theme: resolve(themePreference),
    colorVision: readStoredColorVision(),
  };
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
        themePreference: action.payload,
        theme: resolve(action.payload),
      };
    case 'SYSTEM_THEME_CHANGED':
      return state.themePreference === 'system' ? { ...state, theme: action.payload } : state;
    case 'SET_COLOR_VISION':
      return { ...state, colorVision: action.payload };
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
  const [state, dispatch] = useReducer(appReducer, undefined, createInitialState);

  // Follow OS theme changes while the preference is "system"
  useEffect(() => {
    const media = window.matchMedia?.('(prefers-color-scheme: dark)');
    if (!media) return;
    const onChange = (event: MediaQueryListEvent) =>
      dispatch({ type: 'SYSTEM_THEME_CHANGED', payload: event.matches ? 'dark' : 'light' });
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    // Suppress colour transitions for the one frame the theme flips, so the
    // whole page switches at once instead of every element fading separately.
    root.classList.add('[&_*]:!transition-none');
    root.classList.toggle('dark', state.theme === 'dark');
    const frame = window.requestAnimationFrame(() => root.classList.remove('[&_*]:!transition-none'));

    try {
      localStorage.setItem(THEME_STORAGE_KEY, state.themePreference);
    } catch {
      // storage unavailable — the choice just won't survive a reload
    }
    return () => window.cancelAnimationFrame(frame);
  }, [state.theme, state.themePreference]);

  // Status colours follow `data-vision` on <html> (CSS variables in index.css)
  useEffect(() => {
    const root = document.documentElement;
    if (state.colorVision === 'standard') delete root.dataset.vision;
    else root.dataset.vision = state.colorVision;
    try {
      localStorage.setItem(COLOR_VISION_STORAGE_KEY, state.colorVision);
    } catch {
      // storage unavailable — the choice just won't survive a reload
    }
  }, [state.colorVision]);

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

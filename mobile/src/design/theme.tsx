import React, { createContext, useContext } from 'react';
import type { PropsWithChildren } from 'react';
import { lightTheme } from './tokens';
import type { TogtTheme } from './tokens';

const TogtThemeContext = createContext<TogtTheme>(lightTheme);

export type TogtThemeProviderProps = PropsWithChildren<{
  theme?: TogtTheme;
}>;

export function TogtThemeProvider({
  children,
  theme = lightTheme,
}: TogtThemeProviderProps) {
  return <TogtThemeContext.Provider value={theme}>{children}</TogtThemeContext.Provider>;
}

export function useTogtTheme(): TogtTheme {
  return useContext(TogtThemeContext);
}

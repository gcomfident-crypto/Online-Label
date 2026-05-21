export const theme = {
  color: {
    text: '#17211b',
    muted: '#5f625b',
    surface: '#fffdf8',
    surfaceRaised: '#fffaf1',
    border: '#d8d5ce',
    primary: '#194c3f',
    danger: '#8a342b',
    warning: '#72511c',
    info: '#244f66',
  },
  radius: {
    sm: '4px',
    md: '8px',
  },
  shadow: {
    panel: '0 18px 58px rgba(42, 35, 25, 0.1)',
  },
} as const;

export type ThemeToken = typeof theme;

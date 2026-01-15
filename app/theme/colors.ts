export const colors = {
  primary: '#00f3ff',
  secondary: '#bd00ff',
  danger: '#ff4d4f',

  text: {
    primary: '#fff',
    secondary: '#94a3b8',
    muted: 'rgba(255, 255, 255, 0.5)',
    dark: '#020617',
  },

  gradient: {
    user: 'linear-gradient(135deg, #00f3ff 0%, #2563eb 100%)',
    weather: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
  },

  background: {
    transparent: 'transparent',
    overlay: 'rgba(10, 15, 30, 0.4)',
    dark: 'rgba(5, 11, 20, 0.8)',
    code: 'rgba(0, 243, 255, 0.1)',
    pill: 'rgba(10, 15, 30, 0.6)',
    hover: {
      primary: 'rgba(0, 243, 255, 0.15)',
      danger: 'rgba(255, 77, 79, 0.15)',
    },
  },

  border: {
    primary: '#00f3ff',
    light: 'rgba(0, 243, 255, 0.15)',
  },

  shadow: {
    primary: '0 0 15px rgba(0, 243, 255, 0.3)',
  },
} as const;

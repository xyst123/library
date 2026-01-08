export const colors = {
  primary: '#1dd1f7',
  secondary: '#bd00ff',
  danger: '#ff4d4f',
  
  text: {
    primary: '#fff',
    secondary: '#a0a0a0',
    muted: '#666',
    dark: '#000',
  },
  
  gradient: {
    user: 'linear-gradient(135deg, #1dd1f7 0%, #2563eb 100%)',
    weather: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
  },
  
  background: {
    transparent: 'transparent',
    overlay: 'rgba(255, 255, 255, 0.05)',
    dark: 'rgba(0, 0, 0, 0.3)',
    code: 'rgba(0, 243, 255, 0.1)',
    hover: {
      primary: 'rgba(29, 209, 247, 0.1)',
      danger: 'rgba(255, 77, 79, 0.1)',
    },
  },
  
  border: {
    primary: '#1dd1f7',
    light: 'rgba(255, 255, 255, 0.1)',
  },
  
  shadow: {
    primary: '0 0 10px rgba(29, 209, 247, 0.3)',
  },
} as const;

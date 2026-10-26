/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        portal: {
          navy: '#0b192c',
          navyDark: '#060d17',
          navyLight: '#1e3e62',
          gold: '#d97706',
          goldLight: '#f59e0b',
          goldDark: '#92400e',
          surface: '#ffffff',
          bg: '#f8fafc',
          subtle: '#f1f5f9',
          border: '#e2e8f0',
          borderStrong: '#cbd5e1',
          text: '#0f172a',
          secondary: '#475569',
          muted: '#64748b',
          success: '#15803d',
          warning: '#b45309',
          error: '#b91c1c',
        },
        stitch: {
          primary: '#1a73e8',
          primaryDark: '#1557b0',
          accent: '#6366f1',
          surface: '#ffffff',
          card: '#f8fafc',
          badge: '#e8f0fe',
        },
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        'xs': '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
        'subtle': '0 1px 3px 0 rgba(0, 0, 0, 0.05), 0 1px 2px -1px rgba(0, 0, 0, 0.05)',
        'elevated': '0 4px 6px -1px rgba(0, 0, 0, 0.07), 0 2px 4px -2px rgba(0, 0, 0, 0.05)',
        'glass': '0 8px 32px 0 rgba(31, 38, 135, 0.15)',
        'card-hover': '0 10px 25px -5px rgba(0, 0, 0, 0.08), 0 8px 10px -6px rgba(0, 0, 0, 0.03)',
      },
    },
  },
  plugins: [],
};

import type { Config } from 'tailwindcss';

const v = (n: string) => `hsl(var(--${n}) / <alpha-value>)`;

export default {
  darkMode: ['selector', '[data-theme="dark"]'],
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: v('bg'), card: v('card'), fg: v('fg'), muted: v('muted'), 'muted-fg': v('muted-fg'),
        border: v('border'), primary: v('primary'), 'primary-fg': v('primary-fg'), soft: v('soft'),
        todo: v('todo'), running: v('running'), done: v('done'), blocked: v('blocked'),
      },
      borderRadius: { xl: '0.9rem', '2xl': '1.15rem' },
      boxShadow: {
        card: '0 1px 2px hsl(var(--shadow) / .06), 0 1px 1px hsl(var(--shadow) / .04)',
        pop: '0 12px 40px hsl(var(--shadow) / .18)',
      },
      fontFamily: { sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'] },
      keyframes: {
        slide: { from: { transform: 'translateX(24px)', opacity: '0' }, to: { transform: 'none', opacity: '1' } },
        fade: { from: { opacity: '0' }, to: { opacity: '1' } },
        pulseRing: { '0%': { transform: 'scale(1)', opacity: '.7' }, '100%': { transform: 'scale(2.6)', opacity: '0' } },
      },
      animation: { slide: 'slide .18s ease-out', fade: 'fade .15s ease-out', ring: 'pulseRing 1.6s ease-out infinite' },
    },
  },
  plugins: [],
} satisfies Config;

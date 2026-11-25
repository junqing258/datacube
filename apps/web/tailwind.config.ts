import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#0052ff',
          hover: '#003ecc',
          disabled: '#a8b8cc',
          soft: '#edf3ff',
        },
        ink: '#0a0b0d',
        body: '#5b616e',
        muted: '#636a76',
        'muted-soft': '#a8acb3',
        hairline: {
          DEFAULT: '#dee1e6',
          soft: '#eef0f3',
        },
        canvas: '#ffffff',
        surface: {
          soft: '#f7f7f7',
          strong: '#eef0f3',
          dark: '#0a0b0d',
          elevated: '#16181c',
        },
        up: '#05b169',
        down: '#cf202f',
      },
      borderRadius: {
        input: '12px',
        card: '24px',
        panel: '28px',
        pill: '100px',
      },
      fontFamily: {
        sans: [
          'Inter',
          '-apple-system',
          'BlinkMacSystemFont',
          '"Segoe UI"',
          '"PingFang SC"',
          '"Microsoft YaHei"',
          'sans-serif',
        ],
        display: [
          'Inter',
          '-apple-system',
          'BlinkMacSystemFont',
          '"Segoe UI"',
          '"PingFang SC"',
          '"Microsoft YaHei"',
          'sans-serif',
        ],
        mono: ['"JetBrains Mono"', '"SFMono-Regular"', 'Menlo', 'Consolas', 'monospace'],
      },
      boxShadow: {
        card: '0 4px 12px rgba(0, 0, 0, 0.04)',
      },
    },
  },
  plugins: [],
} satisfies Config;

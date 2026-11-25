import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#312d2a',
          hover: '#47423e',
          soft: '#f1efed',
        },
        ink: '#161513',
        body: '#47423e',
        muted: '#625b55',
        hairline: {
          DEFAULT: '#e4e1dd',
          soft: '#e9e7e4',
        },
        'field-border': '#d4cfca',
        canvas: '#ffffff',
        surface: {
          soft: '#fbf9f8',
          tint: '#f5f4f2',
          warm: '#f1efed',
          dark: '#211e1c',
        },
        brand: '#c74634',
        link: '#006b8f',
        gold: '#f0cc71',
        focus: '#227e9e',
        up: '#33553c',
        down: '#b63020',
      },
      borderRadius: {
        input: '6px',
        card: '8px',
        pill: '9999px',
      },
      fontFamily: {
        sans: ['"Oracle Sans"', 'system-ui', '"PingFang SC"', '"Microsoft YaHei"', 'sans-serif'],
        display: ['Georgia', '"Songti SC"', '"Noto Serif CJK SC"', 'SimSun', 'serif'],
        mono: ['Consolas', '"SFMono-Regular"', 'Menlo', 'monospace'],
      },
    },
  },
  plugins: [],
} satisfies Config;

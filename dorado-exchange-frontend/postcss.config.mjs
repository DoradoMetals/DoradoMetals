const config = {
  plugins: ["@tailwindcss/postcss"],
  extend: {
    keyframes: {
      shine: {
        '0%': { backgroundPosition: '200% 0' },
        '25%': { backgroundPosition: '-200% 0' },
        '100%': { backgroundPosition: '-200% 0' },
      },
    },
    animation: {
      shine: 'shine 3s ease-out infinite',
    },
  },
}

export default config;

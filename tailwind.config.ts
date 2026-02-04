import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}"
  ],
  theme: {
    extend: {
      colors: {
        background: "#07080a",
        panel: "#111318",
        muted: "#6a6b6c"
      }
    }
  },
  plugins: []
};

export default config;

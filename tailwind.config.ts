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
        void: "#0A0A0A",
        pilot: "#E63946",
        terminal: "#2EC4B6",
        holo: "#F1FAEE",
        muted: "#8B8F9C"
      },
      fontFamily: {
        heading: ["var(--font-space)", "var(--font-chakra)", "system-ui", "sans-serif"],
        body: ["var(--font-inter)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "SFMono-Regular", "monospace"]
      },
      boxShadow: {
        glow: "0 0 25px rgba(230, 57, 70, 0.35)",
        teal: "0 0 20px rgba(46, 196, 182, 0.35)",
        inset: "inset 0 0 30px rgba(230, 57, 70, 0.2)"
      },
      backgroundImage: {
        "radial-grid":
          "radial-gradient(circle at top, rgba(230,57,70,0.15), transparent 55%), radial-gradient(circle at 20% 20%, rgba(46,196,182,0.12), transparent 40%)",
        panel: "linear-gradient(135deg, rgba(20,20,24,0.9), rgba(10,10,10,0.95))"
      },
      keyframes: {
        pulseGlow: {
          "0%, 100%": { opacity: "0.3" },
          "50%": { opacity: "1" }
        },
        scan: {
          "0%": { transform: "translateY(-100%)" },
          "100%": { transform: "translateY(100%)" }
        }
      },
      animation: {
        "pulse-glow": "pulseGlow 2.4s ease-in-out infinite",
        scan: "scan 6s linear infinite"
      }
    }
  },
  plugins: []
};

export default config;

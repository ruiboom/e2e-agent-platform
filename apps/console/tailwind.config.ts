import type { Config } from "tailwindcss";
import preset from "@agent-platform/design-system/tailwind-preset";

const config: Config = {
  presets: [preset as Partial<Config>],
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
    // pick up Tailwind classes used inside the design-system primitives
    "../../packages/design-system/src/**/*.{ts,tsx}",
  ],
  theme: { extend: {} },
  plugins: [],
};

export default config;

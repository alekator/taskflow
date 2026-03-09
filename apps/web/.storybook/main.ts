import path from "node:path";
import { fileURLToPath } from "node:url";
import type { StorybookConfig } from "@storybook/react-vite";

const storybookDir = path.dirname(fileURLToPath(import.meta.url));

const config: StorybookConfig = {
  stories: ["../src/**/*.stories.@(js|jsx|mjs)"],
  addons: [
    "@storybook/addon-essentials",
    "@storybook/addon-interactions",
    "@storybook/addon-a11y",
  ],
  framework: {
    name: "@storybook/react-vite",
    options: {},
  },
  async viteFinal(baseConfig) {
    const aliases = Array.isArray(baseConfig.resolve?.alias)
      ? baseConfig.resolve.alias
      : [];

    return {
      ...baseConfig,
      resolve: {
        ...(baseConfig.resolve ?? {}),
        alias: [
          ...aliases,
          {
            find: "next/link",
            replacement: path.resolve(storybookDir, "./mocks/next-link.jsx"),
          },
        ],
      },
    };
  },
  docs: {
    autodocs: "tag",
  },
};

export default config;

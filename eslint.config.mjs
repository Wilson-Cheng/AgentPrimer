import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/static-components": "off",
      "react-hooks/purity": "off",
      "react-hooks/immutability": "off",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Runtime data and Agent Manager worktrees are user-editable content.
    "data/**",
    ".kilo/**",
    // Example skills/MCP servers intentionally use CommonJS because function-tool-worker loads them with require().
    "defaults/skills/**",
    "defaults/mcp-servers/**",
  ]),
]);

export default eslintConfig;

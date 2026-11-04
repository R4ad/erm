import js from "@eslint/js";
import jsxA11y from "eslint-plugin-jsx-a11y";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist", "playwright-report", "test-results"] },
  {
    files: ["**/*.{ts,tsx}"],
    extends: [
      js.configs.recommended,
      ...tseslint.configs.strict,
      reactHooks.configs.flat["recommended-latest"],
      jsxA11y.flatConfigs.strict,
      reactRefresh.configs.vite,
    ],
    languageOptions: { ecmaVersion: 2023, globals: globals.browser },
    rules: {
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
      "no-restricted-syntax": [
        "error",
        {
          selector: "JSXAttribute[name.name='dangerouslySetInnerHTML']",
          message: "HTML خام در این رابط نوشته نمی‌شود؛ متن را با JSX نشان دهید.",
        },
      ],
      // ماژول‌هایی که هوک یا کلاس‌ساز را کنار کامپوننت خودشان دارند؛ HMR آن‌ها را با بارگذاری کامل ماژول عوض می‌کند.
      "react-refresh/only-export-components": [
        "warn",
        {
          allowConstantExport: true,
          allowExportNames: ["buttonClasses", "pageWindow", "useToast", "useTheme", "useSession", "useLogout"],
        },
      ],
    },
  },
  {
    files: ["src/lib/**", "src/features/session/**", "src/components/layout/nav.tsx"],
    rules: { "react-refresh/only-export-components": "off" },
  },
  {
    files: ["e2e/**", "*.config.ts", "src/test/**", "src/**/*.test.{ts,tsx}"],
    languageOptions: { globals: { ...globals.node } },
    rules: {
      "react-refresh/only-export-components": "off",
      // در آزمون، نبودن عنصر خودش شکست آزمون است؛ ! همان را کوتاه می‌گوید.
      "@typescript-eslint/no-non-null-assertion": "off",
    },
  },
  {
    // use در fixtureهای Playwright تابع خود Playwright است، نه هوک React.
    files: ["e2e/**"],
    rules: { "react-hooks/rules-of-hooks": "off" },
  },
);

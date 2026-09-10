import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";

/**
 * إعداد ESLint 9 (الصيغة المسطحة).
 *
 * [X2] كان `npm run lint` يفشل لأنه لا يوجد ملف إعداد إطلاقاً — فبقي الكود
 * بلا أي فحص ثابت. هذا الإعداد يغطي الخادم والواجهة معاً.
 *
 * القواعد مختارة عمداً لتلتقط الفئات التي ظهرت في المراجعة:
 *  - no-unused-vars: كود ميت (paginate/removeStored/BADGE/uploadFiles…)
 *  - no-use-before-define: أخطاء الترتيب التي لا يكشفها الفحص النحوي
 *  - eqeqeq: مقارنات متراخية مع القيم القادمة من SQLite (أرقام/نصوص)
 *  - no-eval / no-implied-eval / no-new-func
 *  - react-hooks/rules-of-hooks: اشتراكات RT داخل شروط
 */
export default [
  {
    ignores: [
      "dist/**",
      "data/**",
      "node_modules/**",
      "coverage/**",
      /* ملفات التصميم/الوثائق — ليست كوداً ولا تُفحص */
      "part*",
      "Part*",
      "index 2",
    ],
  },

  /* ---------------- الخادم ---------------- */
  {
    files: ["server/**/*.js", "scripts/**/*.js", "eslint.config.js", "vite.config.js"],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: "module",
      globals: { ...globals.node },
    },
    rules: {
      ...js.configs.recommended.rules,
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "no-console": "off", // الخادم يستخدم logger الخاص به
      eqeqeq: ["error", "smart"],
      "no-var": "error",
      "prefer-const": ["warn", { destructuring: "all" }],
      "no-eval": "error",
      "no-implied-eval": "error",
      "no-new-func": "error",
      "no-shadow": "warn",
      "no-use-before-define": ["error", { functions: false, classes: true, variables: true }],
      "require-atomic-updates": "off",
    },
  },

  /* ---------------- الواجهة ---------------- */
  {
    files: ["client/src/**/*.{js,jsx}"],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: "module",
      globals: { ...globals.browser },
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: {
      "react-hooks": reactHooks,
    },
    rules: {
      ...js.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      eqeqeq: ["error", "smart"],
      "no-var": "error",
      "prefer-const": ["warn", { destructuring: "all" }],
      "no-eval": "error",
      "no-implied-eval": "error",
      "no-new-func": "error",
      "no-alert": "error", // [M19] استُبدلت بنوافذ الحوار الموحدة
    },
  },
];

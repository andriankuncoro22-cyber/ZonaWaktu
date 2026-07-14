import nextConfigVitals from "eslint-config-next/core-web-vitals";
import nextConfigTypescript from "eslint-config-next/typescript";

const eslintConfig = [
  ...nextConfigVitals,
  ...nextConfigTypescript,
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "warn",
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/purity": "warn",
      "@typescript-eslint/no-unused-vars": "warn",
      "react-hooks/exhaustive-deps": "warn",
      "@next/next/no-img-element": "warn",
    },
  },
];

export default eslintConfig;
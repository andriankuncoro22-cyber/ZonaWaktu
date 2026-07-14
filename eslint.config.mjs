import nextConfigVitals from "eslint-config-next/core-web-vitals";
import nextConfigTypescript from "eslint-config-next/typescript";

const eslintConfig = [
  ...nextConfigVitals,
  ...nextConfigTypescript,
];

export default eslintConfig;
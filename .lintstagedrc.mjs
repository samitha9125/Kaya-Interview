const config = {
  "*.{ts,tsx,js,mjs}": ["eslint --fix --max-warnings=0", "prettier --write"],
  "*.{json,css,yml,yaml}": "prettier --write",
};

export default config;

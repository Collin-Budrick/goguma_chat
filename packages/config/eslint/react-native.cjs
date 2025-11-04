const baseConfig = require("./base.cjs");

module.exports = {
  ...baseConfig,
  plugins: [...baseConfig.plugins, "react-native"],
  extends: [...baseConfig.extends, "plugin:react-native/all"],
  env: {
    "react-native/react-native": true,
  },
};

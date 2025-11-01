const { getDefaultConfig } = require("@expo/metro-config");
const path = require("node:path");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "..", "..");

const config = getDefaultConfig(projectRoot);

config.watchFolders = [workspaceRoot];

config.resolver.disableHierarchicalLookup = true;
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
];
config.resolver.alias = {
  ...(config.resolver.alias ?? {}),
  "@goguma/ui": path.resolve(workspaceRoot, "packages/ui"),
};

module.exports = config;

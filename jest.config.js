module.exports = {
  preset: 'jest-expo',
  testEnvironment: 'node',
  testMatch: ['<rootDir>/src/**/__tests__/*.test.ts'],
  // Agent worktrees under .claude/ contain a full checkout, including a
  // package.json with this same name — jest-haste-map treats that as a module
  // naming collision and warns on every run. Keep them out of the haste map.
  modulePathIgnorePatterns: ['<rootDir>/.claude/'],
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@unimodules/.*|unimodules)',
  ],
};

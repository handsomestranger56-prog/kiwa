const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  { ignores: ['dist/*', '.expo/*'] },
  {
    // Core logic stays free of UI and device imports so it runs anywhere and tests fast.
    files: ['src/core/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['react', 'react-native', 'react-native-*', 'expo', 'expo-*', '@/data/*', '@/ui/*', '@/features/*', '@/app/*'],
              message: 'src/core must not depend on React, React Native, Expo or app layers.',
            },
          ],
        },
      ],
    },
  },
]);

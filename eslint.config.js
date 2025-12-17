import js from '@eslint/js';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';
import prettierConfig from 'eslint-config-prettier';

/** @type {import('eslint').Linter.FlatConfig[]} */
export default [
	js.configs.recommended,
	{
		files: ['**/*.{js,mjs,cjs,ts}'],
		languageOptions: {
			parser: tsParser,
			parserOptions: {
				ecmaVersion: 2020,
				sourceType: 'module'
			},
			globals: {
				console: 'readonly',
				FormData: 'readonly',
				File: 'readonly'
			}
		},
		plugins: {
			'@typescript-eslint': tsPlugin
		},
		rules: {
			...tsPlugin.configs.recommended.rules
		}
	},
	{
		ignores: ['**/*.svelte', '.svelte-kit/**', 'node_modules/**', 'scripts/**', 'build/**', 'dist/**']
	},
	prettierConfig
];


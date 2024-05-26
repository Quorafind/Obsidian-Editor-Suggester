import path from 'path';
import {defineConfig} from 'vite';
import terser from '@rollup/plugin-terser';
import replace from '@rollup/plugin-replace';
import resolve from '@rollup/plugin-node-resolve';
import builtins from 'builtin-modules'

const prod = (process.argv[4] === 'production');

export default defineConfig(({mode}) => {
	return {
		plugins: [],
		build: {
			sourcemap: mode === 'development' ? 'inline' : false,
			minify: mode !== 'development',
			// Use Vite lib mode https://vitejs.dev/guide/build.html#library-mode
			lib: {
				entry: path.resolve(__dirname, './src/customSuggesterIndex.ts'),
				formats: ['cjs'],
			},
			rollupOptions: {
				plugins: [
					mode === 'development'
						? ''
						: terser({
							compress: {
								defaults: false,
								drop_console: ['log', 'info'],
							},
							mangle: {
								eval: true,
								module: true,
								toplevel: true,
								safari10: true,
								properties: false,
							},
							output: {
								comments: false,
								ecma: '2020',
							},
						}),
					resolve({
						browser: false,
					}),
					replace({
						preventAssignment: true,
						'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV),
					}),
				],
				output: {
					// Overwrite default Vite output fileName
					entryFileNames: mode === 'production' ? 'dist/main.js' : 'main.js',
					assetFileNames: mode === 'production' ? 'dist/styles.css' : 'styles.css',
				},
				external: [
					'obsidian',
					'electron',
					'@codemirror/collab',
					'@codemirror/commands',
					'@codemirror/lint',
					'@codemirror/search',
					'@codemirror/state',
					'@codemirror/view', ...builtins
				],
			},
			// Use root as the output dir
			emptyOutDir: false,
			outDir: '.',
		},
	};
});

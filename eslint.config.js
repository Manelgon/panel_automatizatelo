import js from '@eslint/js';
import globals from 'globals';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

// =============================================================================
// ESLint — pensado para cazar lo que el build NO ve
// =============================================================================
// Vite compila JSX sin comprobar que los componentes existan: `<CustomSelect>`
// sin importar pasa el build y revienta en el navegador. Eso ya pasó una vez y
// llegó a producción. La regla que lo caza es `no-undef`, y es la razón de que
// este fichero exista.
//
// El criterio: error solo para lo que rompe en tiempo de ejecución; aviso para
// lo que ensucia. Nada de reglas de estilo — el código ya tiene su forma y una
// pasada de formateo enterraría los cambios de verdad bajo miles de líneas.
// =============================================================================

export default [
    {
        ignores: ['dist/**', 'node_modules/**', 'public/**', 'supabase/functions/**'],
    },
    js.configs.recommended,
    // Ficheros TypeScript: parser propio y sus recomendadas. `no-undef` se apaga
    // en TS — el compilador ya lo comprueba mejor, y la regla da falsos
    // positivos con tipos.
    ...tseslint.configs.recommended.map((c) => ({ ...c, files: ['**/*.{ts,tsx}'] })),
    {
        files: ['**/*.{ts,tsx}'],
        rules: {
            'no-undef': 'off',
            '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
        },
    },
    {
        files: ['**/*.{js,jsx,ts,tsx}'],
        languageOptions: {
            ecmaVersion: 'latest',
            sourceType: 'module',
            globals: {
                ...globals.browser,
                ...globals.es2021,
            },
            parserOptions: {
                ecmaFeatures: { jsx: true },
            },
        },
        settings: {
            react: { version: 'detect' },
        },
        plugins: {
            react,
            'react-hooks': reactHooks,
        },
        rules: {
            // ── Lo que rompe en el navegador ─────────────────────────────────
            // OJO: `no-undef` NO caza componentes JSX sin importar. JSX produce
            // nodos JSXIdentifier, que esa regla no cuenta como referencias.
            // Comprobado: un fichero con <CustomSelect> sin importar pasaba
            // `no-undef` sin decir nada. La que lo caza es react/jsx-no-undef.
            'no-undef': 'error',
            'react/jsx-no-undef': 'error',
            // Marca como "usado" lo que aparece en JSX, para que no-unused-vars
            // no se queje de cada import de componente.
            'react/jsx-uses-vars': 'error',
            'react/jsx-uses-react': 'off',   // React 19: no hace falta importarlo
            'react/react-in-jsx-scope': 'off',
            'react/jsx-key': 'error',        // listas sin key = renders raros
            'react-hooks/rules-of-hooks': 'error',

            // ── Lo que ensucia ───────────────────────────────────────────────
            'no-unused-vars': ['warn', {
                argsIgnorePattern: '^_',
                varsIgnorePattern: '^_',
                caughtErrors: 'none',        // `catch {}` vacío es intencional en varios sitios
            }],
            'no-empty': ['warn', { allowEmptyCatch: true }],
            'react-hooks/exhaustive-deps': 'warn',
        },
    },
];

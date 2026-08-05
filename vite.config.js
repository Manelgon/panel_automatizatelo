import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vitejs.dev/config/
export default defineConfig({
    plugins: [
        react(),
        tailwindcss(),
    ],
    build: {
        rollupOptions: {
            output: {
                // Sin esto, el lazy() de App.jsx parte demasiado: cada icono de
                // lucide salía como un chunk de 0,1 kB — decenas de peticiones
                // diminutas. Se agrupa lo que viaja junto.
                manualChunks(id) {
                    if (!id.includes('node_modules')) return undefined;
                    if (id.includes('lucide-react')) return 'iconos';
                    if (id.includes('@fullcalendar')) return 'calendario';
                    if (id.includes('jspdf') || id.includes('html2canvas') || id.includes('canvg') || id.includes('dompurify') || id.includes('fflate')) return 'pdf';
                    if (id.includes('framer-motion')) return 'animacion';
                    if (id.includes('@supabase')) return 'supabase';
                    return 'vendor';
                },
            },
        },
    },
    server: {
        proxy: {
            // Proxy all Supabase API requests through Vite dev server to avoid CORS
            '/rest': {
                target: 'https://weatbfnbmgimssvhhqzt.supabase.co',
                changeOrigin: true,
                secure: true,
            },
            '/auth': {
                target: 'https://weatbfnbmgimssvhhqzt.supabase.co',
                changeOrigin: true,
                secure: true,
            },
            '/realtime': {
                target: 'https://weatbfnbmgimssvhhqzt.supabase.co',
                changeOrigin: true,
                secure: true,
                ws: true, // WebSocket support for realtime
            },
            '/storage': {
                target: 'https://weatbfnbmgimssvhhqzt.supabase.co',
                changeOrigin: true,
                secure: true,
            },
            // Faltaba: sin esta regla, las Edge Functions (correo, Veri*factu)
            // no responden en desarrollo. Es el mismo agujero que tenía
            // vercel.json en producción.
            '/functions': {
                target: 'https://weatbfnbmgimssvhhqzt.supabase.co',
                changeOrigin: true,
                secure: true,
            },
        },
    },
})

import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Sun, Moon } from 'lucide-react';
import logo from '../assets/logo.png';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';

// =============================================================================
// BARRA DE NAVEGACIÓN SUPERIOR
// =============================================================================
// Antes era un raíl lateral de solo-iconos llamado Sidebar. A petición de
// Manel: arriba, con texto y desplegables — y renombrado a lo que es.
//
// La agrupación es la de la auditoría (§7.2): Facturación y Agenda dejan de ser
// iconos sueltos y Configuración recoge lo administrativo.
// =============================================================================

const NAV = [
    { label: 'Inicio', to: '/' },
    { label: 'Leads', to: '/leads' },
    { label: 'Clientes', to: '/clientes' },
    { label: 'Proyectos', to: '/projects' },
    { label: 'Formaciones', to: '/formaciones' },
    {
        label: 'Facturación',
        items: [
            { label: 'Facturas', to: '/facturas' },
            { label: 'Veri*factu', to: '/verifactu' },
        ],
    },
    {
        label: 'Agenda',
        items: [
            { label: 'Tareas', to: '/tasks' },
            { label: 'Calendario', to: '/calendar' },
        ],
    },
    { label: 'Blog', to: '/blog' },
    {
        label: 'Configuración',
        items: [
            { label: 'Gestión de equipo', to: '/users' },
            { label: 'Catálogo de servicios', to: '/services' },
            { label: 'Ajustes del emisor', to: '/ajustes-emisor' },
            { label: 'Correo del panel', to: '/ajustes-email' },
            { label: 'Registro de actividad', to: '/registro-actividad' },
        ],
    },
];

const rutaActiva = (pathname, to) =>
    to === '/' ? pathname === '/' : pathname.startsWith(to);

const grupoActivo = (pathname, items) =>
    items.some((i) => rutaActiva(pathname, i.to));

export default function BarraNavegacion() {
    const { signOut } = useAuth();
    const { darkMode, toggleTheme } = useTheme();
    const navigate = useNavigate();
    const { pathname } = useLocation();

    const [abierto, setAbierto] = useState(null);   // label del desplegable abierto
    const [movilAbierto, setMovilAbierto] = useState(false);
    const ref = useRef(null);

    // Cerrar al pinchar fuera y al navegar
    useEffect(() => {
        const fuera = (e) => {
            if (ref.current && !ref.current.contains(e.target)) {
                setAbierto(null);
                setMovilAbierto(false);
            }
        };
        document.addEventListener('mousedown', fuera);
        return () => document.removeEventListener('mousedown', fuera);
    }, []);

    useEffect(() => { setAbierto(null); setMovilAbierto(false); }, [pathname]);

    // Título de la pestaña por sección: antes todas decían lo mismo (el <title>
    // fijo del index.html) y no se distinguía una pestaña de otra.
    useEffect(() => {
        const planas = NAV.flatMap((s) => (s.items ? s.items : [s]));
        // La coincidencia más larga gana: /formaciones/:id cae en Formaciones
        const seccion = planas
            .filter((i) => rutaActiva(pathname, i.to))
            .sort((a, b) => b.to.length - a.to.length)[0];
        document.title = seccion ? seccion.label + ' · Automátízatelo' : 'Automátízatelo · Panel';
    }, [pathname]);

    const salir = async () => {
        try {
            await signOut();
            navigate('/login');
        } catch (error) {
            console.error('Error signing out:', error);
        }
    };

    const claseItem = (activo) =>
        `px-3 py-2 rounded-xl text-sm font-bold transition-all whitespace-nowrap ${
            activo ? 'text-primary bg-primary/10' : 'text-variable-muted hover:text-primary hover:bg-white/5'
        }`;

    return (
        <header ref={ref} className="sticky top-0 z-[100] glass border-b border-variable">
            {/* min-h en vez de h fija: si la fila envuelve, la barra crece */}
            <div className="flex items-center gap-2 px-4 sm:px-8 min-h-16 py-2">
                {/* Marca */}
                <Link to="/" className="flex items-center gap-3 mr-4 shrink-0">
                    <img src={logo} alt="Automatízatelo" className="size-9 object-contain" />
                    <span className="hidden lg:block text-sm font-black tracking-tight text-variable-main">
                        Automatízatelo
                    </span>
                </Link>

                {/* Navegación de escritorio.
                    OJO: nada de overflow aquí — un contenedor con overflow-x
                    recorta a los hijos absolutos y los desplegables se abren
                    pero quedan invisibles. Si no cabe, se envuelve en dos filas. */}
                <nav className="hidden md:flex items-center gap-1 flex-1 flex-wrap">
                    {NAV.map((seccion) => (
                        seccion.items ? (
                            <div key={seccion.label} className="relative">
                                <button
                                    onClick={() => setAbierto(abierto === seccion.label ? null : seccion.label)}
                                    className={claseItem(grupoActivo(pathname, seccion.items) || abierto === seccion.label)}
                                >
                                    {seccion.label} <span className="text-[10px] opacity-70">▾</span>
                                </button>

                                {abierto === seccion.label && (
                                    <div className="absolute left-0 top-full mt-2 z-50 min-w-[220px] glass border border-variable rounded-2xl shadow-2xl p-2 space-y-1">
                                        {seccion.items.map((item) => (
                                            <Link
                                                key={item.to}
                                                to={item.to}
                                                className={`block px-4 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                                                    rutaActiva(pathname, item.to)
                                                        ? 'bg-primary text-white'
                                                        : 'text-variable-muted hover:text-primary hover:bg-white/5'
                                                }`}
                                            >
                                                {item.label}
                                            </Link>
                                        ))}
                                    </div>
                                )}
                            </div>
                        ) : (
                            <Link key={seccion.to} to={seccion.to} className={claseItem(rutaActiva(pathname, seccion.to))}>
                                {seccion.label}
                            </Link>
                        )
                    ))}
                </nav>

                <div className="flex-1 md:hidden" />

                {/* Tema claro/oscuro: vive aquí para no repetirlo en cada página */}
                <button
                    onClick={toggleTheme}
                    className="p-2.5 rounded-xl text-variable-muted hover:text-primary hover:bg-white/5 transition-all shrink-0"
                    title={darkMode ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
                >
                    {darkMode ? <Sun size={17} /> : <Moon size={17} />}
                </button>

                {/* Salir (escritorio) */}
                <button
                    onClick={salir}
                    className="hidden md:block px-3 py-2 rounded-xl text-sm font-bold text-variable-muted hover:text-rose-500 hover:bg-rose-500/10 transition-all shrink-0"
                >
                    Salir
                </button>

                {/* Menú móvil */}
                <button
                    onClick={() => setMovilAbierto(!movilAbierto)}
                    className="md:hidden px-3 py-2 rounded-xl text-sm font-bold text-variable-main glass border border-variable"
                >
                    Menú <span className="text-[10px] opacity-70">{movilAbierto ? '▴' : '▾'}</span>
                </button>
            </div>

            {/* Panel móvil: todo el mapa, con cabeceras de grupo */}
            {movilAbierto && (
                <div className="md:hidden border-t border-variable px-4 py-4 space-y-1 max-h-[70vh] overflow-y-auto">
                    {NAV.map((seccion) => (
                        seccion.items ? (
                            <div key={seccion.label} className="pt-2">
                                <p className="px-3 pb-1 text-[10px] uppercase font-black tracking-widest text-variable-muted">
                                    {seccion.label}
                                </p>
                                {seccion.items.map((item) => (
                                    <Link
                                        key={item.to}
                                        to={item.to}
                                        className={`block px-5 py-2.5 rounded-xl text-sm font-semibold ${
                                            rutaActiva(pathname, item.to) ? 'bg-primary text-white' : 'text-variable-muted'
                                        }`}
                                    >
                                        {item.label}
                                    </Link>
                                ))}
                            </div>
                        ) : (
                            <Link
                                key={seccion.to}
                                to={seccion.to}
                                className={`block px-3 py-2.5 rounded-xl text-sm font-bold ${
                                    rutaActiva(pathname, seccion.to) ? 'bg-primary text-white' : 'text-variable-main'
                                }`}
                            >
                                {seccion.label}
                            </Link>
                        )
                    ))}
                    <button
                        onClick={salir}
                        className="w-full text-left px-3 py-2.5 rounded-xl text-sm font-bold text-rose-500 hover:bg-rose-500/10"
                    >
                        Salir
                    </button>
                </div>
            )}
        </header>
    );
}

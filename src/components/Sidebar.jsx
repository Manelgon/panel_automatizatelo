import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
    LayoutDashboard,
    Users,
    FolderOpen,
    FileText,
    Settings,
    LogOut,
    Target,
    Briefcase,
    ListTodo,
    Calendar as CalendarIcon,
    ChevronRight
} from 'lucide-react';
import logo from '../assets/logo.png';
import { useAuth } from '../context/AuthContext';

const SidebarItem = ({ icon: Icon, to = "#", label, activeOverride }) => {
    const location = useLocation();
    let active = false;
    if (activeOverride !== undefined) {
        active = activeOverride;
    } else if (to !== "#") {
        active = location.pathname === to || (to !== '/' && location.pathname.startsWith(to));
    }

    return (
        <Link
            to={to}
            title={label}
            className={`p-3 md:p-4 rounded-2xl transition-all duration-300 flex items-center justify-center flex-shrink-0 ${active ? 'bg-primary text-white shadow-lg shadow-primary/30' : 'text-variable-muted hover:text-primary hover:bg-white/5'}`}
        >
            <Icon size={24} />
        </Link>
    );
};

// Settings submenu item (smaller, for inside the popover)
const SubMenuItem = ({ icon: Icon, to, label, onClick }) => {
    const location = useLocation();
    const active = location.pathname === to || (to !== '/' && location.pathname.startsWith(to));

    return (
        <Link
            to={to}
            onClick={onClick}
            className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 w-full ${active ? 'bg-primary text-white' : 'text-variable-muted hover:text-primary hover:bg-white/5'}`}
        >
            <Icon size={18} />
            <span className="text-sm font-semibold whitespace-nowrap">{label}</span>
            {active && <ChevronRight size={14} className="ml-auto opacity-60" />}
        </Link>
    );
};

export default function Sidebar() {
    const { signOut } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();
    const [configOpen, setConfigOpen] = useState(false);

    const isConfigActive = location.pathname.startsWith('/users') || location.pathname.startsWith('/services');

    const handleSignOut = async () => {
        try {
            await signOut();
            navigate('/login');
        } catch (error) {
            console.error('Error signing out:', error);
        }
    };

    return (
        <>
            {/* Desktop Sidebar */}
            <aside className="hidden md:flex w-28 flex-col items-center py-8 glass border-r border-variable h-screen sticky top-0 shrink-0 z-50">
                <div className="mb-12">
                    <div className="size-14 rounded-2xl bg-white/5 flex items-center justify-center p-2 shadow-xl border border-variable">
                        <img src={logo} alt="Automatizatelo" className="w-full h-full object-contain" />
                    </div>
                </div>

                <div className="flex flex-col gap-6 flex-1 w-full px-4 items-center">
                    <SidebarItem icon={LayoutDashboard} to="/" label="Dashboard" />
                    <SidebarItem icon={Target} to="/leads" label="Leads" />
                    <SidebarItem icon={FolderOpen} to="/projects" label="Proyectos" />
                    <SidebarItem icon={ListTodo} to="/tasks" label="Tareas" />
                    <SidebarItem icon={CalendarIcon} to="/calendar" label="Calendario / Hitos" />
                    <SidebarItem icon={FileText} label="Documentos" />
                </div>

                <div className="mt-auto flex flex-col gap-6 items-center w-full px-4 relative">
                    {/* Configuración con submenu */}
                    <div className="relative w-full flex justify-center">
                        <button
                            onClick={() => setConfigOpen(prev => !prev)}
                            title="Configuración"
                            className={`p-3 md:p-4 rounded-2xl transition-all duration-300 flex items-center justify-center flex-shrink-0 ${isConfigActive || configOpen ? 'bg-primary text-white shadow-lg shadow-primary/30' : 'text-variable-muted hover:text-primary hover:bg-white/5'}`}
                        >
                            <Settings size={24} />
                        </button>

                        {/* Popover submenu */}
                        {configOpen && (
                            <>
                                {/* Backdrop */}
                                <div
                                    className="fixed inset-0 z-40"
                                    onClick={() => setConfigOpen(false)}
                                />
                                <div className="absolute bottom-0 left-full ml-3 glass border border-variable rounded-2xl shadow-2xl z-50 overflow-hidden min-w-[200px]">
                                    <div className="px-4 py-3 border-b border-variable">
                                        <p className="text-[10px] uppercase font-black tracking-widest text-variable-muted">Configuración</p>
                                    </div>
                                    <div className="p-2 flex flex-col gap-1">
                                        <SubMenuItem
                                            icon={Users}
                                            to="/users"
                                            label="Gestión de Equipo"
                                            onClick={() => setConfigOpen(false)}
                                        />
                                        <SubMenuItem
                                            icon={Briefcase}
                                            to="/services"
                                            label="Catálogo de Servicios"
                                            onClick={() => setConfigOpen(false)}
                                        />
                                    </div>
                                </div>
                            </>
                        )}
                    </div>

                    <button
                        onClick={handleSignOut}
                        className="p-4 rounded-2xl text-variable-muted hover:text-rose-500 hover:bg-rose-500/10 transition-all duration-300 flex items-center justify-center"
                        title="Cerrar Sesión"
                    >
                        <LogOut size={24} />
                    </button>

                    <div className="size-12 rounded-2xl border-2 border-primary/20 p-0.5 mt-2">
                        <img className="rounded-xl w-full h-full object-cover" src="https://ui-avatars.com/api/?name=Admin&background=f3791b&color=fff" alt="User" />
                    </div>
                </div>
            </aside>

            {/* Mobile Bottom Navigation */}
            <nav className="md:hidden fixed bottom-0 left-0 right-0 glass border-t border-variable z-[100] safe-area-bottom">
                <div className="flex items-center gap-1 px-3 py-2 overflow-x-auto no-scrollbar">
                    <SidebarItem icon={LayoutDashboard} to="/" label="Dashboard" />
                    <SidebarItem icon={Target} to="/leads" label="Leads" />
                    <SidebarItem icon={FolderOpen} to="/projects" label="Proyectos" />
                    <SidebarItem icon={ListTodo} to="/tasks" label="Tareas" />
                    <SidebarItem icon={CalendarIcon} to="/calendar" label="Calendario" />
                    <SidebarItem icon={FileText} label="Documentos" />

                    {/* Botón configuración — el popover está FUERA del overflow */}
                    <button
                        onClick={() => setConfigOpen(prev => !prev)}
                        title="Configuración"
                        className={`p-3 rounded-2xl transition-all duration-300 flex items-center justify-center flex-shrink-0 ${isConfigActive || configOpen ? 'bg-primary text-white shadow-lg shadow-primary/30' : 'text-variable-muted hover:text-primary hover:bg-white/5'}`}
                    >
                        <Settings size={22} />
                    </button>

                    <button
                        onClick={handleSignOut}
                        className="p-3 rounded-xl text-variable-muted hover:text-rose-500 hover:bg-rose-500/10 transition-all flex-shrink-0 flex items-center justify-center"
                        title="Cerrar Sesión"
                    >
                        <LogOut size={22} />
                    </button>
                </div>
            </nav>

            {/* Mobile Config Popover — fuera del nav para evitar overflow-clip */}
            {configOpen && (
                <>
                    <div className="fixed inset-0 z-[110]" onClick={() => setConfigOpen(false)} />
                    <div className="fixed bottom-20 right-4 glass border border-variable rounded-2xl shadow-2xl z-[120] overflow-hidden min-w-[210px] md:hidden">
                        <div className="px-4 py-3 border-b border-variable">
                            <p className="text-[10px] uppercase font-black tracking-widest text-variable-muted">Configuración</p>
                        </div>
                        <div className="p-2 flex flex-col gap-1">
                            <SubMenuItem icon={Users} to="/users" label="Gestión de Equipo" onClick={() => setConfigOpen(false)} />
                            <SubMenuItem icon={Briefcase} to="/services" label="Catálogo de Servicios" onClick={() => setConfigOpen(false)} />
                        </div>
                    </div>
                </>
            )}
        </>
    );
}


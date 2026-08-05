import { lazy, Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider } from './context/ThemeContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import { NotificationProvider } from './context/NotificationContext';
import { LoadingProvider } from './context/LoadingContext';

// Cada página se descarga cuando se visita, no todas al entrar. Antes el panel
// era un único chunk de 1,6 MB: para ver el login había que bajarse también el
// editor del blog, FullCalendar y el generador de PDF.
//
// Login queda estático a propósito — es la primera pantalla y no debe esperar
// a una segunda petición.
import Login from './features/auth/pages/Login';
const Dashboard = lazy(() => import('./features/dashboard/pages/Dashboard'));
const ProjectDetail = lazy(() => import('./features/proyectos/pages/ProjectDetail'));
const Users = lazy(() => import('./features/equipo/pages/Users'));
const Leads = lazy(() => import('./features/leads/pages/Leads'));
const Clientes = lazy(() => import('./features/clientes/pages/Clientes'));
const ClienteDetail = lazy(() => import('./features/clientes/pages/ClienteDetail'));
const Blog = lazy(() => import('./features/contenidos/pages/Blog'));
const Services = lazy(() => import('./features/ajustes/pages/Services'));
const Projects = lazy(() => import('./features/proyectos/pages/Projects'));
const Formaciones = lazy(() => import('./features/formaciones/pages/Formaciones'));
const FormacionDetalle = lazy(() => import('./features/formaciones/pages/FormacionDetalle'));
const Tasks = lazy(() => import('./features/agenda/pages/Tasks'));
const Facturas = lazy(() => import('./features/facturacion/pages/Facturas'));
const AjustesEmisor = lazy(() => import('./features/facturacion/pages/AjustesEmisor'));
const AjustesEmail = lazy(() => import('./features/ajustes/pages/AjustesEmail'));
const Verifactu = lazy(() => import('./features/facturacion/pages/Verifactu'));
const Calendar = lazy(() => import('./features/agenda/pages/Calendar'));

// El mismo spinner que ya usa el resto del panel mientras carga una página
const CargandoPagina = () => (
    <div className="min-h-screen flex items-center justify-center bg-[#0F0716]">
        <div className="size-12 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
    </div>
);

const ProtectedRoute = ({ children, requireAdmin = true }) => {
    const { user, profile, loading, profileLoading } = useAuth();

    // Session is still loading
    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-[#0F0716]">
                <div className="size-12 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
            </div>
        );
    }

    // No user session → go to login
    if (!user) {
        return <Navigate to="/login" />;
    }

    // Profile is still loading → show spinner (not "Acceso Denegado").
    // Solo la PRIMERA vez: si ya tenemos perfil, un refresco en segundo plano no
    // debe sustituir la página por el spinner. Hacerlo desmontaba lo que hubiera
    // abierto — un modal a medio rellenar se perdía entero al volver a la pestaña.
    if (profileLoading && !profile) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-[#0F0716]">
                <div className="size-12 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
            </div>
        );
    }

    // Admin routes require profile with admin role
    if (requireAdmin) {
        if (!profile || profile.role !== 'admin') {
            return (
                <div className="min-h-screen flex items-center justify-center bg-[#0F0716] text-white p-10 text-center font-display">
                    <div>
                        <h1 className="text-4xl font-bold mb-4 text-primary">Acceso Denegado</h1>
                        <p className="text-xl text-gray-400">No tienes permisos de administrador para ver esta sección.</p>
                    </div>
                </div>
            );
        }
    }

    return children;
};

function App() {
    return (
        <AuthProvider>
            <NotificationProvider>
                <LoadingProvider>
                    <ThemeProvider>
                        <Router>
                            <Suspense fallback={<CargandoPagina />}>
                            <Routes>
                                <Route path="/login" element={<Login />} />

                                <Route path="/" element={
                                    <ProtectedRoute>
                                        <Dashboard />
                                    </ProtectedRoute>
                                } />

                                <Route path="/users" element={
                                    <ProtectedRoute>
                                        <Users />
                                    </ProtectedRoute>
                                } />

                                <Route path="/leads" element={
                                    <ProtectedRoute>
                                        <Leads />
                                    </ProtectedRoute>
                                } />

                                <Route path="/clientes" element={
                                    <ProtectedRoute>
                                        <Clientes />
                                    </ProtectedRoute>
                                } />

                                <Route path="/clientes/:id" element={
                                    <ProtectedRoute>
                                        <ClienteDetail />
                                    </ProtectedRoute>
                                } />

                                <Route path="/services" element={
                                    <ProtectedRoute>
                                        <Services />
                                    </ProtectedRoute>
                                } />

                                <Route path="/projects/:id" element={
                                    <ProtectedRoute>
                                        <ProjectDetail />
                                    </ProtectedRoute>
                                } />

                                <Route path="/projects" element={
                                    <ProtectedRoute>
                                        <Projects />
                                    </ProtectedRoute>
                                } />

                                <Route path="/formaciones/:id" element={
                                    <ProtectedRoute>
                                        <FormacionDetalle />
                                    </ProtectedRoute>
                                } />

                                <Route path="/formaciones" element={
                                    <ProtectedRoute>
                                        <Formaciones />
                                    </ProtectedRoute>
                                } />

                                <Route path="/tasks" element={
                                    <ProtectedRoute requireAdmin={false}>
                                        <Tasks />
                                    </ProtectedRoute>
                                } />

                                <Route path="/calendar" element={
                                    <ProtectedRoute requireAdmin={false}>
                                        <Calendar />
                                    </ProtectedRoute>
                                } />


                                <Route path="/facturas" element={
                                    <ProtectedRoute>
                                        <Facturas />
                                    </ProtectedRoute>
                                } />

                                <Route path="/ajustes-emisor" element={
                                    <ProtectedRoute>
                                        <AjustesEmisor />
                                    </ProtectedRoute>
                                } />

                                <Route path="/ajustes-email" element={
                                    <ProtectedRoute>
                                        <AjustesEmail />
                                    </ProtectedRoute>
                                } />

                                <Route path="/verifactu" element={
                                    <ProtectedRoute>
                                        <Verifactu />
                                    </ProtectedRoute>
                                } />

                                <Route path="/blog" element={
                                    <ProtectedRoute>
                                        <Blog />
                                    </ProtectedRoute>
                                } />

                                {/* Redirect a login por defecto si no encuentra ruta */}
                                <Route path="*" element={<Navigate to="/" />} />
                            </Routes>
                            </Suspense>
                        </Router>
                    </ThemeProvider>
                </LoadingProvider>
            </NotificationProvider>
        </AuthProvider>
    );
}

export default App;

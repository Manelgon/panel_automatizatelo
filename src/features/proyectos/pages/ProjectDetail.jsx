import { useState, useEffect } from 'react';
import {
    ArrowLeft,
    Calendar,
    CheckCircle2,
    Download,
    FileText,
    Share2,
    Edit3,
    BarChart3,
    Users as UsersIcon,
    Sun,
    Moon,
    Plus,
    X,
    Target,
    Receipt,
    CreditCard,
    Banknote,
    Building2,
    Smartphone,
    Wallet,
    Zap,
    Package,
    Send
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { useTheme } from '../../../context/ThemeContext';
import { supabase } from '../../../lib/supabase';
import { crearFactura, getCompanySettings, getFacturaCompleta, generarPdfFactura, registrarVerifactu } from '../../../lib/facturas';
import Sidebar from '../../../components/Sidebar';
import { useAuth } from '../../../context/AuthContext';
import { useNotifications } from '../../../context/NotificationContext';
import { useGlobalLoading } from '../../../context/LoadingContext';
import { generarPdfPresupuesto, generarPdfRecibo } from '../../proyectos/services/pdfs';
import SeccionCobros from '../../proyectos/components/SeccionCobros';
import SeccionPresupuesto from '../../proyectos/components/SeccionPresupuesto';
import { enviarDocumento } from '../../../lib/enviarEmail';
import { registrarAccion } from '../../../lib/auditoria';

export default function ProjectDetail() {
    const { id } = useParams();
    const navigate = useNavigate();
    const { darkMode, toggleTheme } = useTheme();
    const { profile: currentProfile } = useAuth();
    const { showNotification, confirm } = useNotifications();
    const { showLoading, hideLoading } = useGlobalLoading();

    const [project, setProject] = useState(null);
    const [milestones, setMilestones] = useState([]);
    const [tasks, setTasks] = useState([]);
    const [files, setFiles] = useState([]);
    const [sprints, setSprints] = useState([]);
    const [loading, setLoading] = useState(true);
    const [viewSprintModal, setViewSprintModal] = useState(false);
    const [selectedSprintId, setSelectedSprintId] = useState(null);

    // Modals state
    const [milestoneModal, setMilestoneModal] = useState(false);
    const [taskModal, setTaskModal] = useState(false);

    // State for creating items
    const [newMilestone, setNewMilestone] = useState({ title: '', target_date: '', status: 'pending' });
    const [newTask, setNewTask] = useState({ title: '', description: '', priority: 'Media', status: 'pending', assigned_to: '', sprint_id: '' });
    const [users, setUsers] = useState([]);
    const [formLoading, setFormLoading] = useState(false);

    // Budget / Services state
    const [projectServices, setProjectServices] = useState([]);
    const [budgetLines, setBudgetLines] = useState([]);
    const [budgetExpanded, setBudgetExpanded] = useState(true);
    const [budgetLineModal, setBudgetLineModal] = useState(false);
    const [newBudgetLine, setNewBudgetLine] = useState({ description: '', unit_price: '', quantity: 1, iva_percent: 21 });
    const [invoices, setInvoices] = useState([]);
    const [budgets, setBudgets] = useState([]);
    const [invoiceLoading, setInvoiceLoading] = useState(false);
    const [catalogServices, setCatalogServices] = useState([]);
    const [isCatalogMode, setIsCatalogMode] = useState(false);

    // Payments state
    const [payments, setPayments] = useState([]);
    const [paymentModal, setPaymentModal] = useState(false);
    const [newPayment, setNewPayment] = useState({ amount: '', payment_method: 'transferencia', notes: '' });
    const [paymentsExpanded, setPaymentsExpanded] = useState(true);
    const [invoicesExpanded, setInvoicesExpanded] = useState(false);
    const [editingLineId, setEditingLineId] = useState(null);
    const [tempLine, setTempLine] = useState(null);

    // Budget confirmation modal
    const [budgetConfirmModal, setBudgetConfirmModal] = useState(false);
    const [existingActiveBudget, setExistingActiveBudget] = useState(null);

    // Tracks which budget is currently being confirmed/denied (prevents double-click)
    const [budgetActionLoading, setBudgetActionLoading] = useState(null);

    // GLOBAL action lock — blocks ALL interactions while any async operation runs
    const [actionLock, setActionLock] = useState(false);
    const [clienteFactura, setClienteFactura] = useState(null);

    // Receptor para los PDF: { nombre, nif, direccion, email }
    const receptorPdf = () => clienteFactura ? {
        nombre: clienteFactura.company_name || [clienteFactura.first_name, clienteFactura.last_name].filter(Boolean).join(' ') || 'Cliente',
        nif: clienteFactura.tax_id || null,
        direccion: [clienteFactura.billing_address, clienteFactura.billing_postal_code, clienteFactura.billing_city, clienteFactura.billing_country].filter(Boolean).join(', ') || null,
        email: clienteFactura.email || null,
    } : null;

    // Helper that wraps any async function with the global lock + global loading overlay.
    // El catch importa: sin él, un fallo dentro (NIF inválido, RPC caída…) se
    // perdía como promesa sin capturar y el botón parecía "no hacer nada".
    const withLock = async (fn, loadingMsg = '') => {
        if (actionLock) return;
        setActionLock(true);
        if (loadingMsg) showLoading(loadingMsg);
        try {
            await fn();
        } catch (error) {
            console.error('Acción fallida:', error);
            showNotification(error.message || 'La acción falló', 'error');
        } finally {
            setActionLock(false);
            hideLoading();
        }
    };

    const fetchProjectData = async () => {
        setLoading(true);

        // Sin el proyecto no hay página: este sí es fatal
        const { data: proj, error: projErr } = await supabase
            .from('proyectos')
            .select('*, leads(*)')
            .eq('id', id)
            .single();

        if (projErr) {
            console.error('Error fetching project:', projErr);
            setLoading(false);
            return;
        }
        setProject(proj);

        // La ficha completa del cliente: presupuestos, facturas y recibos deben
        // identificar a las dos partes (nombre, NIF, domicilio), no solo una
        // etiqueta de texto.
        if (proj.client_id) {
            const { data: cli } = await supabase
                .from('clientes')
                .select('company_name, first_name, last_name, tax_id, email, billing_address, billing_postal_code, billing_city, billing_country')
                .eq('id', proj.client_id)
                .maybeSingle();
            setClienteFactura(cli || null);
        }

        // El resto en paralelo, y cada uno cae solo. Antes iban encadenados en
        // un mismo try: cuando project_sprints no existía en la base de datos,
        // su throw cortaba la función y la tarjeta de Archivos se quedaba en
        // «No hay archivos adjuntos» con los archivos perfectamente guardados.
        const [miles, tks, sprs, fls] = await Promise.all([
            supabase.from('proyecto_hitos').select('*').eq('project_id', id).order('target_date', { ascending: true }),
            supabase.from('tareas').select('*').eq('project_id', id).order('created_at', { ascending: false }),
            supabase.from('sprints').select('*').eq('project_id', id).order('created_at', { ascending: false }),
            supabase.from('proyecto_archivos').select('*').eq('project_id', id).order('created_at', { ascending: false }),
        ]);

        [['hitos', miles], ['tareas', tks], ['sprints', sprs], ['archivos', fls]]
            .filter(([, r]) => r.error)
            .forEach(([que, r]) => console.error(`Error cargando ${que}:`, r.error.message));

        setMilestones(miles.data || []);
        setTasks(tks.data || []);
        setSprints(sprs.data || []);
        setFiles(fls.data || []);
        setLoading(false);
    };

    const fetchUsers = async () => {
        const { data } = await supabase.from('users').select('id, nombre, apellido1').order('nombre');
        setUsers(data || []);
    };

    const fetchBudgetData = async () => {
        // Fetch services linked to this project
        const { data: svcData } = await supabase
            .from('proyecto_servicios')
            .select('*, services:service_id(name, description, price)')
            .eq('project_id', id);
        setProjectServices(svcData || []);

        // Fetch manual budget lines
        const { data: lineData } = await supabase
            .from('presupuesto_lineas')
            .select('*')
            .eq('project_id', id)
            .order('created_at', { ascending: true });
        setBudgetLines(lineData || []);

        // Fetch invoices (modelo fiscal nuevo: facturas + factura_lineas)
        const { data: invData } = await supabase
            .from('facturas')
            .select('*, factura_lineas(*)')
            .eq('project_id', id)
            .order('created_at', { ascending: false });
        setInvoices(invData || []);

        // Fetch budgets
        const { data: budData } = await supabase
            .from('presupuestos')
            .select('*')
            .eq('project_id', id)
            .order('created_at', { ascending: false });
        setBudgets(budData || []);

        // Fetch payments
        const { data: payData } = await supabase
            .from('cobros')
            .select('*, created_by_user:created_by(nombre, apellido1)')
            .eq('project_id', id)
            .order('payment_date', { ascending: false });
        setPayments(payData || []);

        // Fetch all catalog services
        const { data: catalogData } = await supabase
            .from('servicios')
            .select('*')
            .eq('is_active', true)
            .order('name');
        setCatalogServices(catalogData || []);
    };

    useEffect(() => {
        if (id) {
            fetchProjectData();
            fetchUsers();
            fetchBudgetData();

            // Subscriptions
            const channel = supabase.channel(`project-${id}`)
                .on('postgres_changes', { event: '*', schema: 'public', table: 'proyectos', filter: `id=eq.${id}` }, fetchProjectData)
                .on('postgres_changes', { event: '*', schema: 'public', table: 'proyecto_hitos', filter: `project_id=eq.${id}` }, fetchProjectData)
                .on('postgres_changes', { event: '*', schema: 'public', table: 'tareas', filter: `project_id=eq.${id}` }, fetchProjectData)
                .on('postgres_changes', { event: '*', schema: 'public', table: 'proyecto_archivos', filter: `project_id=eq.${id}` }, fetchProjectData)
                .on('postgres_changes', { event: '*', schema: 'public', table: 'proyecto_servicios', filter: `project_id=eq.${id}` }, fetchBudgetData)
                .on('postgres_changes', { event: '*', schema: 'public', table: 'presupuesto_lineas', filter: `project_id=eq.${id}` }, fetchBudgetData)
                .on('postgres_changes', { event: '*', schema: 'public', table: 'facturas', filter: `project_id=eq.${id}` }, fetchBudgetData)
                .on('postgres_changes', { event: '*', schema: 'public', table: 'presupuestos', filter: `project_id=eq.${id}` }, fetchBudgetData)
                .on('postgres_changes', { event: '*', schema: 'public', table: 'cobros', filter: `project_id=eq.${id}` }, fetchBudgetData)
                .subscribe();

            return () => { supabase.removeChannel(channel); };
        }
    }, [id]);

    const handleAddMilestone = async (e) => {
        e.preventDefault();
        await withLock(async () => {
            const { error } = await supabase
                .from('proyecto_hitos')
                .insert([{ ...newMilestone, project_id: id }]);
            if (error) throw error;
            setMilestoneModal(false);
            setNewMilestone({ title: '', target_date: '', status: 'pending' });
            showNotification('Hito añadido correctamente');
            fetchProjectData();
        }, 'Añadiendo hito...');
    };

    const handleAddTask = async (e) => {
        e.preventDefault();
        await withLock(async () => {
            const payload = {
                ...newTask,
                project_id: id,
                sprint_id: newTask.sprint_id || null
            };
            const { error } = await supabase
                .from('tareas')
                .insert([payload]);
            if (error) throw error;
            setTaskModal(false);
            setNewTask({ title: '', description: '', priority: 'Media', status: 'pending', assigned_to: '', sprint_id: '' });
            showNotification('Tarea añadida correctamente');
            fetchProjectData();
        }, 'Añadiendo tarea...');
    };

    const handleAddBudgetLine = async (e) => {
        e.preventDefault();
        if (hasPendingBudget) {
            showNotification('Hay un presupuesto pendiente. Debes confirmarlo o denegarlo antes de modificar las líneas.', 'error');
            return;
        }
        await withLock(async () => {
            const { error } = await supabase
                .from('presupuesto_lineas')
                .insert([{
                    project_id: id,
                    description: newBudgetLine.description,
                    unit_price: parseFloat(newBudgetLine.unit_price) || 0,
                    quantity: parseInt(newBudgetLine.quantity) || 1,
                    iva_percent: parseFloat(newBudgetLine.iva_percent) || 21
                }]);
            if (error) throw error;
            setBudgetLineModal(false);
            setNewBudgetLine({ description: '', unit_price: '', quantity: 1, iva_percent: 21 });
            showNotification('Línea de presupuesto añadida');
            fetchBudgetData();
        }, 'Añadiendo línea de presupuesto...');
    };

    const handleAddCatalogService = async (serviceId) => {
        if (hasPendingBudget) {
            showNotification('Hay un presupuesto pendiente. Debes confirmarlo o denegarlo antes de modificar las líneas.', 'error');
            return;
        }
        await withLock(async () => {
            const service = catalogServices.find(s => s.id === serviceId);
            if (!service) return;
            const { error } = await supabase
                .from('proyecto_servicios')
                .insert([{
                    project_id: id,
                    service_id: serviceId,
                    unit_price: service.price,
                    quantity: 1,
                    iva_percent: 21
                }]);
            if (error) {
                if (error.code === '23505') throw new Error('Este servicio ya está en el presupuesto');
                throw error;
            }
            setBudgetLineModal(false);
            setIsCatalogMode(false);
            showNotification('Servicio añadido del catálogo');
            fetchBudgetData();
        }, 'Añadiendo servicio...');
    };

    const handleDeleteBudgetLine = async (lineId) => {
        if (hasPendingBudget) {
            showNotification('Hay un presupuesto pendiente. Debes confirmarlo o denegarlo antes de modificar las líneas.', 'error');
            return;
        }
        await withLock(async () => {
            const { error } = await supabase.from('presupuesto_lineas').delete().eq('id', lineId);
            if (error) throw error;
            fetchBudgetData();
        }, 'Eliminando línea...');
    };

    const handleRemoveProjectService = async (serviceId) => {
        if (hasPendingBudget) {
            showNotification('Hay un presupuesto pendiente. Debes confirmarlo o denegarlo antes de modificar las líneas.', 'error');
            return;
        }
        await withLock(async () => {
            const { error } = await supabase.from('proyecto_servicios').delete().eq('project_id', id).eq('service_id', serviceId);
            if (error) throw error;
            fetchBudgetData();
        }, 'Eliminando servicio...');
    };

    const handleSaveLine = async (lineId, isService) => {
        if (hasPendingBudget) {
            showNotification('Hay un presupuesto pendiente. No se pueden guardar cambios.', 'error');
            return;
        }
        await withLock(async () => {
            const table = isService ? 'proyecto_servicios' : 'presupuesto_lineas';
            let query = supabase.from(table).update({
                unit_price: parseFloat(tempLine.unit_price) || 0,
                quantity: parseInt(tempLine.quantity) || 1,
                iva_percent: parseFloat(tempLine.iva_percent) || 0
            });
            if (isService) {
                query = query.eq('project_id', id).eq('service_id', lineId);
            } else {
                query = query.eq('id', lineId);
            }
            const { error } = await query;
            if (error) throw error;
            showNotification('Línea actualizada');
            setEditingLineId(null);
            setTempLine(null);
            fetchBudgetData();
        }, 'Guardando cambios...');
    };

    const handleEditLine = (line) => {
        if (hasPendingBudget) {
            showNotification('Hay un presupuesto pendiente. Debes confirmarlo o denegarlo antes de modificar las líneas.', 'error');
            return;
        }
        if (line.invoiced) {
            showNotification('No se puede editar una línea ya facturada', 'error');
            return;
        }
        setEditingLineId(line.id);
        setTempLine({
            unit_price: line.unit_price,
            quantity: line.quantity,
            iva_percent: line.iva_percent
        });
    };

    // Cálculos de presupuesto — separar facturadas vs pendientes
    const serviceLines = projectServices.map(ps => {
        const unitPrice = parseFloat(ps.unit_price !== null ? ps.unit_price : ps.services?.price) || 0;
        const quantity = parseInt(ps.quantity) || 1;
        const ivaPercent = parseFloat(ps.iva_percent) || 21;
        const base = unitPrice * quantity;
        const iva = base * (ivaPercent / 100);
        return {
            description: ps.services?.name || 'Servicio',
            base,
            iva,
            total: base + iva,
            isService: true,
            id: ps.service_id,
            invoiced: !!ps.invoice_id,
            quantity,
            unit_price: unitPrice,
            iva_percent: ivaPercent
        };
    });
    const manualLines = budgetLines.map(bl => {
        const base = (parseFloat(bl.unit_price) || 0) * (parseInt(bl.quantity) || 1);
        const iva = base * ((parseFloat(bl.iva_percent) || 0) / 100);
        return {
            description: bl.description,
            base,
            iva,
            total: base + iva,
            isService: false,
            id: bl.id,
            quantity: bl.quantity,
            unit_price: bl.unit_price,
            iva_percent: bl.iva_percent,
            invoiced: !!bl.invoice_id
        };
    });
    const allBudgetLines = [...serviceLines, ...manualLines];
    const uninvoicedLines = allBudgetLines.filter(l => !l.invoiced);
    const hasPendingBudget = budgets.some(b => b.status === 'pendiente');
    const invoicedLines = allBudgetLines.filter(l => l.invoiced);
    const budgetSubtotal = allBudgetLines.reduce((sum, l) => sum + l.base, 0);
    const budgetIVA = allBudgetLines.reduce((sum, l) => sum + l.iva, 0);
    const budgetTotal = allBudgetLines.reduce((sum, l) => sum + l.total, 0);
    const uninvoicedSubtotal = uninvoicedLines.reduce((sum, l) => sum + l.base, 0);
    const uninvoicedIVA = uninvoicedLines.reduce((sum, l) => sum + l.iva, 0);
    const uninvoicedTotal = uninvoicedLines.reduce((sum, l) => sum + l.total, 0);

    // Wrapper local que llama al helper compartido inyectando el proyecto actual
    const generateInvoicePDF = (factura, settings) => generarPdfFactura(factura, settings, project);

    // Núcleo común: dadas unas líneas (formato {description, quantity, unit_price, iva_percent}),
    // crea la factura en el modelo fiscal nuevo y marca los servicios/líneas como facturados.
    // Devuelve { ok, factura } o lanza para que withLock muestre el error.
    const _emitirFactura = async ({ lineasUI, serviceIdsAfectados, budgetLineIdsAfectados, ivaPct }) => {
        if (!project?.client_id) {
            throw new Error('El proyecto no tiene cliente asociado. Asigna un cliente al proyecto antes de facturar.');
        }
        const lineasParaFactura = lineasUI.map(l => ({
            concepto: l.description || 'Servicio',
            cantidad: l.quantity || 1,
            precio_unitario: l.unit_price || 0,
            descuento_porcentaje: 0,
        }));
        const res = await crearFactura({
            clientId: project.client_id,
            projectId: id,
            lineas: lineasParaFactura,
            ivaPorcentaje: ivaPct ?? 21,
        });
        if (res.error) throw new Error(res.error);
        const factura = res.factura;

        if (serviceIdsAfectados?.length) {
            await supabase.from('proyecto_servicios').update({ invoice_id: factura.id }).in('id', serviceIdsAfectados);
        }
        if (budgetLineIdsAfectados?.length) {
            await supabase.from('presupuesto_lineas').update({ invoice_id: factura.id }).in('id', budgetLineIdsAfectados);
        }

        // Registrar en project_files
        const dateStr = new Date().toLocaleDateString('es-ES').replace(/\//g, '-');
        const alias = project.id_alias || project.id.substring(0, 8).toUpperCase();
        const fileName = `Factura - ${project.name} - ${alias} - ${dateStr}`;
        await supabase.from('proyecto_archivos').insert([{
            project_id: id,
            name: fileName,
            size: `${lineasParaFactura.length} líneas`,
            file_type: 'FACTURA',
            url: `invoice:${factura.id}`,
        }]);

        // Registrar en Verifactu (cadena SHA-256 local) — NO bloqueante.
        // Si falla, la factura ya está creada y se podrá reintentar desde /verifactu.
        const verifactuRes = await registrarVerifactu(factura.id, 'alta');
        if (verifactuRes.error) {
            showNotification(`Factura ${factura.numero} emitida, pero Veri*factu falló: ${verifactuRes.error}. Reintenta desde /verifactu.`, 'error');
        }

        // Generar PDF en el momento de emisión (con qr_url ya seteado si Verifactu fue OK)
        const settings = await getCompanySettings();
        const { factura: facturaCompleta } = await getFacturaCompleta(factura.id);
        const doc = generateInvoicePDF(facturaCompleta, settings);
        doc.save(`${fileName}.pdf`);

        return { factura, verifactu: verifactuRes };
    };

    const handleGenerateInvoice = async () => {
        if (hasPendingBudget) {
            const pendingBud = budgets.find(b => b.status === 'pendiente');
            if (pendingBud) {
                handleUpdateBudgetStatus(pendingBud.id, 'confirmado');
                return;
            }
        }
        if (uninvoicedLines.length === 0) {
            showNotification('No hay líneas pendientes de facturar', 'error');
            return;
        }
        const ivaPct = parseFloat(uninvoicedLines[0]?.iva_percent) || 21;
        await withLock(async () => {
            const serviceIds = projectServices.filter(ps => !ps.invoice_id).map(ps => ps.id);
            const budgetLineIds = budgetLines.filter(bl => !bl.invoice_id).map(bl => bl.id);
            const { factura } = await _emitirFactura({
                lineasUI: uninvoicedLines,
                serviceIdsAfectados: serviceIds,
                budgetLineIdsAfectados: budgetLineIds,
                ivaPct,
            });
            showNotification(`Factura ${factura.numero} generada correctamente ✅`);
            fetchProjectData();
            fetchBudgetData();
        }, 'Generando factura...');
    };

    // Enviar la factura al cliente con el PDF adjunto. El email va al que quedó
    // congelado en la propia factura al emitirla.
    const handleEnviarInvoice = async (invoiceId) => {
        await withLock(async () => {
            const [{ factura }, settings] = await Promise.all([
                getFacturaCompleta(invoiceId),
                getCompanySettings(),
            ]);
            if (!factura) throw new Error('Factura no encontrada');

            const doc = generateInvoicePDF(factura, settings);
            const res = await enviarDocumento({
                para: factura.cliente_email,
                asunto: `Factura ${factura.numero} · Automatizatelo`,
                saludo: '¡Hola!',
                lineas: [
                    `Soy Manel. Te adjunto la factura ${factura.numero} por un total de €${parseFloat(factura.total).toFixed(2)}.`,
                    factura.fecha_vencimiento
                        ? `El vencimiento es el ${new Date(factura.fecha_vencimiento).toLocaleDateString('es-ES')}. En el propio documento tienes la forma de pago.`
                        : 'En el propio documento tienes la forma de pago.',
                    'Cualquier duda, responde a este correo y lo vemos.',
                ],
                doc,
                nombreAdjunto: `${factura.numero}.pdf`,
            });

            if (res.error) throw new Error(res.error);
            showNotification(`Factura enviada a ${factura.cliente_email} 📤`, 'success');
        }, 'Enviando factura...');
    };

    const handleRedownloadInvoice = async (invoiceId) => {
        try {
            const [{ factura }, settings] = await Promise.all([
                getFacturaCompleta(invoiceId),
                getCompanySettings(),
            ]);
            if (!factura) { showNotification('Factura no encontrada', 'error'); return; }
            const doc = generateInvoicePDF(factura, settings);
            const alias = project?.id_alias || project?.id?.substring(0, 8).toUpperCase() || '';
            const dateStr = new Date(factura.fecha_emision).toLocaleDateString('es-ES').replace(/\//g, '-');
            doc.save(`Factura - ${project?.name} - ${alias} - ${dateStr}.pdf`);
        } catch (err) {
            showNotification(`Error al descargar: ${err.message}`, 'error');
        }
    };

    // Lógica real de generación (llamada tras confirmación o directamente si no hay activo)
    const doGenerateBudgetPDF = async (previousBudgetId = null) => {
        setInvoiceLoading(true);
        showLoading('Generando presupuesto...');
        try {
            // Si hay un presupuesto anterior activo, marcarlo como denegado
            if (previousBudgetId) {
                const { error: denyErr } = await supabase
                    .from('presupuestos')
                    .update({ status: 'denegado' })
                    .eq('id', previousBudgetId);
                if (denyErr) throw denyErr;
            }

            const pName = project?.name || 'Proyecto';
            const pAlias = project?.id_alias || '';
            const today = new Date().toLocaleDateString('es-ES');

            // Numeración y snapshot primero; el PDF se dibuja después con el
            // mismo servicio que usa la re-descarga, para que las dos salidas
            // no puedan divergir.
            const budgetCount = budgets.length + 1;
            const bAlias = project?.id_alias || project?.id?.substring(0, 8).toUpperCase() || '';
            const budgetNumber = `PRE-${bAlias}-${String(budgetCount).padStart(3, '0')}`;

            const lineItemsSnapshot = allBudgetLines.map(l => ({
                description: l.description,
                quantity: l.quantity || 1,
                unit_price: l.unit_price,
                iva_percent: l.iva_percent,
                base: l.base,
                iva: l.iva,
                total: l.total,
                type: l.isService ? 'servicio' : 'manual'
            }));

            const { data: newBudget, error: budErr } = await supabase
                .from('presupuestos')
                .insert([{
                    project_id: id,
                    budget_number: budgetNumber,
                    budget_date: new Date().toISOString().split('T')[0],
                    subtotal: budgetSubtotal,
                    iva_total: budgetIVA,
                    total: budgetTotal,
                    line_items: lineItemsSnapshot,
                    status: 'pendiente'
                }])
                .select()
                .single();

            if (budErr) throw budErr;

            const fileName = `Presupuesto - ${pName} - ${pAlias} - ${today.replace(/\//g, '-')}`;

            await supabase.from('proyecto_archivos').insert([{
                project_id: id,
                name: fileName,
                size: `${allBudgetLines.length} líneas`,
                file_type: 'PRESUPUESTO',
                url: `budget:${newBudget.id}`
            }]);

            const doc = generarPdfPresupuesto({
                numero: budgetNumber,
                fecha: newBudget.budget_date,
                proyecto: project,
                lineas: lineItemsSnapshot,
                subtotal: budgetSubtotal,
                ivaTotal: budgetIVA,
                total: budgetTotal,
                emisor: await getCompanySettings(),
                receptor: receptorPdf(),
            });
            doc.save(`${fileName}.pdf`);
            showNotification(previousBudgetId ? 'Presupuesto anterior denegado. Nuevo presupuesto generado ✅' : 'Presupuesto generado y guardado ✅');
            fetchProjectData();
            fetchBudgetData();
        } catch (error) {
            showNotification(`Error: ${error.message}`, 'error');
        } finally {
            setInvoiceLoading(false);
            hideLoading();
        }
    };

    const handleGenerateBudgetPDF = async () => {
        // Sin líneas no hay presupuesto. El botón ya viene deshabilitado, pero
        // un botón deshabilitado no es una defensa: esto guardaba un snapshot
        // vacío en la base de datos si se llegaba por cualquier otro camino.
        if (allBudgetLines.length === 0) {
            showNotification('Añade al menos un concepto antes de crear el presupuesto', 'error');
            return;
        }
        // Buscar si existe algún presupuesto en estado 'pendiente'
        const activeBudget = budgets.find(b => b.status === 'pendiente');
        if (activeBudget) {
            setExistingActiveBudget(activeBudget);
            setBudgetConfirmModal(true);
            return;
        }
        // No hay ninguno activo, generar directamente
        doGenerateBudgetPDF(null);
    };

    // Llamado cuando el usuario confirma en el modal de advertencia
    const handleConfirmNewBudget = () => {
        setBudgetConfirmModal(false);
        const prevId = existingActiveBudget?.id || null;
        setExistingActiveBudget(null);
        doGenerateBudgetPDF(prevId);
    };


    // Enviar el presupuesto al cliente por correo, con el PDF adjunto.
    // Mismo dibujo que la descarga; el email sale de la ficha del cliente.
    const handleEnviarBudget = async (budgetId) => {
        const bud = budgets.find(b => b.id === budgetId);
        if (!bud) { showNotification('Presupuesto no encontrado', 'error'); return; }

        await withLock(async () => {
            const doc = generarPdfPresupuesto({
                numero: bud.budget_number,
                fecha: bud.budget_date,
                proyecto: project,
                lineas: bud.line_items || [],
                subtotal: bud.subtotal,
                ivaTotal: bud.iva_total,
                total: bud.total,
                emisor: await getCompanySettings(),
                receptor: receptorPdf(),
            });

            const res = await enviarDocumento({
                para: clienteFactura?.email,
                asunto: `Presupuesto ${bud.budget_number} · Automatizatelo`,
                saludo: '¡Hola!',
                lineas: [
                    `Soy Manel. Te adjunto el presupuesto ${bud.budget_number} de «${project?.name || 'tu proyecto'}»: €${parseFloat(bud.total).toFixed(2)} en total (IVA incluido).`,
                    'Precio y alcance cerrados: lo que pone es lo que es. Si te encaja, contéstame a este correo y arrancamos.',
                    'Y si quieres ajustar algo, dímelo y te preparo otra versión.',
                ],
                doc,
                nombreAdjunto: `${bud.budget_number}.pdf`,
            });

            if (res.error) throw new Error(res.error);
            showNotification(`Presupuesto enviado a ${clienteFactura.email} 📤`, 'success');
        }, 'Enviando presupuesto...');
    };

    const handleRedownloadBudget = async (budgetId) => {
        const bud = budgets.find(b => b.id === budgetId);
        if (!bud) { showNotification('Presupuesto no encontrado', 'error'); return; }

        // Mismo dibujo que al generar: una sola implementacion en el servicio
        const doc = generarPdfPresupuesto({
            numero: bud.budget_number,
            fecha: bud.budget_date,
            proyecto: project,
            lineas: bud.line_items || [],
            subtotal: bud.subtotal,
            ivaTotal: bud.iva_total,
            total: bud.total,
            emisor: await getCompanySettings(),
            receptor: receptorPdf(),
        });

        const bDate = new Date(bud.budget_date).toLocaleDateString('es-ES');
        const fileName = `Presupuesto - ${project?.name || 'Proyecto'} - ${project?.id_alias || ''} - ${bDate.replace(/\//g, '-')}`;
        doc.save(`${fileName}.pdf`);
    };

    const handleUpdateBudgetStatus = async (budgetId, newStatus) => {
        if (budgetActionLoading || actionLock) return;
        await withLock(async () => {
            setBudgetActionLoading(budgetId);
            try {
                const bud = budgets.find(b => b.id === budgetId);
                if (!bud) throw new Error('Presupuesto no encontrado');

                if (newStatus === 'confirmado') {
                    // LA FACTURA VA PRIMERO. Antes se marcaba 'confirmado' y
                    // luego se intentaba facturar: si la factura fallaba (NIF
                    // del cliente inválido, por ejemplo), el presupuesto se
                    // quedaba confirmado sin factura.
                    //
                    // Reutilizamos el snapshot del presupuesto (bud.line_items).
                    const lineasUI = (bud.line_items || []).map(l => ({
                        description: l.description,
                        quantity: l.quantity || 1,
                        unit_price: l.unit_price || 0,
                        iva_percent: l.iva_percent || 21,
                    }));
                    if (lineasUI.length === 0) {
                        throw new Error('El presupuesto no tiene líneas para facturar');
                    }
                    const ivaPct = parseFloat(lineasUI[0]?.iva_percent) || 21;
                    const { factura } = await _emitirFactura({
                        lineasUI,
                        serviceIdsAfectados: projectServices.filter(ps => !ps.invoice_id).map(ps => ps.id),
                        budgetLineIdsAfectados: budgetLines.filter(bl => !bl.invoice_id).map(bl => bl.id),
                        ivaPct,
                    });

                    const { error } = await supabase
                        .from('presupuestos')
                        .update({ status: 'confirmado' })
                        .eq('id', budgetId);
                    if (error) throw error;

                    // Limpiar borrador (servicios/líneas de presupuesto consumidos por la factura)
                    await supabase.from('proyecto_servicios').delete().eq('project_id', id);
                    await supabase.from('presupuesto_lineas').delete().eq('project_id', id);
                    showNotification(`¡Presupuesto confirmado y factura ${factura.numero} generada! 🚀`);
                } else {
                    const { error } = await supabase
                        .from('presupuestos')
                        .update({ status: newStatus })
                        .eq('id', budgetId);
                    if (error) throw error;
                    if (newStatus === 'denegado') showNotification('Presupuesto marcado como denegado ✖️');
                }
                fetchBudgetData();
                fetchProjectData();
            } finally {
                setBudgetActionLoading(null);
            }
        }, 'Procesando presupuesto...');
    };

    // ═══════════════════════════════════════
    // PAGOS / COBROS
    // ═══════════════════════════════════════

    const PAYMENT_METHODS = [
        { value: 'efectivo', label: 'Efectivo', icon: Banknote, color: 'text-emerald-500' },
        { value: 'tarjeta', label: 'Tarjeta', icon: CreditCard, color: 'text-blue-500' },
        { value: 'transferencia', label: 'Transferencia', icon: Building2, color: 'text-violet-500' },
        { value: 'bizum', label: 'Bizum', icon: Smartphone, color: 'text-cyan-500' },
        { value: 'otro', label: 'Otro', icon: Wallet, color: 'text-amber-500' },
    ];

    const totalInvoiced = invoices.reduce((sum, inv) => sum + parseFloat(inv.total || 0), 0);
    const totalPaid = payments.reduce((sum, p) => sum + parseFloat(p.amount || 0), 0);
    const pendingBalance = totalInvoiced - totalPaid;
    const paidPercent = totalInvoiced > 0 ? Math.min((totalPaid / totalInvoiced) * 100, 100) : 0;

    const getPaymentMethodInfo = (method) => PAYMENT_METHODS.find(m => m.value === method) || PAYMENT_METHODS[4];

    // Generar PDF de recibo — el dibujo vive en features/proyectos/services/pdfs.js
    const generateReceiptPDF = async (paymentData) => generarPdfRecibo({
        pago: paymentData,
        metodoEtiqueta: getPaymentMethodInfo(paymentData.payment_method).label,
        proyecto: project,
        totalFacturado: totalInvoiced,
        totalCobrado: totalPaid,
        emisor: await getCompanySettings(),
        receptor: receptorPdf(),
    });

    const handleRegisterPayment = async (e) => {
        e.preventDefault();
        const amount = parseFloat(newPayment.amount);
        if (!amount || amount <= 0) {
            showNotification('Introduce un importe v\u00e1lido', 'error');
            return;
        }
        if (totalInvoiced <= 0) {
            showNotification('No hay facturas emitidas para registrar pagos', 'error');
            return;
        }

        // Ley 11/2021: máximo 1.000 € en efectivo por OPERACIÓN cuando una de
        // las partes es empresario. Y fraccionar el pago no fracciona la
        // operación: en una factura de 2.000 €, dos plazos de 1.000 en efectivo
        // siguen estando fuera de límite. Se avisa en vez de bloquear porque
        // hay excepciones (pagador particular no residente, hasta 10.000 €).
        if (newPayment.payment_method === 'efectivo') {
            const efectivoAcumulado = payments
                .filter(p => p.payment_method === 'efectivo')
                .reduce((s, p) => s + parseFloat(p.amount || 0), 0) + amount;

            if (totalInvoiced > 1000 || efectivoAcumulado > 1000) {
                const ok = await confirm({
                    title: 'Límite legal de efectivo',
                    message: `La Ley 11/2021 prohíbe cobrar en efectivo operaciones de más de 1.000 € cuando una de las partes es empresario — y fraccionar el pago no fracciona la operación. Esta operación suma €${totalInvoiced.toFixed(2)} y el efectivo acumulado con este pago sería €${efectivoAcumulado.toFixed(2)}. La sanción es el 25% de lo pagado en efectivo. ¿Registrarlo igualmente?`,
                    confirmText: 'Registrar igualmente',
                    cancelText: 'Cambiar método',
                });
                if (!ok) return;
            }
        }

        await withLock(async () => {
            const paymentCount = payments.length + 1;
            const alias = project.id_alias || project.id.substring(0, 8).toUpperCase();
            const paymentNumber = `REC-${alias}-${String(paymentCount).padStart(3, '0')}`;
            const today = new Date().toISOString().split('T')[0];

            // Insert payment in DB
            const { data: payment, error: payErr } = await supabase
                .from('cobros')
                .insert([{
                    project_id: id,
                    payment_number: paymentNumber,
                    payment_date: today,
                    amount: amount,
                    payment_method: newPayment.payment_method,
                    notes: newPayment.notes || null,
                    created_by: currentProfile?.id || null
                }])
                .select()
                .single();
            if (payErr) throw payErr;

            // Create file name
            const dateStr = new Date().toLocaleDateString('es-ES').replace(/\//g, '-');
            const fileName = `Recibo - ${project.name} - ${alias} - ${dateStr}`;

            // Save to project files
            await supabase.from('proyecto_archivos').insert([{
                project_id: id,
                name: fileName,
                size: `\u20ac${amount.toFixed(2)}`,
                file_type: 'RECIBO',
                url: `payment:${payment.id}`
            }]);

            // Generate and download receipt PDF
            const doc = await generateReceiptPDF(payment);
            doc.save(`${fileName}.pdf`);

            // El puente que faltaba: si con este cobro queda cubierto el total
            // facturado, las facturas del proyecto pasan a 'pagada'. Si no,
            // siguen en 'pendiente' — factura emitida no es factura cobrada.
            const cobradoConEste = totalPaid + amount;
            if (cobradoConEste >= totalInvoiced - 0.01) {
                const { error: estadoErr } = await supabase
                    .from('facturas')
                    .update({ estado: 'pagada', fecha_pago: today })
                    .eq('project_id', id)
                    .eq('estado', 'pendiente');
                if (estadoErr) console.error('Cobro registrado, pero no se pudo marcar la factura como pagada:', estadoErr.message);
                else showNotification('Cobro completado: factura marcada como pagada 💚');
            }

            setPaymentModal(false);
            setNewPayment({ amount: '', payment_method: 'transferencia', notes: '' });
            registrarAccion('cobro.registrado', { tipo: 'cobro', id: payment.id, label: paymentNumber, metadata: { importe: amount, metodo: newPayment.payment_method } });
            showNotification(`Pago ${paymentNumber} registrado correctamente \u2705`);
            fetchBudgetData();
            fetchProjectData();
        }, 'Registrando pago...');
    };

    const handleRedownloadReceipt = async (paymentId) => {
        const pay = payments.find(p => p.id === paymentId);
        if (!pay) { showNotification('Recibo no encontrado', 'error'); return; }
        const doc = await generateReceiptPDF(pay);
        const alias = project?.id_alias || project?.id?.substring(0, 8).toUpperCase() || '';
        const dateStr = new Date(pay.payment_date).toLocaleDateString('es-ES').replace(/\//g, '-');
        doc.save(`Recibo - ${project?.name} - ${alias} - ${dateStr}.pdf`);
    };

    if (loading && !project) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-[#0F0716]">
                <div className="size-12 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
            </div>
        );
    }

    if (!project) return <div className="p-20 text-center text-variable-main">Proyecto no encontrado</div>;

    const progressValue = project.total_hours > 0 ? (project.actual_hours / project.total_hours) * 100 : 0;
    const completedTasks = tasks.filter(t => t.status === 'done').length;
    const taskProgress = tasks.length > 0 ? (completedTasks / tasks.length) * 100 : 0;

    // IDs de sprints completados
    const completedSprintIds = sprints.filter(s => s.status === 'completed').map(s => s.id);
    // Tareas completadas del backlog (sin sprint)
    const doneBacklogTasks = tasks.filter(t => t.status === 'done' && !t.sprint_id);
    // Tareas visibles: ocultar "done" de sprints completados Y "done" del backlog
    const visibleTasks = tasks.filter(t => {
        if (t.status === 'done' && !t.sprint_id) return false;
        if (t.status === 'done' && t.sprint_id && completedSprintIds.includes(t.sprint_id)) return false;
        return true;
    });

    // Mapa de estado → estilos
    const TASK_STATUS_STYLES = {
        pending: { label: 'Pendiente', icon: '○', color: 'text-variable-muted', bg: 'bg-white/5 border-variable' },
        in_progress: { label: 'En Curso', icon: '◷', color: 'text-primary', bg: 'bg-primary/10 border-primary/20' },
        review: { label: 'Revisión', icon: '◉', color: 'text-violet-400', bg: 'bg-violet-400/10 border-violet-400/20' },
        done: { label: 'Hecho', icon: '✓', color: 'text-emerald-500', bg: 'bg-emerald-500/10 border-emerald-500/20' },
    };
    const getTaskStyle = (s) => TASK_STATUS_STYLES[s] || TASK_STATUS_STYLES.pending;

    // Estados disponibles para el proyecto
    const PROJECT_STATUSES = [
        { value: 'Pendiente', label: 'Pendiente', bg: 'bg-amber-500', color: 'text-white' },
        { value: 'En Progreso', label: 'En Progreso', bg: 'bg-primary', color: 'text-white' },
        { value: 'Finalizado', label: 'Finalizado', bg: 'bg-emerald-500', color: 'text-white' },
        { value: 'Cancelado', label: 'Cancelado', bg: 'bg-red-500', color: 'text-white' },
    ];
    const handleProjectStatusChange = async (newStatus) => {
        await supabase.from('proyectos').update({ status: newStatus }).eq('id', project.id);
        setProject(prev => ({ ...prev, status: newStatus }));
        showNotification(`Estado del proyecto actualizado a "${newStatus}"`, 'success');
    };

    return (
        <div className="flex min-h-screen transition-colors duration-300 overflow-hidden">
            {/* Global loading overlay is now handled by LoadingContext */}

            <Sidebar />

            <main className="flex-1 p-4 sm:p-10 overflow-y-auto pb-32 md:pb-10">
                <div className="flex flex-col sm:flex-row justify-between items-start gap-4">
                    <Link to="/projects" className="inline-flex items-center gap-2 text-variable-muted hover:text-primary transition-colors mb-6 sm:mb-8 group">
                        <ArrowLeft size={20} className="group-hover:-translate-x-1 transition-transform" />
                        <span className="font-medium">Volver a Proyectos</span>
                    </Link>

                    <div className="flex items-center gap-3">
                        <button
                            onClick={toggleTheme}
                            className="p-3 glass rounded-2xl text-variable-muted hover:text-primary transition-all flex items-center gap-2"
                        >
                            {darkMode ? <Sun size={20} /> : <Moon size={20} />}
                            <span className="hidden sm:inline text-xs font-bold uppercase tracking-widest leading-none">
                                {darkMode ? 'Claro' : 'Oscuro'}
                            </span>
                        </button>
                    </div>
                </div>

                <section className="flex flex-col lg:flex-row lg:items-end justify-between gap-8 mb-8 sm:mb-12">
                    <div className="space-y-4">
                        <div className="flex flex-wrap items-center gap-3">
                            <div className="relative group">
                                <span className={`text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-lg cursor-pointer transition-all hover:scale-105 ${project.status === 'Finalizado' ? 'bg-emerald-500 text-white' :
                                    project.status === 'Cancelado' ? 'bg-red-500 text-white' :
                                        project.status === 'Pendiente' ? 'bg-amber-500 text-white' :
                                            'bg-primary text-white'
                                    }`}>
                                    {project.status} ▾
                                </span>
                                <div className="absolute top-full left-0 mt-1 glass rounded-xl border border-variable shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50 min-w-[160px] overflow-hidden">
                                    {PROJECT_STATUSES.map(ps => (
                                        <button
                                            key={ps.value}
                                            onClick={() => handleProjectStatusChange(ps.value)}
                                            className={`w-full text-left px-4 py-2.5 text-xs font-bold flex items-center gap-2 transition-all hover:bg-primary/10 ${project.status === ps.value ? 'text-primary' : 'text-variable-main'
                                                }`}
                                        >
                                            <span className={`size-2 rounded-full ${ps.bg}`} />
                                            {ps.label}
                                            {project.status === ps.value && <span className="ml-auto text-[10px]">✓</span>}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <span className="text-variable-muted text-[10px] sm:text-xs font-bold tracking-widest uppercase">ID: {project.id_alias || project.id.slice(0, 8)}</span>
                        </div>
                        <h1 className="text-3xl sm:text-5xl font-bold font-display tracking-tight text-variable-main">{project.name}</h1>
                        <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-6 text-variable-muted text-base sm:text-lg">
                            <p className="flex items-center gap-2">
                                Cliente: <span className="text-variable-main font-bold">{project.client}</span>
                            </p>
                            {project.leads && (
                                <p className="flex items-center gap-2 bg-primary/10 px-3 py-1 rounded-xl text-xs font-bold text-primary border border-primary/20">
                                    <Target size={14} />
                                    Lead: <Link to="/leads" className="hover:underline">{project.leads.company || `${project.leads.first_name} ${project.leads.last_name}`}</Link>
                                </p>
                            )}
                        </div>
                    </div>
                    <div className="flex flex-col sm:flex-row gap-4 w-full sm:w-auto">
                        <button className="glass flex items-center justify-center gap-2 px-6 py-4 rounded-2xl font-bold text-sm text-variable-main hover:brightness-110 transition-all shadow-sm">
                            <Share2 size={18} /> Compartir
                        </button>
                        <button className="bg-primary text-white flex items-center justify-center gap-2 px-8 py-4 rounded-2xl font-bold text-sm hover:brightness-110 transition-all shadow-xl shadow-primary/20">
                            <Edit3 size={18} /> Editar Proyecto
                        </button>
                    </div>
                </section>

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
                    {/* HITOS */}
                    <div className="lg:col-span-3">
                        <div className="glass rounded-[2rem] p-8 h-full min-h-[400px]">
                            <h3 className="text-xl font-bold mb-10 flex items-center justify-between text-variable-main">
                                <div className="flex items-center gap-3">
                                    <Calendar size={20} className="text-primary" /> Hitos
                                </div>
                                <button onClick={() => setMilestoneModal(true)} className="p-2 bg-primary/10 text-primary rounded-xl hover:bg-primary/20 transition-all">
                                    <Plus size={16} />
                                </button>
                            </h3>
                            <div className="relative space-y-12 pl-4 border-l border-variable">
                                {milestones.length === 0 && <p className="text-xs text-variable-muted italic">No hay hitos definidos.</p>}
                                {milestones.map((m, i) => (
                                    <div key={m.id} className="relative">
                                        <div className={`absolute -left-[25.5px] top-1 size-4 rounded-full border-4 border-variable shadow-lg ${m.status === 'completed' ? 'bg-primary shadow-primary/40' : (m.status === 'in_progress' ? 'bg-primary animate-pulse' : 'bg-variable-muted opacity-50')
                                            }`} />
                                        <div className="flex justify-between items-start group">
                                            <div>
                                                <p className={`text-sm font-bold ${m.status === 'pending' ? 'text-variable-muted' : (m.status === 'in_progress' ? 'text-primary' : 'text-variable-main')}`}>
                                                    {m.title}
                                                </p>
                                                <p className="text-xs text-variable-muted mt-1">{m.target_date ? new Date(m.target_date).toLocaleDateString() : (m.status === 'in_progress' ? 'En curso' : 'Pendiente')}</p>
                                            </div>
                                            <button
                                                onClick={async () => {
                                                    const newStatus = m.status === 'completed' ? 'pending' : 'completed';
                                                    await supabase.from('proyecto_hitos').update({ status: newStatus }).eq('id', m.id);
                                                }}
                                                className="opacity-0 group-hover:opacity-100 transition-opacity p-1 text-primary hover:bg-primary/10 rounded-md"
                                                title="Cambiar Estado"
                                            >
                                                <CheckCircle2 size={14} />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    <div className="lg:col-span-6 space-y-10">
                        {/* CHARTS RESUMEN */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {/* Progreso Tareas */}
                            <div className="glass rounded-[2.5rem] p-8 flex flex-col items-center">
                                <h3 className="text-lg font-bold self-start mb-8 text-variable-main">Progreso Tareas</h3>
                                <div className="relative size-48 flex items-center justify-center">
                                    <svg className="size-full -rotate-90">
                                        <circle cx="96" cy="96" r="80" fill="transparent" stroke="currentColor" strokeWidth="14" className="text-variable-muted opacity-10" />
                                        <motion.circle
                                            initial={{ strokeDashoffset: 502 }}
                                            animate={{ strokeDashoffset: 502 * (1 - (taskProgress / 100)) }}
                                            cx="96" cy="96" r="80" fill="transparent" stroke="#f3791b" strokeWidth="14"
                                            strokeDasharray="502" strokeLinecap="round"
                                            transition={{ duration: 1.5, ease: "easeOut" }}
                                        />
                                    </svg>
                                    <div className="absolute flex flex-col items-center">
                                        <span className="text-4xl font-black font-display tracking-tighter text-variable-main">{Math.round(taskProgress)}%</span>
                                        <span className="text-[9px] font-bold text-variable-muted uppercase tracking-widest mt-1 text-center">Tareas Listas</span>
                                    </div>
                                </div>
                                <div className="flex justify-between w-full mt-6 px-2">
                                    <span className="text-[10px] text-variable-muted font-bold">{completedTasks} completadas</span>
                                    <span className="text-[10px] text-variable-muted font-bold">{tasks.length} total</span>
                                </div>
                            </div>

                            {/* Progreso Cobros */}
                            <div className="glass rounded-[2.5rem] p-8 flex flex-col items-center">
                                <h3 className="text-lg font-bold self-start mb-8 text-variable-main">Progreso Cobros</h3>
                                <div className="relative size-48 flex items-center justify-center">
                                    <svg className="size-full -rotate-90">
                                        <circle cx="96" cy="96" r="80" fill="transparent" stroke="currentColor" strokeWidth="14" className="text-variable-muted opacity-10" />
                                        <motion.circle
                                            initial={{ strokeDashoffset: 502 }}
                                            animate={{ strokeDashoffset: 502 * (1 - (paidPercent / 100)) }}
                                            cx="96" cy="96" r="80" fill="transparent" stroke="#10b981" strokeWidth="14"
                                            strokeDasharray="502" strokeLinecap="round"
                                            transition={{ duration: 1.5, ease: "easeOut" }}
                                        />
                                    </svg>
                                    <div className="absolute flex flex-col items-center">
                                        <span className="text-4xl font-black font-display tracking-tighter text-variable-main">{Math.round(paidPercent)}%</span>
                                        <span className="text-[9px] font-bold text-variable-muted uppercase tracking-widest mt-1 text-center">Cobrado</span>
                                    </div>
                                </div>
                                <div className="flex justify-between w-full mt-6 px-2">
                                    <span className="text-[10px] text-emerald-500 font-bold">€{totalPaid.toFixed(2)} cobrado</span>
                                    <span className="text-[10px] text-variable-muted font-bold">€{totalInvoiced.toFixed(2)} facturado</span>
                                </div>
                                {pendingBalance > 0 && (
                                    <div className="mt-3 px-3 py-1.5 bg-amber-500/10 border border-amber-500/20 rounded-xl">
                                        <span className="text-[10px] font-black text-amber-500">Pendiente: €{pendingBalance.toFixed(2)}</span>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* TAREAS */}
                        <div className="glass rounded-[2rem] p-8 overflow-visible">
                            <h3 className="font-bold mb-6 flex items-center justify-between text-variable-main">
                                <div className="flex items-center gap-2">
                                    Tareas del Proyecto
                                    <span className="text-xs font-normal text-variable-muted">({visibleTasks.length})</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <button onClick={() => setTaskModal(true)} className="p-2 bg-primary/10 text-primary rounded-xl hover:bg-primary/20 transition-all" title="Nueva tarea">
                                        <Plus size={16} />
                                    </button>
                                    <Link to="/tasks" className="text-primary text-xs hover:underline font-bold">Gestionar Kanban →</Link>
                                </div>
                            </h3>
                            <div className="space-y-4">
                                {visibleTasks.length === 0 && (
                                    <div className="py-10 text-center border-2 border-dashed border-variable rounded-3xl">
                                        <p className="text-sm text-variable-muted">No hay tareas pendientes.</p>
                                    </div>
                                )}
                                {visibleTasks.slice(0, 8).map((task) => {
                                    const st = getTaskStyle(task.status);
                                    return (
                                        <div key={task.id} className="p-4 rounded-2xl bg-white/5 border border-variable flex items-start justify-between hover:bg-white/10 transition-all group cursor-pointer gap-3">
                                            {/* Toggle status button */}
                                            <button
                                                onClick={async (e) => {
                                                    e.stopPropagation();
                                                    // Ciclo: pending → in_progress → review → done → pending
                                                    const cycle = ['pending', 'in_progress', 'review', 'done'];
                                                    const nextStatus = cycle[(cycle.indexOf(task.status) + 1) % cycle.length];
                                                    await supabase.from('tareas').update({ status: nextStatus }).eq('id', task.id);
                                                    await supabase.from('tarea_estados').insert([{ task_id: task.id, status: nextStatus }]);
                                                    fetchProjectData();
                                                }}
                                                className={`p-2 rounded-xl transition-all flex-shrink-0 ${st.bg} ${st.color} hover:scale-110 font-black text-xs`}
                                                title={`Estado: ${st.label} — Clic para avanzar`}
                                            >
                                                {st.icon}
                                            </button>
                                            <div className="flex-1 min-w-0">
                                                <p className={`font-bold text-sm leading-snug ${task.status === 'done' ? 'text-variable-muted line-through' : 'text-variable-main'}`}>{task.title}</p>
                                                {task.description && <p className="text-[10px] text-variable-muted mt-0.5 line-clamp-1">{task.description}</p>}
                                                <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                                                    {/* Badge prioridad */}
                                                    <span className={`text-[9px] font-black px-2 py-0.5 rounded-md border uppercase ${task.priority === 'Crítica' ? 'bg-red-500/10 text-red-500 border-red-500/20' :
                                                        task.priority === 'Alta' ? 'bg-rose-500/10 text-rose-500 border-rose-500/20' :
                                                            task.priority === 'Media' ? 'bg-amber-500/10 text-amber-500 border-amber-500/20' :
                                                                'bg-blue-500/10 text-blue-500 border-blue-500/20'}`}>
                                                        {task.priority}
                                                    </span>
                                                    {/* Badge estado */}
                                                    <span className={`text-[9px] font-bold px-2 py-0.5 rounded-md border ${st.bg} ${st.color}`}>
                                                        {st.label}
                                                    </span>
                                                    {/* Asignado */}
                                                    {task.assigned_to && (
                                                        <span className="text-[9px] text-variable-muted font-bold">
                                                            → {users.find(u => u.id === task.assigned_to)?.nombre || 'Asignado'}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>

                    <div className="lg:col-span-3 space-y-10 order-first lg:order-last">
                        {/* SPRINTS */}
                        <div className="glass rounded-[2rem] p-8 flex flex-col">
                            <h3 className="text-lg font-bold mb-6 flex items-center justify-between text-variable-main">
                                Sprints
                                <Zap size={18} className="text-primary" />
                            </h3>
                            <div className="space-y-3">
                                {sprints.length === 0 && doneBacklogTasks.length === 0 && <p className="text-xs text-variable-muted italic">No hay sprints.</p>}
                                {sprints.map(sprint => (
                                    <button
                                        key={sprint.id}
                                        onClick={() => { setSelectedSprintId(sprint.id); setViewSprintModal(true); }}
                                        className="w-full text-left p-3 rounded-xl bg-white/5 border border-variable hover:bg-white/10 transition-all group"
                                    >
                                        <div className="flex justify-between items-center">
                                            <p className="text-xs font-bold text-variable-main truncate pr-2">{sprint.name}</p>
                                            <span className={`text-[8px] px-1.5 py-0.5 rounded uppercase font-black ${sprint.status === 'completed' ? 'bg-emerald-500/10 text-emerald-500' :
                                                sprint.status === 'active' ? 'bg-amber-500/10 text-amber-500' : 'bg-variable/10 text-variable-muted'
                                                }`}>
                                                {sprint.status === 'completed' ? 'Listo' : (sprint.status === 'active' ? 'Activo' : 'Plan')}
                                            </span>
                                        </div>
                                        <p className="text-[9px] text-variable-muted mt-1">Ver tareas ({tasks.filter(t => t.sprint_id === sprint.id).length}) →</p>
                                    </button>
                                ))}
                                {/* Sprint virtual: Backlog (tareas completadas sin sprint) */}
                                {doneBacklogTasks.length > 0 && (
                                    <button
                                        onClick={() => { setSelectedSprintId('backlog'); setViewSprintModal(true); }}
                                        className="w-full text-left p-3 rounded-xl bg-white/5 border border-dashed border-emerald-500/30 hover:bg-emerald-500/5 transition-all"
                                    >
                                        <div className="flex justify-between items-center">
                                            <p className="text-xs font-bold text-variable-main truncate pr-2">📦 Backlog</p>
                                            <span className="text-[8px] px-1.5 py-0.5 rounded uppercase font-black bg-emerald-500/10 text-emerald-500">Listo</span>
                                        </div>
                                        <p className="text-[9px] text-variable-muted mt-1">Tareas completadas ({doneBacklogTasks.length}) →</p>
                                    </button>
                                )}
                            </div>
                        </div>

                        {/* RECURSOS / HORAS */}
                        <div className="glass rounded-[2rem] p-8 flex flex-col">
                            <h3 className="text-lg font-bold mb-6 flex items-center justify-between text-variable-main">
                                Recursos
                                <BarChart3 size={18} className="text-variable-muted" />
                            </h3>
                            <div className="space-y-6">
                                <div className="space-y-2 text-variable-main">
                                    <div className="flex justify-between text-xs font-bold uppercase tracking-widest">
                                        <span className="text-variable-muted">Horas Reales</span>
                                        <span>{project.actual_hours} / {project.total_hours}</span>
                                    </div>
                                    <div className="h-2 bg-white/5 border border-variable rounded-full overflow-hidden">
                                        <motion.div initial={{ width: 0 }} animate={{ width: `${Math.min(progressValue, 100)}%` }} className="h-full bg-primary" />
                                    </div>
                                </div>
                                <div className="p-4 rounded-2xl bg-primary/5 border border-primary/20">
                                    <p className="text-[10px] font-bold text-primary uppercase tracking-widest mb-1">Eficiencia</p>
                                    <p className="text-2xl font-black text-variable-main">
                                        {progressValue > 80 ? '+12.4%' : (progressValue > 50 ? '+5.2%' : 'Nueva')}
                                    </p>
                                </div>
                            </div>
                        </div>

                        {/* ARCHIVOS */}
                        <div className="glass rounded-[2.5rem] p-8">
                            <h3 className="text-lg font-bold mb-8 flex items-center justify-between text-variable-main">
                                Archivos
                                <button className="p-2 bg-primary/10 text-primary rounded-xl hover:bg-primary/20 transition-all">
                                    <Plus size={16} />
                                </button>
                            </h3>
                            <div className="space-y-4 max-h-[380px] overflow-y-auto pr-2 custom-scrollbar">
                                {files.length === 0 && <p className="text-xs text-variable-muted italic">No hay archivos adjuntos.</p>}
                                {files.map((file) => {
                                    const isInvoice = file.file_type === 'FACTURA' && file.url?.startsWith('invoice:');
                                    const isReceipt = file.file_type === 'RECIBO' && file.url?.startsWith('payment:');
                                    const isBudget = file.file_type === 'PRESUPUESTO' && file.url?.startsWith('budget:');
                                    const invoiceId = isInvoice ? file.url.replace('invoice:', '') : null;
                                    const paymentId = isReceipt ? file.url.replace('payment:', '') : null;
                                    const budgetId = isBudget ? file.url.replace('budget:', '') : null;
                                    const budgetObj = isBudget ? budgets.find(b => b.id === budgetId) : null;

                                    return (
                                        <div key={file.id} className="group relative">
                                            <div className="flex items-center gap-4 cursor-pointer text-variable-main" onClick={() => {
                                                if (isInvoice) handleRedownloadInvoice(invoiceId);
                                                else if (isReceipt) handleRedownloadReceipt(paymentId);
                                                else if (isBudget) handleRedownloadBudget(budgetId);
                                                else if (file.url) window.open(file.url, '_blank');
                                            }}>
                                                <div className={`p-3 border rounded-2xl transition-colors ${isInvoice || isBudget
                                                    ? 'bg-primary/10 border-primary/30 text-primary group-hover:bg-primary/20'
                                                    : isReceipt
                                                        ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-500 group-hover:bg-emerald-500/20'
                                                        : 'bg-white/5 border-variable group-hover:text-primary'
                                                    }`}>
                                                    {isInvoice || isBudget ? <Receipt size={20} /> : isReceipt ? <Banknote size={20} /> : <Download size={20} />}
                                                </div>
                                                <div className="flex-1 overflow-hidden">
                                                    <p className="text-sm font-bold truncate">{file.name}</p>
                                                    <div className="flex items-center gap-2">
                                                        <p className={`text-[10px] font-bold uppercase ${isInvoice || isBudget ? 'text-primary' : isReceipt ? 'text-emerald-500' : 'text-variable-muted'
                                                            }`}>{file.size || '---'} • {file.file_type || 'FILE'}</p>
                                                        {isBudget && budgetObj && (
                                                            <span className={`text-[8px] font-black px-1.5 py-0.5 rounded uppercase border ${budgetObj.status === 'confirmado' ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' : (budgetObj.status === 'denegado' ? 'bg-rose-500/10 text-rose-500 border-rose-500/20' : 'bg-primary/10 text-primary border-primary/20')
                                                                }`}>
                                                                {budgetObj.status}
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                                {(isInvoice || isReceipt || isBudget) && (
                                                    <div className={`p-2 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity ${isReceipt ? 'bg-emerald-500/10 text-emerald-500' : 'bg-primary/10 text-primary'}`} title="Descargar PDF">
                                                        <Download size={14} />
                                                    </div>
                                                )}
                                            </div>

                                            {/* Enviar la factura al cliente, sin salir de Archivos */}
                                            {isInvoice && (
                                                <div className="absolute right-0 top-1/2 -translate-y-1/2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all bg-dark/80 backdrop-blur-md p-1 rounded-xl border border-variable shadow-xl mr-10">
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); handleEnviarInvoice(invoiceId); }}
                                                        className="p-1.5 text-sky-400 rounded-lg transition-colors hover:bg-sky-500/10"
                                                        title="Enviar factura al cliente por email"
                                                    >
                                                        <Send size={14} />
                                                    </button>
                                                </div>
                                            )}

                                            {/* Acciones de Presupuesto */}
                                            {/* Enviar se puede siempre (también confirmado: al cliente
                                                le sirve tener su copia); aceptar/denegar solo pendiente */}
                                            {isBudget && budgetObj && (
                                                <div className="absolute right-0 top-1/2 -translate-y-1/2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all bg-dark/80 backdrop-blur-md p-1 rounded-xl border border-variable shadow-xl mr-10">
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); handleEnviarBudget(budgetId); }}
                                                        disabled={budgetActionLoading === budgetId || !clienteFactura?.email}
                                                        className={`p-1.5 text-sky-400 rounded-lg transition-colors ${budgetActionLoading === budgetId || !clienteFactura?.email
                                                            ? 'opacity-40 cursor-not-allowed'
                                                            : 'hover:bg-sky-500/10'
                                                            }`}
                                                        title={clienteFactura?.email ? `Enviar al cliente (${clienteFactura.email})` : 'El cliente no tiene email en su ficha'}
                                                    >
                                                        <Send size={14} />
                                                    </button>
                                                    {budgetObj.status === 'pendiente' && (<>
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); handleUpdateBudgetStatus(budgetId, 'confirmado'); }}
                                                        disabled={budgetActionLoading === budgetId}
                                                        className={`p-1.5 text-emerald-500 rounded-lg transition-colors ${budgetActionLoading === budgetId
                                                            ? 'opacity-40 cursor-not-allowed'
                                                            : 'hover:bg-emerald-500/10'
                                                            }`}
                                                        title="Confirmar Presupuesto (Generar Factura)"
                                                    >
                                                        {budgetActionLoading === budgetId
                                                            ? <span className="size-3.5 border-2 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin inline-block" />
                                                            : <CheckCircle2 size={14} />}
                                                    </button>
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); handleUpdateBudgetStatus(budgetId, 'denegado'); }}
                                                        disabled={budgetActionLoading === budgetId}
                                                        className={`p-1.5 text-rose-500 rounded-lg transition-colors ${budgetActionLoading === budgetId
                                                            ? 'opacity-40 cursor-not-allowed'
                                                            : 'hover:bg-rose-500/10'
                                                            }`}
                                                        title="Denegar Presupuesto"
                                                    >
                                                        {budgetActionLoading === budgetId
                                                            ? <span className="size-3.5 border-2 border-rose-500/30 border-t-rose-500 rounded-full animate-spin inline-block" />
                                                            : <X size={14} />}
                                                    </button>
                                                    </>)}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Presupuesto / servicios: JSX en features/proyectos/components/SeccionPresupuesto */}
                <SeccionPresupuesto
                    expanded={budgetExpanded}
                    onToggle={() => setBudgetExpanded(!budgetExpanded)}
                    hasPendingBudget={hasPendingBudget}
                    onGenerarPdf={handleGenerateBudgetPDF}
                    onAnadirConcepto={() => {
                        if (hasPendingBudget) {
                            showNotification('Hay un presupuesto pendiente activo. Debes gestionarlo antes de añadir más conceptos.', 'error');
                        } else {
                            setBudgetLineModal(true);
                        }
                    }}
                    invoiceLoading={invoiceLoading}
                    uninvoicedLines={uninvoicedLines}
                    onFacturar={handleGenerateInvoice}
                    allBudgetLines={allBudgetLines}
                    editingLineId={editingLineId}
                    tempLine={tempLine}
                    setTempLine={setTempLine}
                    onGuardarLinea={handleSaveLine}
                    onCancelarEdicion={() => { setEditingLineId(null); setTempLine(null); }}
                    onEditarLinea={handleEditLine}
                    onQuitarServicio={handleRemoveProjectService}
                    onBorrarLinea={handleDeleteBudgetLine}
                    invoices={invoices}
                    invoicesExpanded={invoicesExpanded}
                    onToggleInvoices={() => setInvoicesExpanded(!invoicesExpanded)}
                    onDescargarFactura={handleRedownloadInvoice}
                    budgetSubtotal={budgetSubtotal}
                    budgetIVA={budgetIVA}
                    budgetTotal={budgetTotal}
                    uninvoicedTotal={uninvoicedTotal}
                />

                {/* Cobros / pagos: JSX en features/proyectos/components/SeccionCobros */}
                <SeccionCobros
                    invoices={invoices}
                    payments={payments}
                    totalInvoiced={totalInvoiced}
                    totalPaid={totalPaid}
                    pendingBalance={pendingBalance}
                    paidPercent={paidPercent}
                    expanded={paymentsExpanded}
                    onToggle={() => setPaymentsExpanded(!paymentsExpanded)}
                    onRegistrar={() => setPaymentModal(true)}
                    getPaymentMethodInfo={getPaymentMethodInfo}
                    onDescargarRecibo={handleRedownloadReceipt}
                />
            </main >

            {/* MODALS */}
            < AnimatePresence >
                {milestoneModal && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setMilestoneModal(false)} className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
                        <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} className="relative w-full max-w-md glass rounded-[2.5rem] p-10 shadow-2xl overflow-visible">
                            <h2 className="text-2xl font-bold mb-2 text-variable-main text-center">Nuevo Hito</h2>
                            <p className="text-xs text-variable-muted text-center mb-8 italic">Define un punto de control clave</p>
                            <form onSubmit={handleAddMilestone} className="space-y-6">
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-primary uppercase tracking-widest ml-1">Título del Hito</label>
                                    <input required value={newMilestone.title} onChange={e => setNewMilestone({ ...newMilestone, title: e.target.value })} className="w-full bg-white/5 border border-variable rounded-2xl px-5 py-4 text-variable-main focus:outline-none focus:border-primary/50" placeholder="Ej: Fase de Diseño Lista" />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-primary uppercase tracking-widest ml-1">Fecha Límite</label>
                                    <input required type="date" value={newMilestone.target_date} onChange={e => setNewMilestone({ ...newMilestone, target_date: e.target.value })} className="w-full bg-white/5 border border-variable rounded-2xl px-5 py-4 text-variable-main focus:outline-none focus:border-primary/50" />
                                </div>
                                <button disabled={formLoading} type="submit" className="w-full py-4 bg-primary text-white rounded-2xl font-bold shadow-xl shadow-primary/30 hover:brightness-110 transition-all">
                                    {formLoading ? 'Guardando...' : 'Añadir Hito'}
                                </button>
                            </form>
                        </motion.div>
                    </div>
                )
                }

                {
                    taskModal && (
                        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setTaskModal(false)} className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
                            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} className="relative w-full max-w-md glass rounded-[2.5rem] p-10 shadow-2xl overflow-visible">
                                <h2 className="text-2xl font-bold mb-2 text-variable-main text-center">Nueva Tarea</h2>
                                <p className="text-xs text-variable-muted text-center mb-8 italic">Asigna una acción específica</p>
                                <form onSubmit={handleAddTask} className="space-y-5">
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black text-primary uppercase tracking-widest ml-1">Título de la Tarea</label>
                                        <input required value={newTask.title} onChange={e => setNewTask({ ...newTask, title: e.target.value })} className="w-full bg-white/5 border border-variable rounded-2xl px-5 py-4 text-variable-main focus:outline-none focus:border-primary/50" placeholder="Ej: Revisar contrato SLA" />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black text-primary uppercase tracking-widest ml-1">Descripción</label>
                                        <textarea rows={2} value={newTask.description} onChange={e => setNewTask({ ...newTask, description: e.target.value })} className="w-full bg-white/5 border border-variable rounded-2xl px-5 py-3 text-variable-main focus:outline-none focus:border-primary/50 resize-none text-sm" placeholder="Detalla qué hay que hacer…" />
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-2">
                                            <label className="text-[10px] font-black text-primary uppercase tracking-widest ml-1">Prioridad</label>
                                            <select value={newTask.priority} onChange={e => setNewTask({ ...newTask, priority: e.target.value })} className="w-full bg-[#1a1321] border border-variable rounded-2xl px-4 py-4 text-variable-main focus:outline-none text-sm">
                                                <option>Crítica</option>
                                                <option>Alta</option>
                                                <option>Media</option>
                                                <option>Baja</option>
                                            </select>
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-[10px] font-black text-primary uppercase tracking-widest ml-1">Estado</label>
                                            <select value={newTask.status} onChange={e => setNewTask({ ...newTask, status: e.target.value })} className="w-full bg-[#1a1321] border border-variable rounded-2xl px-4 py-4 text-variable-main focus:outline-none text-sm">
                                                <option value="pending">Pendiente</option>
                                                <option value="in_progress">En Curso</option>
                                                <option value="review">Revisión</option>
                                                <option value="done">Hecho</option>
                                            </select>
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black text-primary uppercase tracking-widest ml-1">Asignar a</label>
                                        <select value={newTask.assigned_to} onChange={e => setNewTask({ ...newTask, assigned_to: e.target.value })} className="w-full bg-[#1a1321] border border-variable rounded-2xl px-4 py-4 text-variable-main focus:outline-none text-sm">
                                            <option value="">Sin asignar</option>
                                            {users.map(u => (
                                                <option key={u.id} value={u.id}>{u.nombre} {u.apellido1}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black text-primary uppercase tracking-widest ml-1">Sprint (Opcional)</label>
                                        <select value={newTask.sprint_id} onChange={e => setNewTask({ ...newTask, sprint_id: e.target.value })} className="w-full bg-[#1a1321] border border-variable rounded-2xl px-4 py-4 text-variable-main focus:outline-none text-sm">
                                            <option value="">Backlog (Sin sprint)</option>
                                            {sprints.filter(s => s.status !== 'completed').map(s => (
                                                <option key={s.id} value={s.id}>{s.name} ({s.status === 'active' ? 'Activo' : 'En planificación'})</option>
                                            ))}
                                        </select>
                                    </div>
                                    <button disabled={formLoading} type="submit" className="w-full py-4 bg-primary text-white rounded-2xl font-bold shadow-xl shadow-primary/30 hover:brightness-110 transition-all">
                                        {formLoading ? 'Creando…' : 'Crear Tarea'}
                                    </button>
                                </form>
                            </motion.div>
                        </div>
                    )
                }

                {/* MODAL: NUEVA LÍNEA DE PRESUPUESTO */}
                {
                    budgetLineModal && (
                        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => { setBudgetLineModal(false); setIsCatalogMode(false); }} className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
                            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} className="relative w-full max-w-md glass rounded-[2.5rem] p-10 shadow-2xl overflow-visible">
                                <h2 className="text-2xl font-bold mb-2 text-variable-main text-center">Añadir al Presupuesto</h2>

                                {/* Selector de modo */}
                                <div className="flex bg-white/5 p-1 rounded-2xl mb-8 border border-variable">
                                    <button
                                        onClick={() => setIsCatalogMode(false)}
                                        className={`flex-1 py-2 text-xs font-bold rounded-xl transition-all ${!isCatalogMode ? 'bg-primary text-white shadow-lg' : 'text-variable-muted hover:text-variable-main'}`}
                                    >
                                        Línea Manual
                                    </button>
                                    <button
                                        onClick={() => setIsCatalogMode(true)}
                                        className={`flex-1 py-2 text-xs font-bold rounded-xl transition-all ${isCatalogMode ? 'bg-primary text-white shadow-lg' : 'text-variable-muted hover:text-variable-main'}`}
                                    >
                                        Catálogo de Servicios
                                    </button>
                                </div>

                                {!isCatalogMode ? (
                                    <form onSubmit={handleAddBudgetLine} className="space-y-6">
                                        <div className="space-y-2">
                                            <label className="text-[10px] font-black text-primary uppercase tracking-widest ml-1">Concepto / Descripción</label>
                                            <input required value={newBudgetLine.description} onChange={e => setNewBudgetLine({ ...newBudgetLine, description: e.target.value })} className="w-full bg-white/5 border border-variable rounded-2xl px-5 py-4 text-variable-main focus:outline-none focus:border-primary/50" placeholder="Ej: Diseño landing page extra" />
                                        </div>
                                        <div className="grid grid-cols-3 gap-4">
                                            <div className="space-y-2">
                                                <label className="text-[10px] font-black text-primary uppercase tracking-widest ml-1">Precio Unit. (€)</label>
                                                <input required type="number" step="0.01" min="0" value={newBudgetLine.unit_price} onChange={e => setNewBudgetLine({ ...newBudgetLine, unit_price: e.target.value })} className="w-full bg-white/5 border border-variable rounded-2xl px-4 py-4 text-variable-main focus:outline-none focus:border-primary/50 text-sm" placeholder="0.00" />
                                            </div>
                                            <div className="space-y-2">
                                                <label className="text-[10px] font-black text-primary uppercase tracking-widest ml-1">Cantidad</label>
                                                <input required type="number" min="1" value={newBudgetLine.quantity} onChange={e => setNewBudgetLine({ ...newBudgetLine, quantity: e.target.value })} className="w-full bg-white/5 border border-variable rounded-2xl px-4 py-4 text-variable-main focus:outline-none focus:border-primary/50 text-sm" />
                                            </div>
                                            <div className="space-y-2">
                                                <label className="text-[10px] font-black text-primary uppercase tracking-widest ml-1">IVA %</label>
                                                <input required type="number" step="0.5" min="0" max="100" value={newBudgetLine.iva_percent} onChange={e => setNewBudgetLine({ ...newBudgetLine, iva_percent: e.target.value })} className="w-full bg-white/5 border border-variable rounded-2xl px-4 py-4 text-variable-main focus:outline-none focus:border-primary/50 text-sm" />
                                            </div>
                                        </div>
                                        {/* Preview */}
                                        {newBudgetLine.unit_price && (
                                            <div className="p-4 rounded-2xl bg-primary/5 border border-primary/20 text-sm">
                                                <div className="flex justify-between text-variable-muted">
                                                    <span>Base:</span>
                                                    <span className="font-bold text-variable-main">€{((parseFloat(newBudgetLine.unit_price) || 0) * (parseInt(newBudgetLine.quantity) || 1)).toFixed(2)}</span>
                                                </div>
                                                <div className="flex justify-between text-variable-muted mt-1">
                                                    <span>IVA ({newBudgetLine.iva_percent}%):</span>
                                                    <span className="font-bold text-variable-main">€{(((parseFloat(newBudgetLine.unit_price) || 0) * (parseInt(newBudgetLine.quantity) || 1)) * ((parseFloat(newBudgetLine.iva_percent) || 0) / 100)).toFixed(2)}</span>
                                                </div>
                                                <div className="flex justify-between text-primary font-black mt-2 pt-2 border-t border-primary/20">
                                                    <span>Total:</span>
                                                    <span>€{(((parseFloat(newBudgetLine.unit_price) || 0) * (parseInt(newBudgetLine.quantity) || 1)) * (1 + (parseFloat(newBudgetLine.iva_percent) || 0) / 100)).toFixed(2)}</span>
                                                </div>
                                            </div>
                                        )}
                                        <button disabled={formLoading} type="submit" className="w-full py-4 bg-primary text-white rounded-2xl font-bold shadow-xl shadow-primary/30 hover:brightness-110 transition-all">
                                            {formLoading ? 'Guardando...' : 'Añadir Línea'}
                                        </button>
                                    </form>
                                ) : (
                                    <div className="space-y-6">
                                        <div className="space-y-2">
                                            <label className="text-[10px] font-black text-primary uppercase tracking-widest ml-1">Seleccionar Servicio</label>
                                            <div className="space-y-2 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                                                {catalogServices.map(service => {
                                                    const isAlreadyInProject = projectServices.some(ps => ps.service_id === service.id);
                                                    return (
                                                        <button
                                                            key={service.id}
                                                            disabled={isAlreadyInProject || formLoading}
                                                            onClick={() => handleAddCatalogService(service.id)}
                                                            className={`w-full flex items-center justify-between p-4 rounded-2xl border transition-all text-left ${isAlreadyInProject
                                                                ? 'bg-white/5 border-variable opacity-50 cursor-not-allowed'
                                                                : 'bg-white/5 border-variable hover:border-primary/50 hover:bg-primary/5'
                                                                }`}
                                                        >
                                                            <div>
                                                                <p className="text-sm font-bold text-variable-main">{service.name}</p>
                                                                <p className="text-[10px] text-variable-muted line-clamp-1">{service.description}</p>
                                                            </div>
                                                            <div className="text-right">
                                                                <p className="text-sm font-black text-primary">€{parseFloat(service.price).toFixed(2)}</p>
                                                                {isAlreadyInProject && <p className="text-[8px] font-black text-emerald-500 uppercase mt-1">En presupuesto</p>}
                                                            </div>
                                                        </button>
                                                    );
                                                })}
                                                {catalogServices.length === 0 && (
                                                    <p className="text-center text-xs text-variable-muted py-8">No hay servicios en el catálogo.</p>
                                                )}
                                            </div>
                                        </div>
                                        <button
                                            onClick={() => { setBudgetLineModal(false); setIsCatalogMode(false); }}
                                            className="w-full py-4 glass text-variable-muted rounded-2xl font-bold hover:text-variable-main transition-all text-sm"
                                        >
                                            Cerrar
                                        </button>
                                    </div>
                                )}
                            </motion.div>
                        </div>
                    )
                }

                {/* MODAL: CONFIRMAR NUEVO PRESUPUESTO (deniega el anterior) */}
                {
                    budgetConfirmModal && (
                        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
                            <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                className="absolute inset-0 bg-black/70 backdrop-blur-md"
                            />
                            <motion.div
                                initial={{ scale: 0.88, opacity: 0, y: 20 }}
                                animate={{ scale: 1, opacity: 1, y: 0 }}
                                exit={{ scale: 0.88, opacity: 0, y: 20 }}
                                transition={{ type: 'spring', damping: 20, stiffness: 260 }}
                                className="relative w-full max-w-sm glass rounded-[2.5rem] p-10 shadow-2xl border border-amber-500/20"
                            >
                                {/* Icono de advertencia */}
                                <div className="flex justify-center mb-6">
                                    <div className="size-16 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center">
                                        <FileText size={30} className="text-amber-500" />
                                    </div>
                                </div>

                                <h2 className="text-xl font-black text-variable-main text-center mb-2 tracking-tight">
                                    ¿Generar nuevo presupuesto?
                                </h2>
                                <p className="text-sm text-variable-muted text-center mb-2 leading-relaxed">
                                    Ya existe un presupuesto en estado{' '}
                                    <span className="font-bold text-amber-500">pendiente</span>:
                                </p>
                                {existingActiveBudget && (
                                    <div className="my-4 p-3 rounded-xl bg-amber-500/5 border border-amber-500/20 text-center">
                                        <p className="text-xs font-black text-amber-500 uppercase tracking-widest">
                                            {existingActiveBudget.budget_number}
                                        </p>
                                        <p className="text-xs text-variable-muted mt-1">
                                            €{parseFloat(existingActiveBudget.total || 0).toFixed(2)} •{' '}
                                            {new Date(existingActiveBudget.budget_date).toLocaleDateString('es-ES')}
                                        </p>
                                    </div>
                                )}
                                <p className="text-xs text-variable-muted text-center mb-8 leading-relaxed">
                                    Si continúas, el presupuesto anterior quedará marcado como{' '}
                                    <span className="font-bold text-rose-400">denegado</span> y se generará uno nuevo.
                                </p>

                                <div className="flex flex-col gap-3">
                                    <button
                                        onClick={handleConfirmNewBudget}
                                        disabled={invoiceLoading}
                                        className="w-full py-4 bg-primary text-white rounded-2xl font-bold shadow-xl shadow-primary/30 hover:brightness-110 transition-all"
                                    >
                                        {invoiceLoading ? 'Generando...' : 'Continuar'}
                                    </button>
                                    <button
                                        onClick={() => { setBudgetConfirmModal(false); setExistingActiveBudget(null); }}
                                        className="w-full py-4 glass text-variable-muted rounded-2xl font-bold hover:text-variable-main transition-all text-sm"
                                    >
                                        Cancelar
                                    </button>
                                </div>
                            </motion.div>
                        </div>
                    )
                }

                {/* MODAL: REGISTRAR COBRO */}
                {
                    paymentModal && (
                        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setPaymentModal(false)} className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
                            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} className="relative w-full max-w-md glass rounded-[2.5rem] p-10 shadow-2xl overflow-visible">
                                <h2 className="text-2xl font-bold mb-2 text-variable-main text-center">Registrar Cobro</h2>
                                <p className="text-xs text-variable-muted text-center mb-8 italic">Registra un pago recibido del cliente</p>
                                <form onSubmit={handleRegisterPayment} className="space-y-6">
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black text-emerald-500 uppercase tracking-widest ml-1">Importe (€)</label>
                                        <input
                                            required
                                            type="number"
                                            step="0.01"
                                            min="0.01"
                                            value={newPayment.amount}
                                            onChange={e => setNewPayment({ ...newPayment, amount: e.target.value })}
                                            className="w-full bg-white/5 border border-variable rounded-2xl px-5 py-4 text-variable-main text-xl font-bold focus:outline-none focus:border-emerald-500/50"
                                            placeholder="0.00"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black text-emerald-500 uppercase tracking-widest ml-1">Método de Pago</label>
                                        <div className="grid grid-cols-5 gap-2">
                                            {PAYMENT_METHODS.map(method => {
                                                const Icon = method.icon;
                                                const isSelected = newPayment.payment_method === method.value;
                                                return (
                                                    <button
                                                        type="button"
                                                        key={method.value}
                                                        onClick={() => setNewPayment({ ...newPayment, payment_method: method.value })}
                                                        className={`flex flex-col items-center gap-1.5 p-3 rounded-2xl border transition-all ${isSelected
                                                            ? 'bg-emerald-500/10 border-emerald-500/40 scale-105 shadow-lg shadow-emerald-500/10'
                                                            : 'bg-white/5 border-variable hover:bg-white/10'
                                                            }`}
                                                    >
                                                        <Icon size={18} className={isSelected ? 'text-emerald-500' : 'text-variable-muted'} />
                                                        <span className={`text-[8px] font-black uppercase tracking-wider ${isSelected ? 'text-emerald-500' : 'text-variable-muted'}`}>{method.label}</span>
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black text-emerald-500 uppercase tracking-widest ml-1">Notas (opcional)</label>
                                        <textarea
                                            value={newPayment.notes}
                                            onChange={e => setNewPayment({ ...newPayment, notes: e.target.value })}
                                            className="w-full bg-white/5 border border-variable rounded-2xl px-5 py-4 text-variable-main focus:outline-none focus:border-emerald-500/50 text-sm resize-none"
                                            rows={2}
                                            placeholder="Ej: Pago parcial primer mes..."
                                        />
                                    </div>
                                    {/* Preview */}
                                    {newPayment.amount && parseFloat(newPayment.amount) > 0 && (
                                        <div className="p-4 rounded-2xl bg-emerald-500/5 border border-emerald-500/20 text-sm space-y-2">
                                            <div className="flex justify-between text-variable-muted">
                                                <span>Importe del cobro:</span>
                                                <span className="font-bold text-emerald-500">€{parseFloat(newPayment.amount).toFixed(2)}</span>
                                            </div>
                                            <div className="flex justify-between text-variable-muted">
                                                <span>Ya cobrado anteriormente:</span>
                                                <span className="font-bold text-variable-main">€{totalPaid.toFixed(2)}</span>
                                            </div>
                                            <div className={`flex justify-between font-black pt-2 border-t border-emerald-500/20 ${(pendingBalance - parseFloat(newPayment.amount)) <= 0 ? 'text-emerald-500' : 'text-amber-500'}`}>
                                                <span>{(pendingBalance - parseFloat(newPayment.amount)) <= 0 ? '✓ Pagado Completo' : 'Quedará pendiente:'}</span>
                                                <span>€{Math.max(0, pendingBalance - parseFloat(newPayment.amount)).toFixed(2)}</span>
                                            </div>
                                        </div>
                                    )}
                                    <button disabled={formLoading} type="submit" className="w-full py-4 bg-emerald-500 text-white rounded-2xl font-bold shadow-xl shadow-emerald-500/30 hover:brightness-110 transition-all">
                                        {formLoading ? 'Registrando...' : 'Registrar Cobro'}
                                    </button>
                                </form>
                            </motion.div>
                        </div>
                    )
                }
                {/* MODAL: VER TAREAS DEL SPRINT */}
                {
                    viewSprintModal && (
                        <div className="fixed inset-0 z-[250] flex items-center justify-center p-4">
                            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setViewSprintModal(false)} className="absolute inset-0 bg-black/60 backdrop-blur-md" />
                            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} className="relative w-full max-w-2xl glass rounded-[2.5rem] p-8 shadow-2xl overflow-visible max-h-[90vh] flex flex-col">
                                <h2 className="text-2xl font-black text-variable-main mb-6 flex items-center gap-2">
                                    <Zap size={24} className="text-primary" />
                                    Tareas: {selectedSprintId === 'backlog' ? '📦 Backlog' : sprints.find(s => s.id === selectedSprintId)?.name}
                                </h2>

                                <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar space-y-3">
                                    {(() => {
                                        const modalTasks = selectedSprintId === 'backlog'
                                            ? tasks.filter(t => t.status === 'done' && !t.sprint_id)
                                            : tasks.filter(t => t.sprint_id === selectedSprintId);
                                        return modalTasks.length === 0 ? (
                                            <div className="py-20 text-center">
                                                <Package size={40} className="mx-auto text-variable-muted opacity-20 mb-4" />
                                                <p className="text-variable-muted italic">No hay tareas asociadas.</p>
                                            </div>
                                        ) : (
                                            modalTasks.map(task => {
                                                const st = getTaskStyle(task.status);
                                                return (
                                                    <div key={task.id} className="p-4 rounded-2xl bg-white/5 border border-variable flex items-center justify-between gap-4">
                                                        <div className="flex-1 min-w-0">
                                                            <p className="font-bold text-sm text-variable-main truncate">{task.title}</p>
                                                            <p className="text-[10px] text-variable-muted mt-0.5 line-clamp-1">{task.description || 'Sin descripción'}</p>
                                                        </div>
                                                        <div className="flex items-center gap-2">
                                                            <span className={`text-[9px] font-bold px-2 py-0.5 rounded-md border ${st.bg} ${st.color}`}>
                                                                {st.label}
                                                            </span>
                                                            <span className={`text-[9px] font-black px-2 py-0.5 rounded-md border ${task.priority === 'Crítica' ? 'bg-red-500/10 text-red-500 border-red-500/20' : 'bg-white/5 text-variable-muted border-variable'}`}>
                                                                {task.priority}
                                                            </span>
                                                        </div>
                                                    </div>
                                                );
                                            })
                                        );
                                    })()}
                                </div>

                                <button onClick={() => setViewSprintModal(false)} className="mt-8 w-full py-4 glass text-variable-muted rounded-2xl font-bold hover:text-variable-main transition-all text-sm">
                                    Cerrar Ventana
                                </button>
                            </motion.div>
                        </div>
                    )
                }
            </AnimatePresence >
        </div >
    );
}


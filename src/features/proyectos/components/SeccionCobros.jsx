import { motion } from 'framer-motion';
import {
    Banknote, ChevronUp, ChevronDown, Plus, Receipt,
    TrendingUp, TrendingDown, Download,
} from 'lucide-react';

/**
 * Sección de Cobros / Pagos de la ficha de proyecto.
 *
 * JSX extraído tal cual de ProjectDetail.jsx (fase 4d). El estado y los
 * handlers siguen en el padre: esto solo pinta. Así la extracción no puede
 * cambiar el comportamiento — y cualquier variable que faltase por pasar la
 * caza `no-undef` en este fichero, no el navegador.
 */
export default function SeccionCobros({
    invoices,
    payments,
    totalInvoiced,
    totalPaid,
    pendingBalance,
    paidPercent,
    expanded,
    onToggle,
    onRegistrar,
    getPaymentMethodInfo,
    onDescargarRecibo,
}) {
    if (invoices.length === 0) return null;

    return (
        <section className="mt-10">
            <div className="glass rounded-[2.5rem] p-8 sm:p-10">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8">
                    <button onClick={onToggle} className="flex items-center gap-3 group">
                        <div className="p-3 bg-emerald-500/10 rounded-2xl text-emerald-500">
                            <Banknote size={22} />
                        </div>
                        <div>
                            <h3 className="text-xl font-bold text-variable-main flex items-center gap-2">
                                Cobros / Pagos
                                {expanded ? <ChevronUp size={18} className="text-variable-muted" /> : <ChevronDown size={18} className="text-variable-muted" />}
                            </h3>
                            <p className="text-xs text-variable-muted italic">Registro de pagos recibidos del cliente</p>
                        </div>
                    </button>
                    <button
                        onClick={onRegistrar}
                        className="flex items-center gap-2 px-5 py-2.5 bg-emerald-500 text-white rounded-xl text-xs font-bold hover:brightness-110 transition-all shadow-lg shadow-emerald-500/20"
                    >
                        <Plus size={14} /> Registrar Cobro
                    </button>
                </div>

                {expanded && (
                    <div className="space-y-6">
                        {/* Balance Cards */}
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                            <div className="p-5 rounded-2xl bg-primary/5 border border-primary/20">
                                <div className="flex items-center gap-2 mb-2">
                                    <Receipt size={16} className="text-primary" />
                                    <p className="text-[10px] font-black uppercase tracking-widest text-primary">Total Facturado</p>
                                </div>
                                <p className="text-2xl font-black text-variable-main">€{totalInvoiced.toFixed(2)}</p>
                                <p className="text-[9px] text-variable-muted mt-1">{invoices.length} factura{invoices.length !== 1 ? 's' : ''} emitida{invoices.length !== 1 ? 's' : ''}</p>
                            </div>
                            <div className="p-5 rounded-2xl bg-emerald-500/5 border border-emerald-500/20">
                                <div className="flex items-center gap-2 mb-2">
                                    <TrendingUp size={16} className="text-emerald-500" />
                                    <p className="text-[10px] font-black uppercase tracking-widest text-emerald-500">Total Cobrado</p>
                                </div>
                                <p className="text-2xl font-black text-variable-main">€{totalPaid.toFixed(2)}</p>
                                <p className="text-[9px] text-variable-muted mt-1">{payments.length} pago{payments.length !== 1 ? 's' : ''} registrado{payments.length !== 1 ? 's' : ''}</p>
                            </div>
                            <div className={`p-5 rounded-2xl border ${pendingBalance <= 0 ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-amber-500/5 border-amber-500/20'}`}>
                                <div className="flex items-center gap-2 mb-2">
                                    <TrendingDown size={16} className={pendingBalance <= 0 ? 'text-emerald-500' : 'text-amber-500'} />
                                    <p className={`text-[10px] font-black uppercase tracking-widest ${pendingBalance <= 0 ? 'text-emerald-500' : 'text-amber-500'}`}>
                                        {pendingBalance <= 0 ? 'Pagado Completo' : 'Pendiente de Cobro'}
                                    </p>
                                </div>
                                <p className={`text-2xl font-black ${pendingBalance <= 0 ? 'text-emerald-500' : 'text-variable-main'}`}>
                                    {pendingBalance <= 0 ? '✓ €0.00' : `€${pendingBalance.toFixed(2)}`}
                                </p>
                                <p className="text-[9px] text-variable-muted mt-1">{Math.round(paidPercent)}% del total facturado</p>
                            </div>
                        </div>

                        {/* Progress bar */}
                        <div className="space-y-2">
                            <div className="flex justify-between text-xs font-bold">
                                <span className="text-variable-muted uppercase tracking-widest">Progreso de Cobro</span>
                                <span className="text-emerald-500">{Math.round(paidPercent)}%</span>
                            </div>
                            <div className="h-3 bg-white/5 border border-variable rounded-full overflow-hidden">
                                <motion.div
                                    initial={{ width: 0 }}
                                    animate={{ width: `${paidPercent}%` }}
                                    transition={{ duration: 1.2, ease: 'easeOut' }}
                                    className={`h-full rounded-full ${paidPercent >= 100 ? 'bg-emerald-500' : 'bg-gradient-to-r from-emerald-500 to-emerald-400'}`}
                                />
                            </div>
                        </div>

                        {/* Payment History */}
                        {payments.length === 0 ? (
                            <div className="py-12 text-center border-2 border-dashed border-variable rounded-3xl">
                                <Banknote size={32} className="mx-auto text-variable-muted mb-3 opacity-50" />
                                <p className="text-sm text-variable-muted">No hay pagos registrados aún.</p>
                                <p className="text-xs text-variable-muted italic mt-1">Registra el primer cobro para empezar a controlar el balance.</p>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                <p className="text-[10px] font-black text-variable-muted uppercase tracking-widest">Historial de Cobros ({payments.length})</p>
                                {payments.map((pay) => {
                                    const methodInfo = getPaymentMethodInfo(pay.payment_method);
                                    const MethodIcon = methodInfo.icon;
                                    return (
                                        <div key={pay.id} onClick={() => onDescargarRecibo(pay.id)} className="flex items-center gap-4 p-4 rounded-2xl bg-white/5 border border-variable hover:bg-white/[0.08] cursor-pointer transition-all group">
                                            <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                                                <MethodIcon size={18} className={methodInfo.color} />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2">
                                                    <p className="text-sm font-bold text-variable-main">{pay.payment_number}</p>
                                                    <span className={`text-[8px] font-black px-2 py-0.5 rounded-md uppercase ${methodInfo.color} bg-white/5 border border-current/10`}>
                                                        {methodInfo.label}
                                                    </span>
                                                </div>
                                                <div className="flex items-center gap-3 mt-1">
                                                    <span className="text-[9px] text-variable-muted font-bold">
                                                        {new Date(pay.payment_date).toLocaleDateString('es-ES')}
                                                    </span>
                                                    {pay.notes && (
                                                        <span className="text-[9px] text-variable-muted italic truncate">
                                                            {pay.notes}
                                                        </span>
                                                    )}
                                                    {pay.created_by_user && (
                                                        <span className="text-[8px] text-variable-muted italic">
                                                            por {pay.created_by_user.nombre}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                            <span className="text-lg font-black text-emerald-500">€{parseFloat(pay.amount).toFixed(2)}</span>
                                            <div className="p-2 bg-emerald-500/10 text-emerald-500 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity" title="Descargar Recibo">
                                                <Download size={14} />
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </section>
    );
}

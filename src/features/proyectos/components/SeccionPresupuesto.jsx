import { motion, AnimatePresence } from 'framer-motion';
import {
    Receipt, ChevronUp, ChevronDown, AlertTriangle, FileText, Plus,
    Briefcase, DollarSign, CheckCircle2, X, Edit3, Trash2, Download,
} from 'lucide-react';

/**
 * Sección Presupuesto / Servicios de la ficha de proyecto.
 *
 * JSX extraído tal cual de ProjectDetail.jsx (fase 4d). El estado y los
 * handlers siguen en el padre: esto solo pinta.
 */
export default function SeccionPresupuesto({
    expanded,
    onToggle,
    hasPendingBudget,
    onGenerarPdf,
    onAnadirConcepto,
    invoiceLoading,
    uninvoicedLines,
    onFacturar,
    allBudgetLines,
    editingLineId,
    tempLine,
    setTempLine,
    onGuardarLinea,
    onCancelarEdicion,
    onEditarLinea,
    onQuitarServicio,
    onBorrarLinea,
    invoices,
    invoicesExpanded,
    onToggleInvoices,
    onDescargarFactura,
    budgetSubtotal,
    budgetIVA,
    budgetTotal,
    uninvoicedTotal,
}) {
    return (
        <section className="mt-10">
            <div className="glass rounded-[2.5rem] p-8 sm:p-10">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8">
                    <button onClick={onToggle} className="flex items-center gap-3 group">
                        <div className="p-3 bg-primary/10 rounded-2xl text-primary">
                            <Receipt size={22} />
                        </div>
                        <div>
                            <h3 className="text-xl font-bold text-variable-main flex items-center gap-2">
                                Presupuesto / Servicios
                                {expanded ? <ChevronUp size={18} className="text-variable-muted" /> : <ChevronDown size={18} className="text-variable-muted" />}
                            </h3>
                            <p className="text-xs text-variable-muted italic">Líneas de servicio contratadas y extras manuales</p>
                        </div>
                    </button>
                    <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                        {hasPendingBudget && (
                            <div className="hidden lg:flex items-center gap-2 px-4 py-2 bg-amber-500/10 border border-amber-500/20 rounded-xl text-[10px] text-amber-500 font-bold uppercase tracking-wider animate-pulse">
                                <AlertTriangle size={12} /> Presupuesto Pendiente (Edición Bloqueada)
                            </div>
                        )}
                        <button onClick={onGenerarPdf} className="flex items-center gap-2 px-4 py-2.5 glass text-variable-muted rounded-xl text-xs font-bold hover:text-primary transition-all">
                            <FileText size={14} /> Presupuesto PDF
                        </button>
                        <button
                            onClick={onAnadirConcepto}
                            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all ${hasPendingBudget ? 'bg-variable/10 text-variable-muted cursor-not-allowed' : 'bg-primary/10 text-primary hover:bg-primary/20'}`}
                        >
                            <Plus size={14} /> Añadir Concepto
                        </button>
                        <button disabled={invoiceLoading || (uninvoicedLines.length === 0 && !hasPendingBudget)} onClick={onFacturar} className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all shadow-lg shadow-primary/20 ${uninvoicedLines.length === 0 && !hasPendingBudget ? 'bg-variable text-variable-muted cursor-not-allowed opacity-50' : 'bg-primary text-white hover:brightness-110'}`}>
                            <Receipt size={14} /> {invoiceLoading ? 'Generando...' : (hasPendingBudget ? 'Confirmar y Facturar' : (uninvoicedLines.length === 0 ? 'Todo Facturado' : `Facturar (${uninvoicedLines.length} líneas)`))}
                        </button>
                    </div>
                </div>

                {expanded && (
                    <div className="space-y-4 max-h-[500px] overflow-y-auto pr-2 custom-scrollbar">
                        {/* Header de la tabla */}
                        <div className="hidden sm:grid grid-cols-12 gap-4 px-5 py-3 text-[10px] font-black uppercase tracking-widest text-variable-muted">
                            <div className="col-span-5">Concepto</div>
                            <div className="col-span-1 text-right">Cant.</div>
                            <div className="col-span-2 text-right">Precio Unit.</div>
                            <div className="col-span-1 text-right">IVA %</div>
                            <div className="col-span-2 text-right">Total</div>
                            <div className="col-span-1"></div>
                        </div>

                        {allBudgetLines.length === 0 && (
                            <div className="py-12 text-center border-2 border-dashed border-variable rounded-3xl">
                                <Receipt size={32} className="mx-auto text-variable-muted mb-3 opacity-50" />
                                <p className="text-sm text-variable-muted">No hay líneas de presupuesto.</p>
                                <p className="text-xs text-variable-muted italic mt-1">Añade servicios al crear el proyecto o agrega líneas manuales.</p>
                            </div>
                        )}

                        {/* Todas las líneas — con badge de estado */}
                        {allBudgetLines.map((line) => {
                            const isEditing = editingLineId === line.id;
                            return (
                                <div key={`${line.isService ? 'svc' : 'man'}-${line.id}`} className={`grid grid-cols-1 sm:grid-cols-12 gap-2 sm:gap-4 items-center px-5 py-4 rounded-2xl border transition-colors ${line.invoiced ? 'bg-emerald-500/5 border-emerald-500/20 opacity-70' : isEditing ? 'bg-primary/5 border-primary/50' : 'bg-white/5 border-variable hover:bg-white/[0.08]'}`}>
                                    <div className="sm:col-span-5 flex items-center gap-3">
                                        <div className={`size-8 rounded-lg flex items-center justify-center flex-shrink-0 ${line.isService ? 'bg-primary/10' : 'bg-emerald-500/10'}`}>
                                            {line.isService ? <Briefcase size={14} className="text-primary" /> : <DollarSign size={14} className="text-emerald-500" />}
                                        </div>
                                        <div>
                                            <p className="text-sm font-bold text-variable-main">{line.description}</p>
                                            <div className="flex items-center gap-2">
                                                <p className={`text-[9px] font-bold uppercase tracking-widest ${line.isService ? 'text-primary' : 'text-emerald-500'}`}>
                                                    {line.isService ? 'Servicio contratado' : 'Línea manual'}
                                                </p>
                                                {line.invoiced && (
                                                    <span className="text-[8px] font-black bg-emerald-500/20 text-emerald-600 px-2 py-0.5 rounded-md uppercase">Facturada ✓</span>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="sm:col-span-1 text-right">
                                        {isEditing ? (
                                            <input type="number" value={tempLine.quantity} onChange={e => setTempLine({ ...tempLine, quantity: e.target.value })} className="w-full bg-white/10 border border-primary/30 rounded-lg px-2 py-1 text-xs text-variable-main focus:outline-none focus:border-primary" />
                                        ) : (
                                            <span className="text-xs text-variable-muted font-bold">{line.quantity || 1}</span>
                                        )}
                                    </div>
                                    <div className="sm:col-span-2 text-right">
                                        {isEditing ? (
                                            <div className="relative">
                                                <span className="absolute left-1 top-1/2 -translate-y-1/2 text-[10px] text-variable-muted">€</span>
                                                <input type="number" step="0.01" value={tempLine.unit_price} onChange={e => setTempLine({ ...tempLine, unit_price: e.target.value })} className="w-full bg-white/10 border border-primary/30 rounded-lg pl-4 pr-1 py-1 text-xs text-variable-main focus:outline-none focus:border-primary" />
                                            </div>
                                        ) : (
                                            <span className="text-xs text-variable-main font-bold">€{parseFloat(line.unit_price || 0).toFixed(2)}</span>
                                        )}
                                    </div>
                                    <div className="sm:col-span-1 text-right">
                                        {isEditing ? (
                                            <input type="number" value={tempLine.iva_percent} onChange={e => setTempLine({ ...tempLine, iva_percent: e.target.value })} className="w-full bg-white/10 border border-primary/30 rounded-lg px-2 py-1 text-xs text-variable-main focus:outline-none focus:border-primary" />
                                        ) : (
                                            <span className="text-xs text-variable-muted font-bold">{line.iva_percent}%</span>
                                        )}
                                    </div>
                                    <div className="sm:col-span-2 text-right text-sm font-black text-variable-main">€{line.total.toFixed(2)}</div>
                                    <div className="sm:col-span-1 flex justify-end gap-2">
                                        {!line.invoiced && (
                                            isEditing ? (
                                                <>
                                                    <button onClick={() => onGuardarLinea(line.id, line.isService)} className="p-1.5 text-emerald-500 hover:bg-emerald-500/10 transition-colors rounded-lg" title="Guardar">
                                                        <CheckCircle2 size={16} />
                                                    </button>
                                                    <button onClick={onCancelarEdicion} className="p-1.5 text-rose-500 hover:bg-rose-500/10 transition-colors rounded-lg" title="Cancelar">
                                                        <X size={16} />
                                                    </button>
                                                </>
                                            ) : (
                                                <>
                                                    <button onClick={() => onEditarLinea(line)} className="p-1.5 text-variable-muted hover:text-primary transition-colors rounded-lg hover:bg-primary/10" title="Editar">
                                                        <Edit3 size={14} />
                                                    </button>
                                                    <button onClick={() => line.isService ? onQuitarServicio(line.id) : onBorrarLinea(line.id)} className="p-1.5 text-variable-muted hover:text-rose-500 transition-colors rounded-lg hover:bg-rose-500/10" title="Eliminar">
                                                        <Trash2 size={14} />
                                                    </button>
                                                </>
                                            )
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}

                {/* Facturas anteriores — Ahora como desplegable opcional */}
                {invoices.length > 0 && (
                    <div className="mt-6 pt-6 border-t border-variable">
                        <button
                            onClick={onToggleInvoices}
                            className="flex items-center justify-between w-full group"
                        >
                            <p className="text-[10px] font-black text-variable-muted uppercase tracking-widest flex items-center gap-2 group-hover:text-primary transition-colors text-left sm:text-center">
                                <Receipt size={12} /> Facturas Emitidas ({invoices.length})
                                {invoicesExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                            </p>
                            {!invoicesExpanded && (
                                <span className="text-[10px] font-bold text-primary px-3 py-1 bg-primary/5 rounded-lg border border-primary/20">Ver historial</span>
                            )}
                        </button>

                        <AnimatePresence>
                            {invoicesExpanded && (
                                <motion.div
                                    initial={{ height: 0, opacity: 0 }}
                                    animate={{ height: 'auto', opacity: 1 }}
                                    exit={{ height: 0, opacity: 0 }}
                                    className="overflow-hidden mt-4"
                                >
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pb-2 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                                        {invoices.map(inv => (
                                            <div key={inv.id} onClick={() => onDescargarFactura(inv.id)} className="flex items-center gap-4 p-4 rounded-2xl bg-white/5 border border-variable hover:border-primary/30 hover:bg-primary/5 cursor-pointer transition-all group">
                                                <div className="p-2.5 bg-primary/10 rounded-xl text-primary group-hover:scale-110 transition-transform"><Receipt size={18} /></div>
                                                <div className="flex-1">
                                                    <p className="text-sm font-bold text-variable-main">{inv.numero}</p>
                                                    <p className="text-[9px] text-variable-muted font-bold">{new Date(inv.fecha_emision).toLocaleDateString('es-ES')} • {inv.factura_lineas?.length || 0} líneas</p>
                                                </div>
                                                <div className="text-right flex flex-col items-end gap-1">
                                                    <span className="text-sm font-black text-primary">€{parseFloat(inv.total).toFixed(2)}</span>
                                                    <Download size={12} className="text-variable-muted group-hover:text-primary" />
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>
                )}

                {/* Totales */}
                {allBudgetLines.length > 0 && (
                    <div className="mt-6 pt-6 border-t border-variable">
                        <div className="flex flex-col items-end gap-2">
                            <div className="flex justify-between w-full sm:w-80 text-sm">
                                <span className="text-variable-muted font-bold">Total General (Base)</span>
                                <span className="text-variable-main font-bold">€{budgetSubtotal.toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between w-full sm:w-80 text-sm">
                                <span className="text-variable-muted font-bold">IVA Total</span>
                                <span className="text-variable-main font-bold">€{budgetIVA.toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between w-full sm:w-80 text-lg pt-2 border-t border-variable">
                                <span className="text-primary font-black uppercase tracking-widest text-sm">Total</span>
                                <span className="text-primary font-black">€{budgetTotal.toFixed(2)}</span>
                            </div>
                            {uninvoicedLines.length > 0 && uninvoicedLines.length < allBudgetLines.length && (
                                <div className="flex justify-between w-full sm:w-80 text-sm mt-3 pt-3 border-t border-dashed border-amber-500/30">
                                    <span className="text-amber-500 font-bold text-xs uppercase">Pendiente de facturar</span>
                                    <span className="text-amber-500 font-black">€{uninvoicedTotal.toFixed(2)}</span>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </section>
    );
}

import { motion } from 'framer-motion';

// Modal extraído de ProjectDetail.jsx (remate de la fase 4d). El JSX se movió
// VERBATIM y los props conservan los nombres que tenían en el padre: cero
// renombrados en el cuerpo, cero oportunidades de romperlo. Solo pinta.
export default function ModalNuevaLinea({
    budgetLineModal,
    setBudgetLineModal,
    isCatalogMode,
    setIsCatalogMode,
    handleAddBudgetLine,
    newBudgetLine,
    setNewBudgetLine,
    formLoading,
    catalogServices,
    projectServices,
    handleAddCatalogService,
}) {
    return (
        <>
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
        </>
    );
}

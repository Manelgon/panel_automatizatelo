import { motion } from 'framer-motion';
import { FileText } from 'lucide-react';

// Modal extraído de ProjectDetail.jsx (remate de la fase 4d). El JSX se movió
// VERBATIM y los props conservan los nombres que tenían en el padre: cero
// renombrados en el cuerpo, cero oportunidades de romperlo. Solo pinta.
export default function ModalConfirmarPresupuesto({
    budgetConfirmModal,
    setBudgetConfirmModal,
    existingActiveBudget,
    setExistingActiveBudget,
    invoiceLoading,
    handleConfirmNewBudget,
}) {
    return (
        <>
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
        </>
    );
}

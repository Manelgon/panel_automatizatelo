import { motion } from 'framer-motion';

// Modal extraído de ProjectDetail.jsx (remate de la fase 4d). El JSX se movió
// VERBATIM y los props conservan los nombres que tenían en el padre: cero
// renombrados en el cuerpo, cero oportunidades de romperlo. Solo pinta.
export default function ModalRegistrarCobro({
    paymentModal,
    setPaymentModal,
    handleRegisterPayment,
    newPayment,
    setNewPayment,
    formLoading,
    PAYMENT_METHODS,
    totalPaid,
    pendingBalance,
}) {
    return (
        <>
                {/* MODAL: REGISTRAR COBRO */}
                {
                    paymentModal && (
                        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
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
        </>
    );
}

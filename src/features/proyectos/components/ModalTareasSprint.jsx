import { motion } from 'framer-motion';
import { Zap, Package } from 'lucide-react';

// Modal extraído de ProjectDetail.jsx (remate de la fase 4d). El JSX se movió
// VERBATIM y los props conservan los nombres que tenían en el padre: cero
// renombrados en el cuerpo, cero oportunidades de romperlo. Solo pinta.
export default function ModalTareasSprint({
    viewSprintModal,
    setViewSprintModal,
    selectedSprintId,
    sprints,
    tasks,
    getTaskStyle,
}) {
    return (
        <>
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
        </>
    );
}

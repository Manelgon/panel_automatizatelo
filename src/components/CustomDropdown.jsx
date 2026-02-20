import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, CheckCircle2, X } from 'lucide-react';

/**
 * CustomDropdown — Reusable dropdown with white bg, orange borders,
 * orange hover with white text. Supports single-select and multi-select.
 *
 * Props:
 *  ── Common ──
 *  - placeholder    : string
 *  - icon           : Lucide icon component for the trigger
 *  - className      : extra wrapper classes
 *  - onOtherClose   : callback to close other dropdowns when this opens
 *
 *  ── Single-select mode (default) ──
 *  - value          : current value
 *  - onChange        : callback(value)
 *  - options         : [{ value, label, secondary? }]
 *
 *  ── Multi-select mode ──
 *  - multiple        : true
 *  - selected        : array of selected values
 *  - onToggle        : callback(value) to toggle one item
 *  - options         : [{ value, label, secondary?, secondaryColor?, right? }]
 *  - maxChips        : max chips to show (default 2)
 */
export default function CustomDropdown({
    // common
    placeholder = 'Seleccionar...',
    options = [],
    icon: Icon,
    className = '',
    onOtherClose,
    // single-select
    value,
    onChange,
    // multi-select
    multiple = false,
    selected = [],
    onToggle,
    maxChips = 2,
}) {
    const [open, setOpen] = useState(false);
    const ref = useRef(null);

    // Close on outside click
    useEffect(() => {
        const handler = (e) => {
            if (ref.current && !ref.current.contains(e.target)) setOpen(false);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    const handleOpen = () => {
        if (!open && onOtherClose) onOtherClose();
        setOpen(v => !v);
    };

    // ── Trigger label ──
    let triggerLabel;
    if (multiple) {
        triggerLabel = selected.length === 0
            ? placeholder
            : `${selected.length} seleccionado(s)`;
    } else {
        const found = options.find(o => o.value === value);
        triggerLabel = found ? found.label : placeholder;
    }

    const isPlaceholder = multiple ? selected.length === 0 : !value;

    // ── Selected chips (multi only) ──
    const selectedOptions = multiple
        ? options.filter(o => selected.includes(o.value))
        : [];

    return (
        <div ref={ref} className={`relative ${className}`}>
            {/* ── Trigger ── */}
            <button
                type="button"
                onClick={handleOpen}
                className="w-full flex items-center gap-2 bg-white/5 border-2 border-primary/30 rounded-2xl px-4 py-3 text-sm transition-all hover:border-primary/60 focus:outline-none focus:border-primary"
                style={{
                    borderColor: open ? 'var(--primary)' : undefined,
                    boxShadow: open ? '0 0 0 3px rgba(243,121,27,0.12)' : 'none',
                }}
            >
                {Icon && <Icon size={18} className="text-variable-muted shrink-0" />}
                <span className={`flex-1 text-left truncate ${isPlaceholder ? 'text-variable-muted' : 'text-variable-main'}`}>
                    {triggerLabel}
                </span>
                <ChevronDown
                    size={16}
                    className={`text-primary shrink-0 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
                />
            </button>

            {/* ── Dropdown panel ── */}
            {open && (
                <div className="absolute z-[100] mt-2 w-full bg-white border-2 border-primary/30 rounded-2xl shadow-2xl max-h-52 overflow-y-auto custom-scrollbar">
                    {options.length === 0 && (
                        <p className="text-[10px] text-gray-400 italic text-center py-4">Sin opciones disponibles</p>
                    )}
                    {options.map(opt => {
                        const isActive = multiple
                            ? selected.includes(opt.value)
                            : opt.value === value;

                        return (
                            <div
                                key={opt.value}
                                onClick={() => {
                                    if (multiple) {
                                        onToggle?.(opt.value);
                                    } else {
                                        onChange?.(opt.value);
                                        setOpen(false);
                                    }
                                }}
                                className={`group flex items-center justify-between px-4 py-3 cursor-pointer transition-colors hover:bg-primary ${isActive ? 'bg-primary/10' : ''}`}
                            >
                                <div className="flex items-center gap-3">
                                    {multiple && (
                                        <div className={`size-5 rounded-md border-2 flex items-center justify-center transition-all ${isActive ? 'bg-primary border-primary' : 'border-gray-300 group-hover:border-white/50'}`}>
                                            {isActive && <CheckCircle2 size={12} className="text-white" />}
                                        </div>
                                    )}
                                    <div className="flex flex-col">
                                        <span className="text-xs font-bold text-gray-800 group-hover:text-white">{opt.label}</span>
                                        {opt.secondary && (
                                            <span className={`text-[8px] uppercase font-black tracking-widest group-hover:text-white/70 ${opt.secondaryColor || 'text-gray-400'}`}>
                                                {opt.secondary}
                                            </span>
                                        )}
                                    </div>
                                </div>
                                {opt.right && (
                                    <span className="text-[10px] text-gray-500 font-bold group-hover:text-white/80">{opt.right}</span>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}

            {/* ── Selected chips (multi-select) ── */}
            {multiple && selectedOptions.length > 0 && (
                <div className="flex flex-wrap items-center gap-2 mt-2">
                    {selectedOptions.slice(0, maxChips).map(opt => (
                        <span key={opt.value} className="inline-flex items-center gap-1.5 bg-primary/15 text-primary text-[10px] font-bold px-3 py-1.5 rounded-full">
                            {opt.label}
                            <X size={10} className="cursor-pointer hover:text-red-400 transition-colors" onClick={() => onToggle?.(opt.value)} />
                        </span>
                    ))}
                    {selectedOptions.length > maxChips && (
                        <span className="text-[10px] text-variable-muted font-bold bg-white/10 px-2.5 py-1.5 rounded-full">
                            +{selectedOptions.length - maxChips} más
                        </span>
                    )}
                </div>
            )}
        </div>
    );
}

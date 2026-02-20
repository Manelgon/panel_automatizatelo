import React, { createContext, useContext, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import logo from '../assets/logo.png';

const LoadingContext = createContext();

export const useGlobalLoading = () => useContext(LoadingContext);

export function LoadingProvider({ children }) {
    const [isLoading, setIsLoading] = useState(false);
    const [loadingMessage, setLoadingMessage] = useState('');

    const showLoading = useCallback((message = '') => {
        setLoadingMessage(message);
        setIsLoading(true);
    }, []);

    const hideLoading = useCallback(() => {
        setIsLoading(false);
        setLoadingMessage('');
    }, []);

    // Helper: wraps any async function with loading state
    const withLoading = useCallback(async (fn, message = '') => {
        showLoading(message);
        try {
            return await fn();
        } finally {
            hideLoading();
        }
    }, [showLoading, hideLoading]);

    return (
        <LoadingContext.Provider value={{ isLoading, showLoading, hideLoading, withLoading }}>
            {children}

            {/* ─── Global Loading Overlay ─── */}
            <AnimatePresence>
                {isLoading && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="fixed inset-0 z-[9999] flex items-center justify-center"
                        style={{ pointerEvents: 'all' }}
                    >
                        {/* Backdrop */}
                        <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />

                        {/* Centered content */}
                        <motion.div
                            initial={{ scale: 0.85, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.85, opacity: 0 }}
                            transition={{ type: 'spring', stiffness: 300, damping: 25 }}
                            className="relative flex flex-col items-center gap-6"
                        >
                            {/* Logo with pulse */}
                            <div className="relative">
                                <div className="absolute inset-0 rounded-3xl bg-primary/30 animate-ping" style={{ animationDuration: '1.5s' }} />
                                <div className="relative size-20 rounded-3xl bg-white/5 glass border border-primary/30 flex items-center justify-center p-3 shadow-2xl shadow-primary/20">
                                    <img src={logo} alt="Loading" className="w-full h-full object-contain" />
                                </div>
                            </div>

                            {/* Spinner ring */}
                            <div className="relative size-10">
                                <div className="absolute inset-0 border-[3px] border-primary/15 rounded-full" />
                                <div className="absolute inset-0 border-[3px] border-transparent border-t-primary rounded-full animate-spin" />
                            </div>

                            {/* Message */}
                            {loadingMessage && (
                                <motion.p
                                    initial={{ opacity: 0, y: 8 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    className="text-sm font-bold text-white/80 tracking-wide text-center max-w-xs"
                                >
                                    {loadingMessage}
                                </motion.p>
                            )}

                            {/* Subtle dots */}
                            <div className="flex gap-1.5">
                                {[0, 1, 2].map(i => (
                                    <motion.div
                                        key={i}
                                        className="size-1.5 rounded-full bg-primary"
                                        animate={{
                                            scale: [1, 1.5, 1],
                                            opacity: [0.3, 1, 0.3],
                                        }}
                                        transition={{
                                            duration: 1,
                                            repeat: Infinity,
                                            delay: i * 0.2,
                                        }}
                                    />
                                ))}
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </LoadingContext.Provider>
    );
}

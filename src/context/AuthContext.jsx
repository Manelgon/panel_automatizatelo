import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [profile, setProfile] = useState(null);
    const [loading, setLoading] = useState(true);
    const [profileLoading, setProfileLoading] = useState(false);
    const initializedRef = useRef(false);

    // Fetch profile with timeout — never blocks the UI
    const fetchProfileSafe = async (userId) => {
        setProfileLoading(true);
        try {
            const profilePromise = supabase
                .from('users')
                .select('*')
                .eq('id', userId)
                .single();

            const timeoutPromise = new Promise((_, reject) =>
                setTimeout(() => reject(new Error('Profile fetch timeout')), 8000)
            );

            const { data, error } = await Promise.race([profilePromise, timeoutPromise]);

            if (!error && data) {
                setProfile(data);
            } else {
                console.warn('[Auth] Profile fetch error:', error?.message);
            }
        } catch (err) {
            console.warn('[Auth] Profile fetch failed:', err.message);
        } finally {
            setProfileLoading(false);
        }
    };

    useEffect(() => {
        // Use onAuthStateChange as the PRIMARY mechanism
        // It reads from localStorage and fires immediately
        const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
            console.log('[Auth] onAuthStateChange:', event, 'user:', session?.user?.email ?? 'none');
            initializedRef.current = true;

            if (event === 'SIGNED_OUT') {
                setUser(null);
                setProfile(null);
                setLoading(false);
                return;
            }

            if (session?.user) {
                setUser(session.user);
                setLoading(false); // Unblock UI immediately
                // Fetch profile in background — don't block rendering
                fetchProfileSafe(session.user.id);
            } else {
                setUser(null);
                setProfile(null);
                setLoading(false);
            }
        });

        // Also call getSession as a fallback, but with a timeout
        // so it doesn't hang forever if the server is unreachable
        const initSession = async () => {
            try {
                const { data, error } = await supabase.auth.getSession();

                if (error) {
                    console.warn('[Auth] getSession error:', error.message);
                }

                // If onAuthStateChange hasn't fired yet, use this result
                if (!initializedRef.current && data?.session?.user) {
                    console.log('[Auth] getSession found user:', data.session.user.email);
                    setUser(data.session.user);
                    setLoading(false);
                    fetchProfileSafe(data.session.user.id);
                } else if (!initializedRef.current) {
                    console.log('[Auth] getSession: no session found');
                    setLoading(false);
                }
            } catch (err) {
                console.warn('[Auth] getSession failed:', err.message);
                // Don't clear user — onAuthStateChange handles it
                setLoading(false);
            }
        };

        // Safety net: if nothing responds within 3 seconds, stop loading
        const safetyTimer = setTimeout(() => {
            setLoading((prev) => {
                if (prev) {
                    console.warn('[Auth] Safety timeout: forcing loading=false');
                    return false;
                }
                return prev;
            });
        }, 3000);

        initSession();

        return () => {
            subscription.unsubscribe();
            clearTimeout(safetyTimer);
        };
    }, []);

    const signOut = async () => {
        await supabase.auth.signOut();
        setUser(null);
        setProfile(null);
    };

    return (
        <AuthContext.Provider value={{ user, profile, loading, profileLoading, signOut }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth debe usarse dentro de un AuthProvider');
    }
    return context;
};

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
    PenLine,
    Plus,
    Search,
    Eye,
    EyeOff,
    Trash2,
    Edit3,
    X,
    Clock,
    CheckCircle,
    Image as ImageIcon,
    Bold,
    Italic,
    Heading1,
    Heading2,
    Heading3,
    List,
    ListOrdered,
    Link as LinkIcon,
    Quote,
    Code,
    Minus,
    Send,
    Save,
    Tag,
    Globe,
    FileText,
    Upload,
    Code2,
    AlignLeft,
    AlignCenter,
    AlignRight,
    Maximize
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTheme } from '../context/ThemeContext';
import { supabase } from '../lib/supabase';
import Sidebar from '../components/Sidebar';
import { useAuth } from '../context/AuthContext';
import { useNotifications } from '../context/NotificationContext';
import { useGlobalLoading } from '../context/LoadingContext';

// ─── Helpers ────────────────────────────────────────
function slugify(text) {
    return text
        .toString()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim()
        .replace(/\s+/g, '-')
        .replace(/[^\w-]+/g, '')
        .replace(/--+/g, '-')
        .replace(/^-+|-+$/g, '');
}

function formatDate(dateStr) {
    if (!dateStr) return '—';
    const d = new Date(dateStr);
    return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
}

// ─── Rich Text Toolbar Button ───────────────────────
const ToolbarBtn = ({ icon: Icon, label, onClick, active }) => (
    <button
        type="button"
        title={label}
        onMouseDown={(e) => { e.preventDefault(); onClick(); }}
        className={`p-2 rounded-lg transition-all duration-200 ${active ? 'bg-primary text-white shadow-md' : 'text-variable-muted hover:text-primary hover:bg-white/10'}`}
    >
        <Icon size={16} />
    </button>
);

// ─── Rich Text Editor Component ─────────────────────
function RichTextEditor({ value, onChange }) {
    const editorRef = useRef(null);
    const fileInputRef = useRef(null);
    const savedRangeRef = useRef(null);
    const isInitialMount = useRef(true);
    const { showNotification } = useNotifications();
    const { withLoading } = useGlobalLoading();

    const [isSourceMode, setIsSourceMode] = useState(false);
    const [selectedImage, setSelectedImage] = useState(null);

    useEffect(() => {
        if (isInitialMount.current && editorRef.current) {
            editorRef.current.innerHTML = value || '';
            isInitialMount.current = false;
        }
    }, [value]);

    useEffect(() => {
        if (!isInitialMount.current && !isSourceMode && editorRef.current) {
            // When returning to visual mode, force synchronization of the HTML content
            if (editorRef.current.innerHTML !== value) {
                editorRef.current.innerHTML = value || '';
            }
        }
    }, [isSourceMode]); // Dependency on isSourceMode ensures it runs right when entering visual mode

    const exec = useCallback((cmd, val = null) => {
        if (isSourceMode) return;
        document.execCommand(cmd, false, val);
        editorRef.current?.focus();
        if (onChange) onChange(editorRef.current.innerHTML);
    }, [onChange, isSourceMode]);

    const handleInput = () => {
        if (isSourceMode) return;
        if (onChange) onChange(editorRef.current.innerHTML);
    };

    const handleSourceChange = (e) => {
        if (onChange) onChange(e.target.value);
    };

    const toggleSourceMode = () => {
        if (!isSourceMode && editorRef.current && onChange) {
            // Ensure the parent state is fully to date with the visual editor before switching
            onChange(editorRef.current.innerHTML);
        }
        setIsSourceMode(!isSourceMode);
    };

    const insertImageByUrl = () => {
        if (isSourceMode) return;
        const url = prompt('URL de la imagen:');
        if (url) exec('insertImage', url);
    };

    const saveSelection = () => {
        if (isSourceMode) return;
        const sel = window.getSelection();
        if (sel.getRangeAt && sel.rangeCount) {
            savedRangeRef.current = sel.getRangeAt(0);
        }
    };

    const restoreSelection = () => {
        if (isSourceMode) return;
        if (savedRangeRef.current) {
            const sel = window.getSelection();
            sel.removeAllRanges();
            sel.addRange(savedRangeRef.current);
            editorRef.current?.focus();
        }
    };

    const triggerImageUpload = () => {
        if (isSourceMode) return;
        saveSelection();
        fileInputRef.current?.click();
    };

    const handleImageUpload = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;

        await withLoading(async () => {
            try {
                const ext = file.name.split('.').pop();
                const safeName = `blog_content_${Date.now()}.${ext}`;
                const { data, error } = await supabase.storage.from('blog-covers').upload(safeName, file, { upsert: true });
                if (error) throw error;
                const { data: urlData } = supabase.storage.from('blog-covers').getPublicUrl(data.path);

                restoreSelection();
                exec('insertImage', urlData.publicUrl);
                showNotification('Imagen insertada correctamente');
            } catch (err) {
                showNotification(`Error al subir imagen: ${err.message}`, 'error');
            }
        }, 'Subiendo imagen...');

        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const insertLink = () => {
        if (isSourceMode) return;
        const url = prompt('URL del enlace:');
        if (url) exec('createLink', url);
    };

    const handleEditorClick = (e) => {
        if (isSourceMode) return;
        if (e.target.tagName === 'IMG') {
            setSelectedImage(e.target);
            document.querySelectorAll('.editor-img-selected').forEach(img => img.classList.remove('ring-4', 'ring-primary'));
            e.target.classList.add('editor-img-selected', 'ring-4', 'ring-primary');
        } else {
            setSelectedImage(null);
            document.querySelectorAll('.editor-img-selected').forEach(img => img.classList.remove('ring-4', 'ring-primary'));
        }
    };

    const applyImageStyle = (styleType) => {
        if (!selectedImage) return;

        selectedImage.style.float = '';
        selectedImage.style.display = '';
        selectedImage.style.margin = '';
        selectedImage.style.width = '';

        switch (styleType) {
            case 'left':
                selectedImage.style.float = 'left';
                selectedImage.style.display = 'inline';
                selectedImage.style.margin = '0.5rem 1.5rem 1rem 0';
                selectedImage.style.width = '33%';
                break;
            case 'center':
                selectedImage.style.float = 'none';
                selectedImage.style.display = 'block';
                selectedImage.style.margin = '2rem auto';
                selectedImage.style.width = '75%';
                break;
            case 'right':
                selectedImage.style.float = 'right';
                selectedImage.style.display = 'inline';
                selectedImage.style.margin = '0.5rem 0 1rem 1.5rem';
                selectedImage.style.width = '33%';
                break;
            case 'full':
                selectedImage.style.float = 'none';
                selectedImage.style.display = 'block';
                selectedImage.style.margin = '2rem auto';
                selectedImage.style.width = '100%';
                break;
        }

        if (onChange) onChange(editorRef.current.innerHTML);
    };

    return (
        <div className="border border-variable rounded-2xl overflow-hidden flex flex-col">
            {/* Toolbar */}
            <div className="flex flex-wrap items-center gap-1 p-2 border-b border-variable bg-white/5 relative">
                <ToolbarBtn icon={Code2} label="Código HTML" onClick={toggleSourceMode} active={isSourceMode} />
                <div className="w-px h-6 bg-variable mx-1" />

                <div className={`flex flex-wrap items-center gap-1 ${isSourceMode ? 'opacity-50 pointer-events-none' : ''}`}>
                    <ToolbarBtn icon={Bold} label="Negrita" onClick={() => exec('bold')} />
                    <ToolbarBtn icon={Italic} label="Cursiva" onClick={() => exec('italic')} />
                    <div className="w-px h-6 bg-variable mx-1" />
                    <ToolbarBtn icon={Heading1} label="H1" onClick={() => exec('formatBlock', 'h1')} />
                    <ToolbarBtn icon={Heading2} label="H2" onClick={() => exec('formatBlock', 'h2')} />
                    <ToolbarBtn icon={Heading3} label="H3" onClick={() => exec('formatBlock', 'h3')} />
                    <div className="w-px h-6 bg-variable mx-1" />
                    <ToolbarBtn icon={List} label="Lista" onClick={() => exec('insertUnorderedList')} />
                    <ToolbarBtn icon={ListOrdered} label="Lista numerada" onClick={() => exec('insertOrderedList')} />
                    <ToolbarBtn icon={Quote} label="Cita" onClick={() => exec('formatBlock', 'blockquote')} />
                    <ToolbarBtn icon={Code} label="Código" onClick={() => exec('formatBlock', 'pre')} />
                    <div className="w-px h-6 bg-variable mx-1" />
                    <ToolbarBtn icon={LinkIcon} label="Enlace" onClick={insertLink} />
                    <ToolbarBtn icon={ImageIcon} label="Imagen por URL" onClick={insertImageByUrl} />
                    <ToolbarBtn icon={Upload} label="Subir Imagen" onClick={triggerImageUpload} />
                    <ToolbarBtn icon={Minus} label="Línea horizontal" onClick={() => exec('insertHorizontalRule')} />
                </div>

                {/* Image controls (only show if image selected) */}
                {selectedImage && !isSourceMode && (
                    <div className="ml-auto flex items-center gap-1 bg-primary/10 rounded-lg p-1 border border-primary/20">
                        <span className="text-[10px] uppercase font-bold text-primary px-2">IMG</span>
                        <ToolbarBtn icon={AlignLeft} label="Izquierda" onClick={() => applyImageStyle('left')} />
                        <ToolbarBtn icon={AlignCenter} label="Centro" onClick={() => applyImageStyle('center')} />
                        <ToolbarBtn icon={AlignRight} label="Derecha" onClick={() => applyImageStyle('right')} />
                        <ToolbarBtn icon={Maximize} label="Ancho completo" onClick={() => applyImageStyle('full')} />
                    </div>
                )}

                {/* Hidden File Input for Image Upload */}
                <input
                    type="file"
                    accept="image/*"
                    ref={fileInputRef}
                    onChange={handleImageUpload}
                    className="hidden"
                />
            </div>

            {/* Editable area */}
            {isSourceMode ? (
                <textarea
                    value={value || ''}
                    onChange={handleSourceChange}
                    className="min-h-[400px] w-full p-6 bg-black/50 text-emerald-400 font-mono text-sm outline-none resize-y"
                    spellCheck={false}
                />
            ) : (
                <div
                    ref={editorRef}
                    contentEditable
                    onInput={handleInput}
                    onClick={handleEditorClick}
                    className="min-h-[400px] p-6 text-variable-main outline-none prose prose-invert max-w-none
                        [&_h1]:text-3xl [&_h1]:font-bold [&_h1]:mt-6 [&_h1]:mb-3 [&_h1]:text-primary
                        [&_h2]:text-2xl [&_h2]:font-semibold [&_h2]:mt-5 [&_h2]:mb-2
                        [&_h3]:text-xl [&_h3]:font-medium [&_h3]:mt-4 [&_h3]:mb-2
                        [&_p]:mb-3 [&_p]:leading-relaxed
                        [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:mb-3
                        [&_ol]:list-decimal [&_ol]:pl-6 [&_ol]:mb-3
                        [&_li]:mb-1
                        [&_blockquote]:border-l-4 [&_blockquote]:border-primary [&_blockquote]:pl-4 [&_blockquote]:italic [&_blockquote]:text-variable-muted [&_blockquote]:my-4
                        [&_pre]:bg-black/30 [&_pre]:rounded-xl [&_pre]:p-4 [&_pre]:text-sm [&_pre]:overflow-x-auto [&_pre]:my-4
                        [&_a]:text-primary [&_a]:underline
                        [&_img]:rounded-xl [&_img]:max-w-full [&_img]:my-4 [&_img]:shadow-lg [&_img]:transition-all [&_img]:cursor-pointer
                        [&_hr]:border-variable [&_hr]:my-6"
                    style={{ minHeight: '400px' }}
                />
            )}
        </div>
    );
}

// ─── Tag Input Component ────────────────────────────
function TagInput({ tags, onChange }) {
    const [input, setInput] = useState('');

    const addTag = () => {
        const tag = input.trim().toLowerCase();
        if (tag && !tags.includes(tag)) {
            onChange([...tags, tag]);
        }
        setInput('');
    };

    const removeTag = (idx) => {
        onChange(tags.filter((_, i) => i !== idx));
    };

    return (
        <div className="flex flex-wrap gap-2 items-center p-3 rounded-xl border border-variable bg-white/5 min-h-[48px]">
            {tags.map((tag, i) => (
                <span key={i} className="flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold bg-primary/15 text-primary border border-primary/20">
                    {tag}
                    <button type="button" onClick={() => removeTag(i)} className="hover:text-white ml-1"><X size={12} /></button>
                </span>
            ))}
            <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTag(); } }}
                placeholder="Añadir tag..."
                className="bg-transparent outline-none text-sm text-variable-main flex-1 min-w-[100px]"
            />
        </div>
    );
}

// ─── Upload Cover Image ─────────────────────────────
async function uploadCoverImage(file) {
    const ext = file.name.split('.').pop();
    const safeName = `blog_${Date.now()}.${ext}`;
    const { data, error } = await supabase.storage.from('blog-covers').upload(safeName, file, { upsert: true });
    if (error) throw error;
    const { data: urlData } = supabase.storage.from('blog-covers').getPublicUrl(data.path);
    return urlData.publicUrl;
}

// ─── Main Component ─────────────────────────────────
export default function Blog() {
    const { darkMode } = useTheme();
    const { profile } = useAuth();
    const { showNotification, confirm } = useNotifications();
    const { withLoading } = useGlobalLoading();

    const [posts, setPosts] = useState([]);
    const [loading, setLoading] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [filterStatus, setFilterStatus] = useState('all');

    // Modal
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingPost, setEditingPost] = useState(null);
    const [activeTab, setActiveTab] = useState('editor'); // editor | seo

    // Form
    const defaultForm = {
        title: '', slug: '', excerpt: '', content: '',
        cover_image: '', status: 'draft', is_visible: false,
        tags: [], meta_title: '', meta_description: ''
    };
    const [form, setForm] = useState(defaultForm);
    const [coverFile, setCoverFile] = useState(null);
    const [coverPreview, setCoverPreview] = useState('');

    // ─── Fetch ──────────────────────
    const fetchPosts = async () => {
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('blog_posts')
                .select('*, author:users(name, email)')
                .order('created_at', { ascending: false });
            if (error) throw error;
            setPosts(data || []);
        } catch (err) {
            console.error('Error fetching blog posts:', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchPosts();
        const channel = supabase.channel('blog-changes')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'blog_posts' }, () => fetchPosts())
            .subscribe();
        return () => supabase.removeChannel(channel);
    }, []);

    // ─── Filtered posts ─────────────
    const filtered = posts.filter(p => {
        const matchSearch = p.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
            (p.excerpt || '').toLowerCase().includes(searchTerm.toLowerCase());
        const matchStatus = filterStatus === 'all' || p.status === filterStatus;
        return matchSearch && matchStatus;
    });

    // ─── Open Modal ─────────────────
    const openNew = () => {
        setEditingPost(null);
        setForm(defaultForm);
        setCoverFile(null);
        setCoverPreview('');
        setActiveTab('editor');
        setIsModalOpen(true);
    };

    const openEdit = (post) => {
        setEditingPost(post);
        setForm({
            title: post.title || '',
            slug: post.slug || '',
            excerpt: post.excerpt || '',
            content: post.content || '',
            cover_image: post.cover_image || '',
            status: post.status || 'draft',
            is_visible: post.is_visible || false,
            tags: post.tags || [],
            meta_title: post.meta_title || '',
            meta_description: post.meta_description || ''
        });
        setCoverFile(null);
        setCoverPreview(post.cover_image || '');
        setActiveTab('editor');
        setIsModalOpen(true);
    };

    // ─── Title → Slug ───────────────
    const handleTitleChange = (val) => {
        setForm(prev => ({
            ...prev,
            title: val,
            slug: editingPost ? prev.slug : slugify(val)
        }));
    };

    // ─── Cover Image ────────────────
    const handleCoverSelect = (e) => {
        const file = e.target.files[0];
        if (file) {
            setCoverFile(file);
            setCoverPreview(URL.createObjectURL(file));
        }
    };

    // ─── Save ───────────────────────
    const handleSave = async (publishNow = false) => {
        if (!form.title.trim() || !form.slug.trim()) {
            showNotification('Título y slug son obligatorios', 'error');
            return;
        }

        await withLoading(async () => {
            try {
                let coverUrl = form.cover_image;
                if (coverFile) {
                    coverUrl = await uploadCoverImage(coverFile);
                }

                const payload = {
                    title: form.title,
                    slug: form.slug,
                    excerpt: form.excerpt,
                    content: form.content,
                    cover_image: coverUrl,
                    status: publishNow ? 'published' : form.status,
                    is_visible: publishNow ? true : form.is_visible,
                    tags: form.tags,
                    meta_title: form.meta_title || form.title,
                    meta_description: form.meta_description || form.excerpt,
                    ...(publishNow && !editingPost?.published_at ? { published_at: new Date().toISOString() } : {}),
                    ...(!editingPost ? { author_id: profile?.id } : {})
                };

                if (editingPost) {
                    if (publishNow && !editingPost.published_at) {
                        payload.published_at = new Date().toISOString();
                    }
                    const { error } = await supabase.from('blog_posts').update(payload).eq('id', editingPost.id);
                    if (error) throw error;
                    showNotification(publishNow ? 'Post publicado con éxito' : 'Post actualizado');
                } else {
                    const { error } = await supabase.from('blog_posts').insert([payload]);
                    if (error) throw error;
                    showNotification(publishNow ? 'Post creado y publicado' : 'Borrador guardado');
                }

                setIsModalOpen(false);
                fetchPosts();
            } catch (err) {
                console.error('Error saving post:', err);
                showNotification(`Error: ${err.message}`, 'error');
            }
        }, 'Guardando post...');
    };

    // ─── Toggle visibility ──────────
    const toggleVisibility = async (post) => {
        try {
            const { error } = await supabase.from('blog_posts').update({ is_visible: !post.is_visible }).eq('id', post.id);
            if (error) throw error;
            showNotification(post.is_visible ? 'Post oculto de la landing' : 'Post visible en la landing');
            fetchPosts();
        } catch (err) {
            showNotification(`Error: ${err.message}`, 'error');
        }
    };

    // ─── Delete ─────────────────────
    const handleDelete = async (post) => {
        const confirmed = await confirm({
            title: '¿Eliminar Publicación?',
            message: `¿Estás seguro de que deseas eliminar la publicación "${post.title}"? Esta acción borrará también la imagen de portada.`,
            confirmText: 'Eliminar',
            cancelText: 'Cancelar'
        });

        if (!confirmed) return;

        try {
            // Eliminar imagen del storage si existe (extraemos el nombre del archivo de la URL)
            if (post.cover_image) {
                const urlParts = post.cover_image.split('/');
                const fileName = urlParts[urlParts.length - 1];
                if (fileName) {
                    await supabase.storage.from('blog-covers').remove([fileName]);
                }
            }

            // Eliminar el registro en la base de datos
            const { error } = await supabase.from('blog_posts').delete().eq('id', post.id);
            if (error) throw error;

            showNotification('Publicación eliminada correctamente');
            fetchPosts();
        } catch (err) {
            showNotification(`Error al eliminar: ${err.message}`, 'error');
        }
    };

    // ─── Stats ──────────────────────
    const stats = {
        total: posts.length,
        published: posts.filter(p => p.status === 'published').length,
        drafts: posts.filter(p => p.status === 'draft').length,
        visible: posts.filter(p => p.is_visible).length
    };

    // ─── Render ─────────────────────
    return (
        <div className="flex min-h-screen transition-colors duration-300 overflow-hidden">
            <Sidebar />

            <main className="flex-1 p-4 sm:p-10 overflow-y-auto pb-32 md:pb-10">
                {/* Header */}
                <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6 mb-8 sm:mb-12">
                    <div>
                        <h1 className="text-2xl sm:text-4xl font-bold font-display tracking-tight mb-1 text-variable-main">
                            Gestión del <span className="text-primary italic">Blog</span>
                        </h1>
                        <p className="text-variable-muted text-sm sm:text-base">Crea, edita y publica artículos para la landing</p>
                    </div>
                    <button onClick={openNew} className="flex items-center gap-2 bg-primary hover:bg-primary/80 text-white px-5 py-3 rounded-2xl font-semibold transition-all shadow-lg shadow-primary/20 hover:shadow-primary/40">
                        <Plus size={20} /> Nuevo Post
                    </button>
                </header>

                {/* Stats */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                    {[
                        { label: 'Total', value: stats.total, icon: FileText, color: 'text-blue-400' },
                        { label: 'Publicados', value: stats.published, icon: CheckCircle, color: 'text-emerald-400' },
                        { label: 'Borradores', value: stats.drafts, icon: Clock, color: 'text-amber-400' },
                        { label: 'Visibles', value: stats.visible, icon: Eye, color: 'text-primary' }
                    ].map(s => (
                        <div key={s.label} className="glass rounded-2xl p-5">
                            <div className="flex items-center gap-3 mb-2">
                                <s.icon size={20} className={s.color} />
                                <span className="text-variable-muted text-sm font-medium">{s.label}</span>
                            </div>
                            <p className="text-3xl font-bold text-variable-main">{s.value}</p>
                        </div>
                    ))}
                </div>

                {/* Search + Filter */}
                <div className="flex flex-col sm:flex-row gap-4 mb-6">
                    <div className="relative flex-1">
                        <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-variable-muted" />
                        <input
                            type="text"
                            placeholder="Buscar posts..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full pl-12 pr-4 py-3 rounded-xl glass text-variable-main placeholder:text-variable-muted outline-none focus:ring-2 focus:ring-primary/30"
                        />
                    </div>
                    <select
                        value={filterStatus}
                        onChange={(e) => setFilterStatus(e.target.value)}
                        className="rounded-xl"
                    >
                        <option value="all">Todos los estados</option>
                        <option value="published">Publicados</option>
                        <option value="draft">Borradores</option>
                    </select>
                </div>

                {/* Posts List */}
                {loading ? (
                    <div className="flex justify-center py-20">
                        <div className="size-12 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
                    </div>
                ) : filtered.length === 0 ? (
                    <div className="text-center py-20 text-variable-muted">
                        <PenLine size={48} className="mx-auto mb-4 opacity-30" />
                        <p className="text-lg font-medium">No hay posts todavía</p>
                        <p className="text-sm mt-1">Crea tu primer artículo para el blog</p>
                    </div>
                ) : (
                    <div className="grid gap-4">
                        {filtered.map(post => (
                            <motion.div
                                key={post.id}
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="glass rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row gap-4 items-start sm:items-center hover:border-primary/30 transition-all duration-300 group h-auto sm:h-32"
                            >
                                {/* Cover thumbnail */}
                                {post.cover_image ? (
                                    <img src={post.cover_image} alt="" className="w-full sm:w-24 h-32 sm:h-24 rounded-xl object-cover flex-shrink-0 shadow-md" />
                                ) : (
                                    <div className="w-full sm:w-24 h-32 sm:h-24 rounded-xl bg-white/5 flex items-center justify-center flex-shrink-0">
                                        <ImageIcon size={24} className="text-variable-muted opacity-30" />
                                    </div>
                                )}

                                {/* Content */}
                                <div className="flex-1 min-w-0 w-full flex flex-col justify-center">
                                    <div className="flex items-center justify-between gap-4 mb-1">
                                        <h3 className="text-lg font-bold text-variable-main truncate">{post.title}</h3>
                                        <div className="flex items-center gap-2 flex-shrink-0 hidden sm:flex">
                                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${post.status === 'published' ? 'bg-emerald-500/15 text-emerald-400' : 'bg-amber-500/15 text-amber-400'}`}>
                                                {post.status === 'published' ? 'Publicado' : 'Borrador'}
                                            </span>
                                            {post.is_visible && (
                                                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-primary/15 text-primary">
                                                    Visible
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2 flex-shrink-0 sm:hidden mb-2">
                                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${post.status === 'published' ? 'bg-emerald-500/15 text-emerald-400' : 'bg-amber-500/15 text-amber-400'}`}>
                                            {post.status === 'published' ? 'Publicado' : 'Borrador'}
                                        </span>
                                        {post.is_visible && (
                                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-primary/15 text-primary">
                                                Visible
                                            </span>
                                        )}
                                    </div>
                                    <p className="text-sm text-variable-muted truncate">{post.excerpt || 'Sin resumen'}</p>
                                    <div className="flex items-center gap-3 mt-2 text-xs text-variable-muted truncate">
                                        <span>{formatDate(post.published_at || post.created_at)}</span>
                                        {post.author?.name && <span className="truncate">• {post.author.name}</span>}
                                        {post.tags?.length > 0 && (
                                            <div className="flex gap-1 hidden md:flex">
                                                {post.tags.slice(0, 3).map((t, i) => (
                                                    <span key={i} className="px-2 py-0.5 rounded-full bg-white/5 text-[10px] truncate max-w-[80px]">{t}</span>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Actions */}
                                <div className="flex items-center gap-2 flex-shrink-0 w-full sm:w-auto justify-end mt-2 sm:mt-0 pt-3 sm:pt-0 border-t border-white/5 sm:border-0">
                                    <button onClick={() => toggleVisibility(post)} title={post.is_visible ? 'Ocultar' : 'Mostrar'} className={`p-2.5 rounded-xl transition-all ${post.is_visible ? 'text-primary bg-primary/10 hover:bg-primary/20' : 'text-variable-muted hover:text-primary hover:bg-white/5'}`}>
                                        {post.is_visible ? <Eye size={18} /> : <EyeOff size={18} />}
                                    </button>
                                    <button onClick={() => openEdit(post)} title="Editar" className="p-2.5 rounded-xl text-variable-muted hover:text-primary hover:bg-white/5 transition-all">
                                        <Edit3 size={18} />
                                    </button>
                                    <button onClick={() => handleDelete(post)} title="Eliminar" className="p-2.5 rounded-xl text-variable-muted hover:text-rose-500 hover:bg-rose-500/10 transition-all">
                                        <Trash2 size={18} />
                                    </button>
                                </div>
                            </motion.div>
                        ))}
                    </div>
                )}
            </main>

            {/* ─── Editor Modal ───────────────────── */}
            <AnimatePresence>
                {isModalOpen && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[200] flex items-start justify-center bg-black/60 backdrop-blur-sm overflow-y-auto py-6 px-4"
                        onClick={() => setIsModalOpen(false)}
                    >
                        <motion.div
                            initial={{ opacity: 0, y: 30, scale: 0.97 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: 30, scale: 0.97 }}
                            onClick={(e) => e.stopPropagation()}
                            className="w-full max-w-5xl glass rounded-3xl shadow-2xl border border-variable overflow-hidden"
                        >
                            {/* Modal Header */}
                            <div className="flex items-center justify-between p-6 border-b border-variable">
                                <h2 className="text-xl font-bold text-variable-main font-display">
                                    {editingPost ? 'Editar Post' : 'Nuevo Post'}
                                </h2>
                                <div className="flex items-center gap-2">
                                    {/* Tab buttons */}
                                    <button
                                        onClick={() => setActiveTab('editor')}
                                        className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all ${activeTab === 'editor' ? 'bg-primary text-white' : 'text-variable-muted hover:text-primary'}`}
                                    >
                                        <Edit3 size={14} className="inline mr-1.5" />Editor
                                    </button>
                                    <button
                                        onClick={() => setActiveTab('seo')}
                                        className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all ${activeTab === 'seo' ? 'bg-primary text-white' : 'text-variable-muted hover:text-primary'}`}
                                    >
                                        <Globe size={14} className="inline mr-1.5" />SEO
                                    </button>
                                    <button onClick={() => setIsModalOpen(false)} className="p-2 rounded-xl text-variable-muted hover:text-rose-500 hover:bg-rose-500/10 transition-all ml-2">
                                        <X size={20} />
                                    </button>
                                </div>
                            </div>

                            {/* Modal Body */}
                            <div className="p-6 max-h-[75vh] overflow-y-auto">
                                {activeTab === 'editor' ? (
                                    <div className="space-y-6">
                                        {/* Title */}
                                        <div>
                                            <label className="block text-sm font-semibold text-variable-main mb-2">Título *</label>
                                            <input
                                                type="text"
                                                value={form.title}
                                                onChange={(e) => handleTitleChange(e.target.value)}
                                                placeholder="Título del artículo"
                                                className="w-full px-4 py-3 rounded-xl glass text-variable-main text-lg font-semibold placeholder:text-variable-muted outline-none focus:ring-2 focus:ring-primary/30"
                                            />
                                        </div>

                                        {/* Slug (only visible when editing) */}
                                        {editingPost && (
                                            <div>
                                                <label className="block text-sm font-semibold text-variable-main mb-2">Slug (URL)</label>
                                                <div className="flex items-center gap-2">
                                                    <span className="text-variable-muted text-sm">/blog/</span>
                                                    <input
                                                        type="text"
                                                        value={form.slug}
                                                        onChange={(e) => setForm(prev => ({ ...prev, slug: slugify(e.target.value) }))}
                                                        className="flex-1 px-4 py-3 rounded-xl glass text-variable-main placeholder:text-variable-muted outline-none focus:ring-2 focus:ring-primary/30"
                                                    />
                                                </div>
                                            </div>
                                        )}

                                        {/* Cover Image */}
                                        <div>
                                            <label className="block text-sm font-semibold text-variable-main mb-2">Imagen de portada</label>
                                            <div className="flex items-center gap-4">
                                                {coverPreview ? (
                                                    <img src={coverPreview} alt="Cover" className="w-32 h-20 rounded-xl object-cover shadow-md" />
                                                ) : (
                                                    <div className="w-32 h-20 rounded-xl bg-white/5 flex items-center justify-center border border-variable">
                                                        <ImageIcon size={24} className="text-variable-muted opacity-30" />
                                                    </div>
                                                )}
                                                <label className="cursor-pointer px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-variable-muted hover:text-primary transition-all text-sm font-semibold border border-variable">
                                                    <ImageIcon size={14} className="inline mr-1.5" />Subir imagen
                                                    <input type="file" accept="image/*" onChange={handleCoverSelect} className="hidden" />
                                                </label>
                                                {coverPreview && (
                                                    <button onClick={() => { setCoverFile(null); setCoverPreview(''); setForm(p => ({ ...p, cover_image: '' })); }} className="text-variable-muted hover:text-rose-500 text-sm">
                                                        Quitar
                                                    </button>
                                                )}
                                            </div>
                                        </div>

                                        {/* Excerpt */}
                                        <div>
                                            <label className="block text-sm font-semibold text-variable-main mb-2">Extracto</label>
                                            <textarea
                                                value={form.excerpt}
                                                onChange={(e) => setForm(prev => ({ ...prev, excerpt: e.target.value }))}
                                                placeholder="Breve resumen del artículo (se muestra en las tarjetas)..."
                                                rows={3}
                                                className="w-full px-4 py-3 rounded-xl glass text-variable-main placeholder:text-variable-muted outline-none focus:ring-2 focus:ring-primary/30 resize-none"
                                            />
                                        </div>

                                        {/* Rich Text Editor */}
                                        <div>
                                            <label className="block text-sm font-semibold text-variable-main mb-2">Contenido *</label>
                                            <RichTextEditor
                                                value={form.content}
                                                onChange={(html) => setForm(prev => ({ ...prev, content: html }))}
                                            />
                                        </div>

                                        {/* Tags */}
                                        <div>
                                            <label className="block text-sm font-semibold text-variable-main mb-2">
                                                <Tag size={14} className="inline mr-1.5" />Tags
                                            </label>
                                            <TagInput tags={form.tags} onChange={(tags) => setForm(prev => ({ ...prev, tags }))} />
                                        </div>
                                    </div>
                                ) : (
                                    /* SEO Tab */
                                    <div className="space-y-6">
                                        <div className="glass rounded-2xl p-5 border border-primary/20">
                                            <h3 className="text-sm font-bold text-primary mb-3 flex items-center gap-2">
                                                <Globe size={16} /> Meta información SEO
                                            </h3>
                                            <p className="text-xs text-variable-muted mb-4">Estos campos controlan cómo aparece tu artículo en los resultados de búsqueda de Google.</p>

                                            <div className="space-y-4">
                                                <div>
                                                    <label className="block text-sm font-semibold text-variable-main mb-2">Meta Título</label>
                                                    <input
                                                        type="text"
                                                        value={form.meta_title}
                                                        onChange={(e) => setForm(prev => ({ ...prev, meta_title: e.target.value }))}
                                                        placeholder={form.title || 'Título para buscadores...'}
                                                        className="w-full px-4 py-3 rounded-xl glass text-variable-main placeholder:text-variable-muted outline-none focus:ring-2 focus:ring-primary/30"
                                                    />
                                                    <p className="text-xs text-variable-muted mt-1">{(form.meta_title || form.title || '').length}/60 caracteres</p>
                                                </div>

                                                <div>
                                                    <label className="block text-sm font-semibold text-variable-main mb-2">Meta Descripción</label>
                                                    <textarea
                                                        value={form.meta_description}
                                                        onChange={(e) => setForm(prev => ({ ...prev, meta_description: e.target.value }))}
                                                        placeholder={form.excerpt || 'Descripción para buscadores...'}
                                                        rows={3}
                                                        className="w-full px-4 py-3 rounded-xl glass text-variable-main placeholder:text-variable-muted outline-none focus:ring-2 focus:ring-primary/30 resize-none"
                                                    />
                                                    <p className="text-xs text-variable-muted mt-1">{(form.meta_description || form.excerpt || '').length}/160 caracteres</p>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Google preview */}
                                        <div className="glass rounded-2xl p-5">
                                            <h3 className="text-sm font-bold text-variable-main mb-3">Vista previa en Google</h3>
                                            <div className="bg-white rounded-xl p-4 text-left">
                                                <p className="text-blue-700 text-lg font-medium truncate">{form.meta_title || form.title || 'Título del artículo'}</p>
                                                <p className="text-green-700 text-sm">automatizatelo.com/blog/{form.slug || 'slug'}</p>
                                                <p className="text-gray-600 text-sm mt-1 line-clamp-2">{form.meta_description || form.excerpt || 'Descripción del artículo...'}</p>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Modal Footer */}
                            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-6 border-t border-variable bg-white/[0.02]">
                                <div className="flex items-center gap-3">
                                    {editingPost && (
                                        <span className={`text-xs px-3 py-1 rounded-full font-bold ${editingPost.status === 'published' ? 'bg-emerald-500/15 text-emerald-400' : 'bg-amber-500/15 text-amber-400'}`}>
                                            {editingPost.status === 'published' ? 'Publicado' : 'Borrador'}
                                        </span>
                                    )}
                                </div>
                                <div className="flex items-center gap-3">
                                    <button
                                        onClick={() => setIsModalOpen(false)}
                                        className="px-5 py-2.5 rounded-xl text-variable-muted hover:text-variable-main hover:bg-white/5 transition-all font-semibold text-sm"
                                    >
                                        Cancelar
                                    </button>
                                    <button
                                        onClick={() => handleSave(false)}
                                        className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-variable-main border border-variable font-semibold text-sm transition-all"
                                    >
                                        <Save size={16} /> Guardar borrador
                                    </button>
                                    <button
                                        onClick={() => handleSave(true)}
                                        className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary hover:bg-primary/80 text-white font-semibold text-sm shadow-lg shadow-primary/20 transition-all"
                                    >
                                        <Send size={16} /> Publicar
                                    </button>
                                </div>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

import { useState, useEffect, useRef, useCallback } from 'react';
import { apiClient, requestWithRefresh } from '../apiClient';
import DocumentPreview from './DocumentPreview';

/* Documents page: the library.
 *
 * One job per element. A row names the file and shows where it sits. A menu
 * behind the row holds the three things you can do to it. Upload is a
 * dropzone because that is where a file already is.
 *
 * Contracts kept from the previous version:
 *   GET    /documents/                      -> { documents: [{ name, size_bytes }] }
 *   POST   /upload/                         -> { task_id, message }
 *   POST   /upload-url/                     -> { task_id, message }
 *   GET    /tasks/<id>/                     -> { status, progress, message, error, result }
 *   PATCH  /documents/<name>/rename/        -> { new_name }
 *   DELETE /documents/<name>/
 *   PUT    /documents/<name>/move/          -> { collection }
 *   GET    /collections/                    -> { collections: [{ id, name }] }
 *
 * The documents endpoint does not send collection fields yet. Every read of
 * one is guarded, and the collection column hides itself until at least one row
 * carries the data. See supportsCollections below.
 *
 * Component: <Documents onCollectionsChange={fetchCollections} />
 */

const SUPPORTED_EXTENSIONS = ['.txt', '.md', '.pdf', '.docx'];
const SUPPORTED_HINT = 'TXT, MD, PDF, DOCX';
const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
const POLL_INTERVAL_MS = 1500;
const SUCCESS_TOAST_MS = 5000;

/* Glyph plus a word. The word is what carries the meaning when the icon font
   has not loaded, and it is what a screen reader reads out. No emoji. */
const FILE_TYPES = {
    '.pdf': { glyph: 'picture_as_pdf', label: 'PDF' },
    '.md': { glyph: 'description', label: 'Markdown' },
    '.txt': { glyph: 'notes', label: 'Text' },
    '.docx': { glyph: 'article', label: 'Word' },
};
const FILE_TYPE_FALLBACK = { glyph: 'draft', label: 'File' };

const TERMINAL_STATUSES = ['completed', 'failed', 'cancelled'];

const FOCUSABLE =
    'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

function extensionOf(filename) {
    const match = String(filename || '').toLowerCase().match(/\.[^./\\]+$/);
    return match ? match[0] : '';
}

function fileTypeOf(filename) {
    return FILE_TYPES[extensionOf(filename)] || FILE_TYPE_FALLBACK;
}

function stemOf(filename) {
    const ext = extensionOf(filename);
    return ext ? String(filename).slice(0, -ext.length) : String(filename);
}

function formatBytes(bytes) {
    const value = Number(bytes);
    if (!Number.isFinite(value) || value < 0) return null;
    if (value < 1024) return `${value} B`;
    if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
    return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

/* Dates are optional. The list endpoint sends none today, so the meta line
   shows size alone until it does. */
function formatDate(doc) {
    const raw = doc.created_at || doc.modified_at || doc.uploaded_at || doc.date;
    if (!raw) return null;
    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) return null;
    return parsed.toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
    });
}

function normalizeHttpUrl(rawValue) {
    const trimmed = (rawValue || '').trim();
    if (!trimmed) return null;

    const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;

    try {
        const parsed = new URL(withScheme);
        if (!['http:', 'https:'].includes(parsed.protocol)) return null;
        return parsed.toString();
    } catch {
        return null;
    }
}

/* Client-side gate. The server checks the extension too, but it does the
   check after the bytes have crossed the wire. */
function validateFile(file) {
    if (!file) return 'Choose a file first.';
    if (file.size === 0) return `"${file.name}" is empty.`;
    const ext = extensionOf(file.name);
    if (!SUPPORTED_EXTENSIONS.includes(ext)) {
        return `"${file.name}" is not a supported format. Use ${SUPPORTED_HINT}.`;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
        return `"${file.name}" is ${formatBytes(file.size)}. The limit is ${formatBytes(MAX_UPLOAD_BYTES)}.`;
    }
    return null;
}

let noticeSeq = 0;

function Documents({ onCollectionsChange }) {
    const [documents, setDocuments] = useState([]);
    const [loading, setLoading] = useState(true);
    const [collections, setCollections] = useState([]);

    /* Upload. file is the picked file, it stays in state so a retry has
       something to resubmit. failedUpload holds the last attempt that broke. */
    const [file, setFile] = useState(null);
    const [fileError, setFileError] = useState('');
    const [uploading, setUploading] = useState(false);
    const [failedUpload, setFailedUpload] = useState(null);
    const [dragActive, setDragActive] = useState(false);
    const [taskInfo, setTaskInfo] = useState(null);

    const [url, setUrl] = useState('');
    const [urlError, setUrlError] = useState('');
    const [notices, setNotices] = useState([]);

    const [previewName, setPreviewName] = useState(null);
    const [confirmDelete, setConfirmDelete] = useState(null);
    const [deleting, setDeleting] = useState(false);

    /* { original, value, error } while a row is in edit mode. */
    const [renaming, setRenaming] = useState(null);

    /* One open menu at a time. kind is 'actions' or 'collection'. */
    const [openMenu, setOpenMenu] = useState(null);

    const fileInputRef = useRef(null);
    const renameRef = useRef(null);
    const listHeadingRef = useRef(null);
    const pollRef = useRef(null);
    const noticeTimersRef = useRef([]);
    const dragDepthRef = useRef(0);
    /* renameBusyRef and renameCancelledRef stop the second commit. Enter fires
       the request, then the input loses focus and asks for one more.
       renameAttemptedRef remembers the last name the server was asked for, so
       a blur after a refusal does not repeat the same rejected request. */
    const renameBusyRef = useRef(false);
    const renameCancelledRef = useRef(false);
    const renameAttemptedRef = useRef('');
    /* The last refusal, so a blur can repeat it as a notice without waiting
       on another request. */
    const renameErrorRef = useRef('');

    const pushNotice = useCallback((tone, text) => {
        noticeSeq += 1;
        const id = `notice-${noticeSeq}`;
        setNotices((current) => [...current.slice(-3), { id, tone, text }]);
        if (tone === 'success') {
            const timer = setTimeout(() => {
                setNotices((current) => current.filter((item) => item.id !== id));
                noticeTimersRef.current = noticeTimersRef.current.filter((entry) => entry !== timer);
            }, SUCCESS_TOAST_MS);
            noticeTimersRef.current.push(timer);
        }
    }, []);

    const dismissNotice = useCallback((id) => {
        setNotices((current) => current.filter((item) => item.id !== id));
    }, []);

    /* Rows are keyed by filename, so each row control is addressable by the
       name that owns it. Focus lands back on the control that opened a menu
       or a dialog, and falls through to the list heading when the row is
       gone. attr names the control: the action button or the collection chip.
       The frame waits one paint so the list has re-rendered first. */
    const focusRowControl = useCallback((attr, name) => {
        window.requestAnimationFrame(() => {
            const control = document.querySelector(`[${attr}="${CSS.escape(name)}"]`);
            if (control) control.focus();
            else listHeadingRef.current?.focus();
        });
    }, []);

    const focusRowAction = useCallback((name) => focusRowControl('data-doc-action', name), [focusRowControl]);
    const focusCollectionChip = useCallback(
        (name) => focusRowControl('data-doc-collection-trigger', name),
        [focusRowControl]
    );

    /* The deleted row is unmounted, so focus goes to whatever slid into its
       place, or to the list heading when nothing is left. */
    const focusRowAtIndex = useCallback((index) => {
        window.requestAnimationFrame(() => {
            const rows = document.querySelectorAll('[data-doc-index]');
            const target = rows[Math.min(index, rows.length - 1)];
            const trigger = target?.querySelector('[data-doc-action]');
            if (trigger) trigger.focus();
            else listHeadingRef.current?.focus();
        });
    }, []);

    const fetchDocs = useCallback(async () => {
        setLoading(true);
        try {
            const res = await requestWithRefresh((headers) => apiClient.get('/documents/', { headers }));
            setDocuments(Array.isArray(res.data?.documents) ? res.data.documents : []);
        } catch (err) {
            setDocuments([]);
            pushNotice('error', err.response?.data?.error || 'Could not load documents. Sign in again.');
        } finally {
            setLoading(false);
        }
    }, [pushNotice]);

    const fetchCollections = useCallback(async () => {
        try {
            const res = await requestWithRefresh((headers) => apiClient.get('/collections/', { headers }));
            setCollections(Array.isArray(res.data?.collections) ? res.data.collections : []);
        } catch {
            setCollections([]);
        }
    }, []);

    const stopPolling = useCallback(() => {
        if (pollRef.current) {
            clearInterval(pollRef.current);
            pollRef.current = null;
        }
    }, []);

    /* Task progress is the only source of upload progress. The bar renders
       whatever the task reports and the panel clears on a terminal status. */
    const startPollingTask = useCallback((taskId, label) => {
        stopPolling();
        setTaskInfo({ id: taskId, label: label || '', status: 'pending', progress: 0, message: '', error: '' });

        pollRef.current = setInterval(async () => {
            try {
                const res = await requestWithRefresh((headers) => apiClient.get(`/tasks/${taskId}/`, { headers }));
                const task = res.data || {};
                const status = task.status || 'pending';
                const progress = Math.max(0, Math.min(100, Number(task.progress ?? 0) || 0));
                const message = task.message || '';
                const error = task.error || '';

                if (TERMINAL_STATUSES.includes(status)) {
                    stopPolling();
                    setTaskInfo(null);

                    if (status === 'completed') {
                        pushNotice('success', task.result?.message || `${label || 'Upload'} finished.`);
                        setFailedUpload(null);
                        fetchDocs();
                    } else {
                        const reason = error || `Task ${status}.`;
                        pushNotice('error', `${label || 'Upload'} failed. ${reason}`);
                        setFailedUpload((current) => current || (label ? { kind: 'label', label, reason } : null));
                    }
                    return;
                }

                setTaskInfo({ id: taskId, label: label || '', status, progress, message, error });
            } catch (err) {
                stopPolling();
                setTaskInfo(null);
                pushNotice('error', err.response?.data?.error || 'Lost track of the upload task.');
            }
        }, POLL_INTERVAL_MS);
    }, [fetchDocs, pushNotice, stopPolling]);

    useEffect(() => {
        fetchDocs();
        fetchCollections();
        return () => {
            stopPolling();
            noticeTimersRef.current.forEach(clearTimeout);
            noticeTimersRef.current = [];
        };
    }, [fetchDocs, fetchCollections, stopPolling]);

    /* One click anywhere else closes an open menu. Bound on the document so a
       menu can live inside a row without each row owning a listener. */
    useEffect(() => {
        if (!openMenu) return undefined;

        const onPointerDown = (event) => {
            if (!event.target.closest('.doc-menu-anchor')) setOpenMenu(null);
        };
        const onKeyDown = (event) => {
            if (event.key !== 'Escape') return;
            setOpenMenu(null);
            // Escape returns focus to the control that opened the menu.
            if (openMenu.kind === 'collection') focusCollectionChip(openMenu.name);
            else focusRowAction(openMenu.name);
        };

        document.addEventListener('mousedown', onPointerDown);
        document.addEventListener('keydown', onKeyDown);
        return () => {
            document.removeEventListener('mousedown', onPointerDown);
            document.removeEventListener('keydown', onKeyDown);
        };
    }, [focusCollectionChip, focusRowAction, openMenu]);

    /* ---------- Upload ---------- */

    const acceptFile = useCallback((candidate) => {
        if (!candidate) return;
        const problem = validateFile(candidate);
        if (problem) {
            setFile(null);
            setFileError(problem);
            return;
        }
        setFile(candidate);
        setFileError('');
    }, []);

    const pickFile = () => {
        fileInputRef.current?.click();
    };

    const handleFileInput = (event) => {
        acceptFile(event.target.files?.[0]);
        // Clear the input so picking the same file twice still fires change.
        event.target.value = '';
    };

    /* dragenter and dragleave both fire for every child element, so the
       counter is what decides whether the pointer is still over the zone. */
    const handleDragEnter = (event) => {
        event.preventDefault();
        dragDepthRef.current += 1;
        if (event.dataTransfer?.types?.includes('Files')) setDragActive(true);
    };

    const handleDragOver = (event) => {
        event.preventDefault();
        if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
    };

    const handleDragLeave = (event) => {
        event.preventDefault();
        dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
        if (dragDepthRef.current === 0) setDragActive(false);
    };

    const handleDrop = (event) => {
        event.preventDefault();
        dragDepthRef.current = 0;
        setDragActive(false);
        acceptFile(event.dataTransfer?.files?.[0]);
    };

    const startUpload = useCallback(async (candidate, normalizedUrl) => {
        const label = candidate ? candidate.name : normalizedUrl;

        if (candidate) {
            const problem = validateFile(candidate);
            if (problem) {
                setFileError(problem);
                return;
            }
        }

        setUploading(true);
        setFileError('');
        setUrlError('');
        setFailedUpload(null);

        try {
            if (candidate) {
                const formData = new FormData();
                formData.append('document', candidate);
                const res = await requestWithRefresh((headers) => apiClient.post('/upload/', formData, {
                    headers: { ...headers, 'Content-Type': 'multipart/form-data' },
                }));
                setFile(null);
                startPollingTask(res.data.task_id, label);
            } else {
                const res = await requestWithRefresh((headers) =>
                    apiClient.post('/upload-url/', { url: normalizedUrl }, { headers }));
                setUrl('');
                startPollingTask(res.data.task_id, label);
            }
        } catch (err) {
            const reason = err.response?.data?.error || 'Upload failed.';
            if (candidate) setFileError(reason);
            else setUrlError(reason);
            setFailedUpload(
                candidate
                    ? { kind: 'file', file: candidate, reason }
                    : { kind: 'url', url: normalizedUrl, reason }
            );
            pushNotice('error', reason);
        } finally {
            setUploading(false);
        }
    }, [pushNotice, startPollingTask]);

    const handleUploadSubmit = (event) => {
        event.preventDefault();
        if (uploading) return;
        startUpload(file, null);
    };

    const handleUrlSubmit = (event) => {
        event.preventDefault();
        if (uploading) return;
        const normalizedUrl = normalizeHttpUrl(url);
        if (!normalizedUrl) {
            setUrlError('Enter a full http:// or https:// address.');
            return;
        }
        startUpload(null, normalizedUrl);
    };

    /* ---------- Rename ---------- */

    const handleRenameStart = (filename) => {
        setOpenMenu(null);
        setRenaming({ original: filename, value: filename, error: '' });
        renameBusyRef.current = false;
        renameCancelledRef.current = false;
        renameAttemptedRef.current = '';
        renameErrorRef.current = '';
    };

    const handleRenameCancel = useCallback(() => {
        renameCancelledRef.current = true;
        renameBusyRef.current = false;
        setRenaming(null);
    }, []);

    /* source is 'enter' or 'blur'. Blur only asks for a rename when the name
       really changed and the server has not already refused that exact name. */
    const commitRename = useCallback(async (original, value, source) => {
        // Enter fires the request and the input then blurs, so the busy and
        // cancelled flags are what keep that second ask from happening.
        if (renameCancelledRef.current || renameBusyRef.current) return;
        const newName = (value || '').trim();

        // An unchanged or empty name is a cancel, not a request.
        if (!newName || newName === original) {
            handleRenameCancel();
            return;
        }

        if (source === 'blur' && newName === renameAttemptedRef.current) {
            // The server already refused this name. Close the editor and let
            // the notice carry the reason, rather than asking again.
            const message = renameErrorRef.current || 'Rename was rejected.';
            handleRenameCancel();
            pushNotice('error', message);
            return;
        }

        renameBusyRef.current = true;
        renameAttemptedRef.current = newName;
        renameErrorRef.current = '';
        setRenaming((current) => (current ? { ...current, error: '' } : current));

        try {
            await requestWithRefresh((headers) =>
                apiClient.patch(`/documents/${encodeURIComponent(original)}/rename/`, { new_name: newName }, { headers }));
            renameBusyRef.current = false;
            renameCancelledRef.current = true;
            setRenaming(null);
            pushNotice('success', `Renamed to "${newName}".`);
            await fetchDocs();
            focusRowAction(newName);
        } catch (err) {
            const message = err.response?.data?.error || 'Rename failed.';
            renameBusyRef.current = false;
            renameErrorRef.current = message;
            // The editor stays open so the typed name survives the error.
            setRenaming((current) => (current ? { ...current, error: message } : current));
        }
    }, [fetchDocs, focusRowAction, handleRenameCancel, pushNotice]);

    useEffect(() => {
        if (!renaming) return;
        const input = renameRef.current;
        if (!input) return;
        input.focus();
        // Select the stem, keep the extension out of the way.
        input.setSelectionRange(0, stemOf(renaming.original).length);
    }, [renaming]);

    const handleRenameKeyDown = (event, original) => {
        if (event.key === 'Enter') {
            event.preventDefault();
            commitRename(original, renaming?.value, 'enter');
        } else if (event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
            handleRenameCancel();
        }
    };

    /* ---------- Delete ---------- */

    /* Cancel, Escape, or an overlay click all put focus back on the row that
       opened the dialog, so the keyboard path never loses its place. */
    const closeDeleteDialog = useCallback(() => {
        if (deleting) return;
        const name = confirmDelete?.name;
        setConfirmDelete(null);
        if (name) focusRowAction(name);
    }, [confirmDelete, deleting, focusRowAction]);

    const handleDelete = useCallback(async () => {
        if (!confirmDelete || deleting) return;
        const { name, index } = confirmDelete;
        setDeleting(true);

        try {
            await requestWithRefresh((headers) => apiClient.delete(`/documents/${encodeURIComponent(name)}/`, { headers }));
            setConfirmDelete(null);
            setDeleting(false);
            pushNotice('success', `"${name}" deleted and the index rebuilt.`);
            onCollectionsChange?.();
            await fetchDocs();
            focusRowAtIndex(index);
        } catch (err) {
            setDeleting(false);
            pushNotice('error', err.response?.data?.error || 'Delete failed.');
            setConfirmDelete(null);
            focusRowAction(name);
        }
    }, [confirmDelete, deleting, fetchDocs, focusRowAction, focusRowAtIndex, onCollectionsChange, pushNotice]);

    const dialogRef = useRef(null);
    const cancelRef = useRef(null);

    useEffect(() => {
        if (!confirmDelete) return undefined;
        cancelRef.current?.focus();

        const onKeyDown = (event) => {
            if (event.key === 'Escape') {
                event.preventDefault();
                closeDeleteDialog();
                return;
            }
            if (event.key !== 'Tab') return;

            const nodes = dialogRef.current?.querySelectorAll(FOCUSABLE);
            if (!nodes || nodes.length === 0) {
                event.preventDefault();
                return;
            }
            const first = nodes[0];
            const last = nodes[nodes.length - 1];
            if (event.shiftKey && (document.activeElement === first || document.activeElement === dialogRef.current)) {
                event.preventDefault();
                last.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first.focus();
            }
        };

        document.addEventListener('keydown', onKeyDown);
        return () => document.removeEventListener('keydown', onKeyDown);
    }, [confirmDelete, closeDeleteDialog]);

    /* ---------- Move ---------- */

    /* The chip is the only control that opens this menu, so focus goes back
       to it whether the move landed or not. */
    const handleMoveToCollection = useCallback(async (filename, collectionId) => {
        setOpenMenu(null);
        try {
            const res = await requestWithRefresh((headers) =>
                apiClient.put(`/documents/${encodeURIComponent(filename)}/move/`, { collection_id: collectionId }, { headers }));
            const colName = res.data.collection;
            pushNotice(
                'success',
                colName ? `"${filename}" moved to ${colName}.` : `"${filename}" left its collection.`
            );
            await fetchDocs();
            focusCollectionChip(filename);
        } catch (err) {
            pushNotice('error', err.response?.data?.error || 'Move failed.');
            focusCollectionChip(filename);
        }
        onCollectionsChange?.();
    }, [fetchDocs, focusCollectionChip, onCollectionsChange, pushNotice]);

    /* ---------- Derived ---------- */

    /* The list endpoint sends no collection fields yet. Until one row carries
       one, the whole column stays out of the layout instead of guessing. */
    const supportsCollections = documents.some(
        (doc) => doc.collection_id != null || doc.collection_name != null
    );

    const collectionNameFor = (doc) => {
        if (doc.collection_name) return doc.collection_name;
        if (doc.collection_id == null) return null;
        const match = collections.find((c) => Number(c.id) === Number(doc.collection_id));
        return match ? match.name : null;
    };

    const busy = uploading || Boolean(taskInfo);
    const retryUpload = () => {
        if (!failedUpload) return;
        if (failedUpload.kind === 'file' && failedUpload.file) {
            startUpload(failedUpload.file, null);
        } else if (failedUpload.kind === 'url' && failedUpload.url) {
            startUpload(null, failedUpload.url);
        } else {
            setFailedUpload(null);
        }
    };

    return (
        <div className="doc-page">
            <header className="doc-page-header">
                <div className="doc-page-heading">
                    <h2 className="doc-page-title">Documents</h2>
                    <p className="doc-page-subtitle">
                        Everything the index can answer from. Drop a file in or point it at a URL.
                    </p>
                </div>
                {documents.length > 0 && (
                    <span className="dm-badge dm-badge-neutral doc-page-count">
                        {documents.length} {documents.length === 1 ? 'file' : 'files'}
                    </span>
                )}
            </header>

            {/* Each notice carries its own live-region role, so the stack does
                not add an aria-live of its own. Nesting the two makes screen
                readers say everything twice. */}
            {notices.length > 0 && (
                <div className="doc-notices">
                    {notices.map((notice) => (
                        <div
                            key={notice.id}
                            className={`dm-toast dm-toast-${notice.tone}`}
                            role={notice.tone === 'error' ? 'alert' : 'status'}
                        >
                            <span className="material-symbols-outlined doc-notice-glyph" aria-hidden="true">
                                {notice.tone === 'success' ? 'check_circle' : 'error'}
                            </span>
                            <span className="doc-notice-text">{notice.text}</span>
                            <button
                                type="button"
                                className="dm-btn dm-btn-ghost dm-btn-sm dm-btn-icon doc-notice-dismiss"
                                aria-label="Dismiss message"
                                onClick={() => dismissNotice(notice.id)}
                            >
                                <span className="material-symbols-outlined" aria-hidden="true">close</span>
                            </button>
                        </div>
                    ))}
                </div>
            )}

            {/* ---------- Dropzone ---------- */}

            <form className="doc-upload-form" onSubmit={handleUploadSubmit} noValidate>
                {/* The dropzone is a real button, so Enter and Space work without
                    a key handler and it appears in the tab order once. The file
                    input sits beside it, not inside it: a file input nested in a
                    button is invalid, and the drop handlers need the button to
                    be the only thing that opens the picker. */}
                <button
                    type="button"
                    className={`doc-dropzone${dragActive ? ' is-dragging' : ''}${fileError ? ' is-invalid' : ''}`}
                    aria-describedby="doc-dropzone-hint"
                    onClick={pickFile}
                    onDragEnter={handleDragEnter}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                >
                    <span className="material-symbols-outlined doc-dropzone-glyph" aria-hidden="true">upload_file</span>

                    <span className="doc-dropzone-title">
                        {file ? file.name : 'Drop a file here, or press Enter to choose one'}
                    </span>
                    <span className="doc-dropzone-hint" id="doc-dropzone-hint">
                        {file
                            ? `${formatBytes(file.size) || 'Ready'} in ${fileTypeOf(file.name).label}. Choose another.`
                            : `${SUPPORTED_HINT} up to ${formatBytes(MAX_UPLOAD_BYTES)}`}
                    </span>
                </button>

                <input
                    ref={fileInputRef}
                    className="visually-hidden"
                    type="file"
                    accept={SUPPORTED_EXTENSIONS.join(',')}
                    onChange={handleFileInput}
                    tabIndex={-1}
                />

                {fileError && (
                    <p className="dm-error-text doc-dropzone-error" role="alert">
                        <span className="material-symbols-outlined" aria-hidden="true">error</span>
                        <span>{fileError}</span>
                    </p>
                )}

                <div className="doc-upload-actions">
                    <button
                        type="submit"
                        className="dm-btn dm-btn-primary"
                        disabled={busy || !file}
                    >
                        <span className="material-symbols-outlined" aria-hidden="true">upload</span>
                        {uploading ? 'Uploading' : 'Upload'}
                    </button>
                    {file && !busy && (
                        <button
                            type="button"
                            className="dm-btn dm-btn-ghost"
                            onClick={() => { setFile(null); setFileError(''); }}
                        >
                            Clear
                        </button>
                    )}
                </div>
            </form>

            {/* ---------- URL ---------- */}

            <form className="doc-url-form" onSubmit={handleUrlSubmit} noValidate>
                <div className="doc-url-field">
                    <label className="dm-label" htmlFor="doc-url-input">Or ingest a page</label>
                    <div className="doc-url-controls">
                        <input
                            id="doc-url-input"
                            className="dm-input doc-url-input"
                            type="url"
                            inputMode="url"
                            placeholder="https://example.com/article"
                            value={url}
                            aria-invalid={urlError ? 'true' : undefined}
                            aria-describedby={urlError ? 'doc-url-error' : undefined}
                            onChange={(event) => { setUrl(event.target.value); setUrlError(''); }}
                        />
                        <button type="submit" className="dm-btn dm-btn-secondary" disabled={busy || !url.trim()}>
                            <span className="material-symbols-outlined" aria-hidden="true">link</span>
                            Ingest
                        </button>
                    </div>
                </div>
                {urlError && (
                    <p className="dm-error-text doc-url-error" id="doc-url-error" role="alert">
                        <span className="material-symbols-outlined" aria-hidden="true">error</span>
                        <span>{urlError}</span>
                    </p>
                )}
            </form>

            {/* ---------- Progress ---------- */}

            {taskInfo && (
                <section className="doc-progress" aria-label="Upload progress">
                    <div className="doc-progress-head">
                        <span className="dm-spinner doc-progress-spinner" aria-hidden="true" />
                        <span className="doc-progress-label">
                            {taskInfo.label ? `${taskInfo.label} ` : ''}indexing
                        </span>
                        <span className="doc-progress-status">{taskInfo.status}</span>
                    </div>
                    <div
                        className="doc-progress-track"
                        role="progressbar"
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-valuenow={Math.round(taskInfo.progress)}
                        aria-valuetext={`${Math.round(taskInfo.progress)} percent, ${taskInfo.status}`}
                        aria-label={`Indexing ${taskInfo.label || 'upload'}`}
                    >
                        <div className="doc-progress-fill" style={{ width: `${taskInfo.progress}%` }} />
                    </div>
                    <p className="doc-progress-message">
                        {taskInfo.message || taskInfo.error || `${Math.round(taskInfo.progress)} percent complete.`}
                    </p>
                </section>
            )}

            {/* A failed upload gets one verb. */}
            {failedUpload && !taskInfo && (
                <div className="doc-upload-failed" role="alert">
                    <span className="material-symbols-outlined doc-upload-failed-glyph" aria-hidden="true">error</span>
                    <div className="doc-upload-failed-body">
                        <p className="doc-upload-failed-title">
                            {failedUpload.kind === 'url' ? 'URL ingest did not finish' : 'Upload did not finish'}
                        </p>
                        <p className="doc-upload-failed-reason">{failedUpload.reason}</p>
                    </div>
                    <div className="doc-upload-failed-actions">
                        {(failedUpload.kind === 'file' || failedUpload.kind === 'url') && (
                            <button type="button" className="dm-btn dm-btn-secondary dm-btn-sm" onClick={retryUpload}>
                                Retry
                            </button>
                        )}
                        <button
                            type="button"
                            className="dm-btn dm-btn-ghost dm-btn-sm"
                            onClick={() => setFailedUpload(null)}
                        >
                            Dismiss
                        </button>
                    </div>
                </div>
            )}

            {/* ---------- List ---------- */}

            <section className="doc-list" aria-labelledby="doc-list-heading">
                <h3 className="doc-list-heading" id="doc-list-heading" tabIndex={-1} ref={listHeadingRef}>
                    {documents.length > 0 ? 'Indexed files' : 'Your documents'}
                </h3>

                {loading && documents.length === 0 && (
                    <ul className="doc-rows">
                        {[0, 1, 2].map((row) => (
                            <li className="doc-row doc-row-loading" key={`skeleton-${row}`} aria-hidden="true">
                                <span className="dm-skeleton doc-skeleton-badge" />
                                <span className="dm-skeleton doc-skeleton-name" />
                                <span className="dm-skeleton doc-skeleton-meta" />
                            </li>
                        ))}
                    </ul>
                )}

                {!loading && documents.length === 0 && (
                    <div className="dm-empty-state doc-empty">
                        <span className="dm-empty-state-icon material-symbols-outlined" aria-hidden="true">note_stack</span>
                        <p className="dm-empty-state-title">Nothing indexed yet</p>
                        <p className="dm-empty-state-body">
                            Upload a TXT, MD, PDF, or DOCX file and it becomes searchable. Ingesting a URL works the same way.
                        </p>
                        <div className="dm-empty-state-action">
                            <button type="button" className="dm-btn dm-btn-primary" onClick={pickFile}>
                                <span className="material-symbols-outlined" aria-hidden="true">upload_file</span>
                                Upload a document
                            </button>
                        </div>
                    </div>
                )}

                {documents.length > 0 && (
                    <ul className="doc-rows">
                        {documents.map((doc, index) => {
                            const info = fileTypeOf(doc.name);
                            const size = formatBytes(doc.size_bytes);
                            const date = formatDate(doc);
                            const collectionName = supportsCollections ? collectionNameFor(doc) : undefined;
                            const isRenaming = renaming?.original === doc.name;
                            const actionsOpen = openMenu?.name === doc.name && openMenu.kind === 'actions';
                            const collectionOpen = openMenu?.name === doc.name && openMenu.kind === 'collection';

                            return (
                                <li
                                    className={`doc-row${isRenaming ? ' is-editing' : ''}`}
                                    key={doc.name}
                                    data-doc-index={index}
                                >
                                    <span className="dm-badge doc-type" data-type={info.glyph}>
                                        <span className="material-symbols-outlined" aria-hidden="true">{info.glyph}</span>
                                        <span className="doc-type-label">{info.label}</span>
                                    </span>

                                    <div className="doc-row-main">
                                        {isRenaming ? (
                                            <div className="doc-rename">
                                                <input
                                                    ref={renameRef}
                                                    className="dm-input doc-rename-input"
                                                    type="text"
                                                    value={renaming.value}
                                                    aria-label={`Rename ${doc.name}`}
                                                    aria-invalid={renaming.error ? 'true' : undefined}
                                                    spellCheck={false}
                                                    autoComplete="off"
                                                    onChange={(event) =>
                                                        setRenaming((current) =>
                                                            current ? { ...current, value: event.target.value, error: '' } : current)}
                                                    onKeyDown={(event) => handleRenameKeyDown(event, doc.name)}
                                                    onBlur={() => commitRename(doc.name, renaming.value, 'blur')}
                                                />
                                            </div>
                                        ) : (
                                            <button
                                                type="button"
                                                className="doc-name"
                                                onClick={() => handleRenameStart(doc.name)}
                                                title="Rename"
                                            >
                                                {doc.name}
                                            </button>
                                        )}

                                        <p className="doc-meta">
                                            {size || 'Size unknown'}
                                            {date && <span className="doc-meta-sep" aria-hidden="true">/</span>}
                                            {date}
                                        </p>

                                        {isRenaming && renaming.error && (
                                            <p className="dm-error-text doc-row-error" role="alert">
                                                <span className="material-symbols-outlined" aria-hidden="true">error</span>
                                                <span>{renaming.error}</span>
                                            </p>
                                        )}
                                    </div>

                                    {supportsCollections && (
                                        <div className="doc-menu-anchor doc-collection-cell">
                                            <button
                                                type="button"
                                                className={`doc-collection-chip${collectionName ? ' has-collection' : ''}`}
                                                data-doc-collection-trigger={doc.name}
                                                aria-haspopup="menu"
                                                aria-expanded={collectionOpen}
                                                onClick={() =>
                                                    setOpenMenu(
                                                        collectionOpen ? null : { name: doc.name, kind: 'collection' }
                                                    )}
                                            >
                                                <span className="material-symbols-outlined" aria-hidden="true">
                                                    {collectionName ? 'folder' : 'folder_off'}
                                                </span>
                                                <span className="doc-collection-chip-label">
                                                    {collectionName || 'No collection'}
                                                </span>
                                                <span className="material-symbols-outlined doc-collection-caret" aria-hidden="true">
                                                    expand_more
                                                </span>
                                            </button>

                                            {collectionOpen && (
                                                <div className="dm-menu doc-menu" role="menu" aria-label="Move to collection">
                                                    <p className="dm-menu-label">Move to</p>
                                                    {collections.length === 0 && (
                                                        <span className="doc-menu-empty">No collections yet</span>
                                                    )}
                                                    {collections.map((collection) => (
                                                        <button
                                                            type="button"
                                                            className="dm-menu-item"
                                                            role="menuitemradio"
                                                            aria-checked={Number(collection.id) === Number(doc.collection_id)}
                                                            key={collection.id}
                                                            onClick={() => handleMoveToCollection(doc.name, collection.id)}
                                                        >
                                                            <span className="material-symbols-outlined doc-menu-check" aria-hidden="true">
                                                                {Number(collection.id) === Number(doc.collection_id) ? 'check' : 'radio_button_unchecked'}
                                                            </span>
                                                            <span className="doc-menu-item-text">{collection.name}</span>
                                                        </button>
                                                    ))}
                                                    <hr className="dm-divider" />
                                                    <button
                                                        type="button"
                                                        className="dm-menu-item"
                                                        role="menuitem"
                                                        disabled={doc.collection_id == null}
                                                        onClick={() => handleMoveToCollection(doc.name, null)}
                                                    >
                                                        <span className="material-symbols-outlined doc-menu-check" aria-hidden="true">remove_circle</span>
                                                        <span className="doc-menu-item-text">Remove from collection</span>
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    <div className="doc-menu-anchor doc-row-actions">
                                        <button
                                            type="button"
                                            className="dm-btn dm-btn-ghost dm-btn-sm dm-btn-icon doc-row-menu-button"
                                            data-doc-action={doc.name}
                                            aria-haspopup="menu"
                                            aria-expanded={actionsOpen}
                                            aria-label={`Actions for ${doc.name}`}
                                            title="Actions"
                                            onClick={() =>
                                                setOpenMenu(actionsOpen ? null : { name: doc.name, kind: 'actions' })}
                                        >
                                            <span className="material-symbols-outlined" aria-hidden="true">more_horiz</span>
                                        </button>

                                        {actionsOpen && (
                                            <div className="dm-menu doc-menu" role="menu" aria-label={`Actions for ${doc.name}`}>
                                                <button
                                                    type="button"
                                                    className="dm-menu-item"
                                                    role="menuitem"
                                                    onClick={() => { setOpenMenu(null); setPreviewName(doc.name); }}
                                                >
                                                    <span className="material-symbols-outlined" aria-hidden="true">visibility</span>
                                                    Preview
                                                </button>
                                                <button
                                                    type="button"
                                                    className="dm-menu-item"
                                                    role="menuitem"
                                                    onClick={() => handleRenameStart(doc.name)}
                                                >
                                                    <span className="material-symbols-outlined" aria-hidden="true">edit</span>
                                                    Rename
                                                </button>
                                                <hr className="dm-divider" />
                                                <button
                                                    type="button"
                                                    className="dm-menu-item dm-menu-item-danger"
                                                    role="menuitem"
                                                    onClick={() => {
                                                        setOpenMenu(null);
                                                        setConfirmDelete({ name: doc.name, index });
                                                    }}
                                                >
                                                    <span className="material-symbols-outlined" aria-hidden="true">delete</span>
                                                    Delete
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                </li>
                            );
                        })}
                    </ul>
                )}
            </section>

            {/* ---------- Delete confirmation ---------- */}

            {confirmDelete && (
                <div
                    className="dm-modal-overlay"
                    onClick={closeDeleteDialog}
                    role="presentation"
                >
                    <div
                        ref={dialogRef}
                        className="dm-modal doc-delete-dialog"
                        role="alertdialog"
                        aria-modal="true"
                        aria-labelledby="doc-delete-title"
                        aria-describedby="doc-delete-consequence"
                        tabIndex={-1}
                        onClick={(event) => event.stopPropagation()}
                    >
                        <div className="dm-modal-header">
                            <h3 className="dm-modal-title" id="doc-delete-title">Delete this document?</h3>
                            <button
                                type="button"
                                className="dm-btn dm-btn-ghost dm-btn-sm dm-btn-icon"
                                aria-label="Close"
                                disabled={deleting}
                                onClick={closeDeleteDialog}
                            >
                                <span className="material-symbols-outlined" aria-hidden="true">close</span>
                            </button>
                        </div>

                        <div className="dm-modal-body">
                            <p className="doc-delete-name">{confirmDelete.name}</p>
                            <ul className="doc-delete-consequence" id="doc-delete-consequence">
                                <li>The file is removed from your document store.</li>
                                <li>The search index is rebuilt without it.</li>
                                <li>This cannot be undone.</li>
                            </ul>
                        </div>

                        <div className="dm-modal-actions">
                            <button
                                ref={cancelRef}
                                type="button"
                                className="dm-btn dm-btn-secondary"
                                onClick={closeDeleteDialog}
                                disabled={deleting}
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                className="dm-btn dm-btn-danger"
                                onClick={handleDelete}
                                disabled={deleting}
                            >
                                {deleting
                                    ? <><span className="dm-spinner" aria-hidden="true" /> Deleting</>
                                    : <><span className="material-symbols-outlined" aria-hidden="true">delete</span> Delete</>}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {previewName && <DocumentPreview name={previewName} onClose={() => setPreviewName(null)} />}
        </div>
    );
}

export default Documents;

import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import { useTask } from '../lib/useTask';
import type {
  Collection,
  DocumentInfo,
  DocumentPreview,
  StatusInfo,
  TaskInfo,
} from '../types';
import { useToast } from '../state/toast';
import { Icon } from '../components/Icon';
import { Modal } from '../components/Modal';
import { Drawer } from '../components/Drawer';
import { formatBytes, formatFullDate, formatNumber, formatWhen, isAllowedFile } from '../lib/format';

interface ActiveTask {
  taskId: string;
  label: string;
}

export function Documents() {
  const toast = useToast();

  const [documents, setDocuments] = useState<DocumentInfo[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [status, setStatus] = useState<StatusInfo | null>(null);
  const [tasks, setTasks] = useState<ActiveTask[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [urlValue, setUrlValue] = useState('');

  const [preview, setPreview] = useState<DocumentPreview | null>(null);
  const [renaming, setRenaming] = useState<DocumentInfo | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [moving, setMoving] = useState<DocumentInfo | null>(null);
  const [moveTarget, setMoveTarget] = useState<number | null>(null);
  const [deleting, setDeleting] = useState<DocumentInfo | null>(null);
  const [collEditor, setCollEditor] = useState<{ collection: Collection | null } | null>(null);
  const [collName, setCollName] = useState('');
  const [collDesc, setCollDesc] = useState('');
  const [deletingColl, setDeletingColl] = useState<Collection | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    try {
      const [docs, colls] = await Promise.all([api.documents.list(), api.collections.list()]);
      setDocuments(docs.documents);
      setCollections(colls.collections);
    } catch (err) {
      toast.push(err instanceof Error ? err.message : 'Could not load documents.', 'error');
    }
  }, [toast]);

  useEffect(() => {
    void refresh();
    api.status
      .get()
      .then(setStatus)
      .catch(() => setStatus(null));
  }, [refresh]);

  const trackTask = useCallback((taskId: string, label: string) => {
    setTasks((current) => [...current, { taskId, label }]);
  }, []);

  const onTaskTerminal = useCallback(
    (task: TaskInfo) => {
      void refresh();
      api.status
        .get()
        .then(setStatus)
        .catch(() => {});
      if (task.status === 'completed') {
        toast.push(task.message || `"${task.task_type}" finished.`, 'success');
        window.setTimeout(() => {
          setTasks((current) => current.filter((t) => t.taskId !== task.task_id));
        }, 2600);
      } else if (task.status === 'failed') {
        toast.push(task.error || task.message || 'The task failed.', 'error');
      }
    },
    [refresh, toast],
  );

  const uploadFiles = useCallback(
    async (files: FileList | File[]) => {
      const list = Array.from(files);
      const rejected = list.filter((file) => !isAllowedFile(file.name));
      const accepted = list.filter((file) => isAllowedFile(file.name));
      if (rejected.length > 0) {
        toast.push(
          `Skipped ${rejected.length} unsupported ${rejected.length === 1 ? 'file' : 'files'}: ${rejected
            .map((f) => f.name)
            .join(', ')}`,
          'error',
        );
      }
      for (const file of accepted) {
        try {
          const res = await api.documents.upload(file);
          trackTask(res.task_id, file.name);
        } catch (err) {
          toast.push(
            err instanceof Error ? err.message : `"${file.name}" could not be uploaded.`,
            'error',
          );
        }
      }
    },
    [toast, trackTask],
  );

  const submitUrl = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      const url = urlValue.trim();
      if (!url) return;
      try {
        const res = await api.ingestUrl(url);
        trackTask(res.task_id, url);
        setUrlValue('');
      } catch (err) {
        toast.push(err instanceof Error ? err.message : 'Could not queue that URL.', 'error');
      }
    },
    [urlValue, toast, trackTask],
  );

  const reindex = useCallback(async () => {
    try {
      const res = await api.ingest();
      trackTask(res.task_id, 'Rebuilding the search index');
      toast.push('Index rebuild queued.', 'info');
    } catch (err) {
      toast.push(err instanceof Error ? err.message : 'Could not start the rebuild.', 'error');
    }
  }, [toast, trackTask]);

  const submitRename = useCallback(async () => {
    if (!renaming) return;
    try {
      await api.documents.rename(renaming.name, renameValue.trim());
      setRenaming(null);
      void refresh();
      toast.push('Document renamed.', 'success');
    } catch (err) {
      toast.push(err instanceof Error ? err.message : 'Rename failed.', 'error');
    }
  }, [renaming, renameValue, refresh, toast]);

  const openMove = useCallback(
    (doc: DocumentInfo) => {
      setMoving(doc);
      setMoveTarget(doc.collection_id);
    },
    [],
  );

  const submitMove = useCallback(async () => {
    if (!moving) return;
    try {
      await api.documents.move(moving.name, moveTarget);
      setMoving(null);
      void refresh();
      toast.push('Document moved.', 'success');
    } catch (err) {
      toast.push(err instanceof Error ? err.message : 'Move failed.', 'error');
    }
  }, [moving, moveTarget, refresh, toast]);

  const submitDelete = useCallback(async () => {
    if (!deleting) return;
    try {
      await api.documents.remove(deleting.name);
      setDeleting(null);
      void refresh();
      api.status
        .get()
        .then(setStatus)
        .catch(() => {});
      toast.push('Document deleted and the index rebuilt.', 'success');
    } catch (err) {
      toast.push(err instanceof Error ? err.message : 'Delete failed.', 'error');
    }
  }, [deleting, refresh, toast]);

  const openPreview = useCallback(
    async (doc: DocumentInfo) => {
      try {
        setPreview(await api.documents.preview(doc.name));
      } catch (err) {
        toast.push(err instanceof Error ? err.message : 'Preview failed.', 'error');
      }
    },
    [toast],
  );

  const submitCollection = useCallback(async () => {
    const name = collName.trim();
    if (!name) return;
    try {
      if (collEditor?.collection) {
        await api.collections.update(collEditor.collection.id, {
          name,
          description: collDesc,
        });
        toast.push('Collection updated.', 'success');
      } else {
        await api.collections.create(name, collDesc);
        toast.push('Collection created.', 'success');
      }
      setCollEditor(null);
      setCollName('');
      setCollDesc('');
      void refresh();
    } catch (err) {
      toast.push(err instanceof Error ? err.message : 'Could not save the collection.', 'error');
    }
  }, [collName, collDesc, collEditor, refresh, toast]);

  const submitDeleteCollection = useCallback(async () => {
    if (!deletingColl) return;
    try {
      const res = await api.collections.remove(deletingColl.id);
      setDeletingColl(null);
      void refresh();
      toast.push(res.message, 'success');
    } catch (err) {
      toast.push(err instanceof Error ? err.message : 'Delete failed.', 'error');
    }
  }, [deletingColl, refresh, toast]);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Documents</h1>
          <p className="page-sub">
            Files and web pages you have indexed. Answers cite these, so keep the list current.
          </p>
        </div>
        <div className="page-actions">
          <button type="button" className="btn btn-ghost" onClick={() => void reindex()}>
            <Icon name="refresh" size={15} />
            Rebuild index
          </button>
        </div>
      </div>

      {status && (
        <div className="index-card">
          <div className="index-stat">
            <div className="num">{formatNumber(status.vector_database.total_chunks)}</div>
            <div className="lbl">chunks indexed</div>
          </div>
          <div className="index-stat">
            <div className="num">{formatNumber(status.vector_database.total_documents)}</div>
            <div className="lbl">documents</div>
          </div>
          <div className="index-stat">
            <div className="num">{status.vector_database.embedding_dimension}</div>
            <div className="lbl">embedding dimensions</div>
          </div>
          <div className="index-side">
            <span className={`status-dot${status.status === 'ok' ? '' : ' degraded'}`}>
              {status.status === 'ok' ? 'Index ready' : 'Index empty'}
            </span>
          </div>
        </div>
      )}

      <div
        className={`dropzone${dragOver ? ' drag' : ''}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          if (e.dataTransfer.files.length > 0) void uploadFiles(e.dataTransfer.files);
        }}
      >
        <Icon name="upload" size={22} />
        <p className="dz-main">Drop files here, or browse from your computer</p>
        <p className="dz-hint">{status?.supported_formats.join('  ') ?? '.pdf  .docx  .md  .txt'}</p>
        <button
          type="button"
          className="btn btn-primary btn-sm"
          onClick={() => fileInputRef.current?.click()}
        >
          Browse files
        </button>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".txt,.md,.pdf,.docx"
          hidden
          onChange={(e) => {
            if (e.target.files && e.target.files.length > 0) void uploadFiles(e.target.files);
            e.target.value = '';
          }}
        />
      </div>

      <form className="url-row" onSubmit={submitUrl}>
        <label className="lbl" htmlFor="ingest-url">
          <Icon name="globe" size={14} style={{ display: 'inline', verticalAlign: '-2px' }} /> Or add
          from the web
        </label>
        <input
          id="ingest-url"
          className="input"
          type="url"
          placeholder="https://en.wikipedia.org/wiki/Retrieval-augmented_generation"
          value={urlValue}
          onChange={(e) => setUrlValue(e.target.value)}
        />
        <button type="submit" className="btn btn-ghost" disabled={!urlValue.trim()}>
          Fetch and index
        </button>
      </form>

      {tasks.map((task) => (
        <TaskStrip
          key={task.taskId}
          taskId={task.taskId}
          label={task.label}
          onTerminal={onTaskTerminal}
          onDismiss={() =>
            setTasks((current) => current.filter((t) => t.taskId !== task.taskId))
          }
        />
      ))}

      <div className="panel" style={{ padding: 0 }}>
        {documents.length === 0 ? (
          <div className="empty">
            <h3>Nothing indexed yet</h3>
            <p>
              Upload a PDF, Word file, Markdown, or text file above. Everything in DocuMind starts
              from your documents.
            </p>
          </div>
        ) : (
          <div className="table-scroll">
            <table className="table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Collection</th>
                  <th>Size</th>
                  <th>Added</th>
                  <th style={{ width: 150 }} aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {documents.map((doc) => (
                  <tr key={doc.name}>
                    <td className="file-name">{doc.name}</td>
                    <td>
                      {doc.collection_name ? (
                        <span className="tag">
                          <Icon name="folder" size={11} />
                          <span className="label">{doc.collection_name}</span>
                        </span>
                      ) : (
                        <span className="tag tag-neutral">Unfiled</span>
                      )}
                    </td>
                    <td className="mono">{formatBytes(doc.size_bytes)}</td>
                    <td className="muted">{formatWhen(doc.uploaded_at)}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 2, justifyContent: 'flex-end' }}>
                        <button
                          type="button"
                          className="btn-icon"
                          title="Preview content"
                          onClick={() => void openPreview(doc)}
                        >
                          <Icon name="eye" size={15} />
                        </button>
                        <button
                          type="button"
                          className="btn-icon"
                          title="Rename"
                          onClick={() => {
                            setRenaming(doc);
                            setRenameValue(doc.name);
                          }}
                        >
                          <Icon name="pencil" size={15} />
                        </button>
                        <button
                          type="button"
                          className="btn-icon"
                          title="Move to collection"
                          onClick={() => openMove(doc)}
                        >
                          <Icon name="folder" size={15} />
                        </button>
                        <button
                          type="button"
                          className="btn-icon danger"
                          title="Delete"
                          onClick={() => setDeleting(doc)}
                        >
                          <Icon name="trash" size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <section className="coll-section">
        <h2>Collections</h2>
        <p className="sect-sub">
          Group related documents. A collection is a filing label, not a boundary: chat searches all
          of them together.
        </p>
        <div className="coll-grid">
          {collections.map((collection) => (
            <div key={collection.id} className="coll-card">
              <h3>{collection.name}</h3>
              <p className="desc">{collection.description || 'No description.'}</p>
              <div className="coll-foot">
                <span className="count">
                  {collection.document_count}{' '}
                  {collection.document_count === 1 ? 'document' : 'documents'}
                </span>
                <span style={{ display: 'flex' }}>
                  <button
                    type="button"
                    className="btn-icon"
                    title="Edit collection"
                    onClick={() => {
                      setCollEditor({ collection });
                      setCollName(collection.name);
                      setCollDesc(collection.description);
                    }}
                  >
                    <Icon name="pencil" size={14} />
                  </button>
                  <button
                    type="button"
                    className="btn-icon danger"
                    title="Delete collection"
                    onClick={() => setDeletingColl(collection)}
                  >
                    <Icon name="trash" size={14} />
                  </button>
                </span>
              </div>
            </div>
          ))}
          <button
            type="button"
            className="coll-card coll-add"
            onClick={() => {
              setCollEditor({ collection: null });
              setCollName('');
              setCollDesc('');
            }}
          >
            <Icon name="plus" size={18} />
            New collection
          </button>
        </div>
      </section>

      {/* preview drawer */}
      <Drawer
        open={preview !== null}
        onClose={() => setPreview(null)}
        title={preview?.name ?? 'Preview'}
        sub={preview ? `${formatBytes(preview.size_bytes)} saved ${formatFullDate(preview.uploaded_at)}` : undefined}
      >
        {preview && (
          <div className="preview-body">
            <div className="meta-line">
              <span>{preview.extension.replace('.', '').toUpperCase()} file</span>
              <span>
                {formatNumber(preview.total_characters)} characters extracted
              </span>
            </div>
            <div className="quote">{preview.content}</div>
            {preview.truncated && (
              <p className="truncated-note">
                Showing the first {formatNumber(preview.content.length)} characters of{' '}
                {formatNumber(preview.total_characters)}. The full text is still indexed and
                searchable.
              </p>
            )}
          </div>
        )}
      </Drawer>

      {/* rename modal */}
      <Modal
        open={renaming !== null}
        onClose={() => setRenaming(null)}
        title="Rename document"
        footer={
          <>
            <button type="button" className="btn btn-ghost" onClick={() => setRenaming(null)}>
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => void submitRename()}
              disabled={!renameValue.trim()}
            >
              Save name
            </button>
          </>
        }
      >
        <div className="field">
          <label htmlFor="doc-rename">File name</label>
          <input
            id="doc-rename"
            className="input"
            value={renameValue}
            autoFocus
            onChange={(e) => setRenameValue(e.target.value)}
          />
          <span className="field-hint">Keep the extension. The search index is rebuilt after a rename.</span>
        </div>
      </Modal>

      {/* move modal */}
      <Modal
        open={moving !== null}
        onClose={() => setMoving(null)}
        title={`Move "${moving?.name ?? ''}"`}
        footer={
          <>
            <button type="button" className="btn btn-ghost" onClick={() => setMoving(null)}>
              Cancel
            </button>
            <button type="button" className="btn btn-primary" onClick={() => void submitMove()}>
              Move document
            </button>
          </>
        }
      >
        <div className="move-list">
          <button
            type="button"
            className={`move-opt${moveTarget === null ? ' selected' : ''}`}
            onClick={() => setMoveTarget(null)}
          >
            Unfiled
            <span className="cnt">no collection</span>
          </button>
          {collections.map((collection) => (
            <button
              key={collection.id}
              type="button"
              className={`move-opt${moveTarget === collection.id ? ' selected' : ''}`}
              onClick={() => setMoveTarget(collection.id)}
            >
              {collection.name}
              <span className="cnt">{collection.document_count} documents</span>
            </button>
          ))}
        </div>
      </Modal>

      {/* delete document modal */}
      <Modal
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        title="Delete this document?"
        footer={
          <>
            <button type="button" className="btn btn-ghost" onClick={() => setDeleting(null)}>
              Keep it
            </button>
            <button type="button" className="btn btn-danger" onClick={() => void submitDelete()}>
              Delete document
            </button>
          </>
        }
      >
        <p className="modal-body">
          {deleting
            ? `"${deleting.name}" will be removed from disk and the search index will rebuild without it. Conversations that cited it keep their citations, marked as unavailable.`
            : ''}
        </p>
      </Modal>

      {/* collection create/edit modal */}
      <Modal
        open={collEditor !== null}
        onClose={() => setCollEditor(null)}
        title={collEditor?.collection ? 'Edit collection' : 'New collection'}
        footer={
          <>
            <button type="button" className="btn btn-ghost" onClick={() => setCollEditor(null)}>
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => void submitCollection()}
              disabled={!collName.trim()}
            >
              Save collection
            </button>
          </>
        }
      >
        <div className="form-grid">
          <div className="field">
            <label htmlFor="coll-name">Name</label>
            <input
              id="coll-name"
              className="input"
              value={collName}
              autoFocus
              onChange={(e) => setCollName(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="coll-desc">Description</label>
            <textarea
              id="coll-desc"
              className="input"
              rows={2}
              value={collDesc}
              onChange={(e) => setCollDesc(e.target.value)}
            />
          </div>
        </div>
      </Modal>

      {/* delete collection modal */}
      <Modal
        open={deletingColl !== null}
        onClose={() => setDeletingColl(null)}
        title={`Delete "${deletingColl?.name ?? ''}"?`}
        footer={
          <>
            <button type="button" className="btn btn-ghost" onClick={() => setDeletingColl(null)}>
              Keep it
            </button>
            <button
              type="button"
              className="btn btn-danger"
              onClick={() => void submitDeleteCollection()}
            >
              Delete collection
            </button>
          </>
        }
      >
        <p className="modal-body">
          The collection itself is removed. Its {deletingColl?.document_count ?? 0}{' '}
          {deletingColl?.document_count === 1 ? 'document goes' : 'documents go'} back to Unfiled,
          so nothing is lost.
        </p>
      </Modal>
    </div>
  );
}

function TaskStrip({
  taskId,
  label,
  onTerminal,
  onDismiss,
}: {
  taskId: string;
  label: string;
  onTerminal: (task: TaskInfo) => void;
  onDismiss: () => void;
}) {
  const task = useTask(taskId, onTerminal);
  const done = task?.status === 'completed';
  const failed = task?.status === 'failed' || task?.status === 'cancelled';

  return (
    <div className={`task-strip${done ? ' done' : ''}${failed ? ' failed' : ''}`}>
      <Icon name={failed ? 'alert' : done ? 'check' : 'refresh'} size={16} />
      <span className="task-msg" title={label}>
        {task?.message || label}
      </span>
      {!done && !failed && (
        <>
          <div className="progress">
            <div className="progress-fill" style={{ width: `${task?.progress ?? 4}%` }} />
          </div>
          <span className="pct">{task?.progress ?? 0}%</span>
        </>
      )}
      {(done || failed) && (
        <button type="button" className="btn-icon" onClick={onDismiss} aria-label="Dismiss">
          <Icon name="x" size={14} />
        </button>
      )}
    </div>
  );
}

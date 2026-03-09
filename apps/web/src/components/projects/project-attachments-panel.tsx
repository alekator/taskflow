"use client";

import { useCallback, useEffect, useState } from "react";
import { useToast } from "../feedback/toast-provider";
import { getErrorDetails } from "../../lib/errors";
import {
  completeProjectAttachmentUpload,
  createProjectAttachmentUpload,
  deleteProjectAttachment,
  listProjectAttachments,
  type ProjectAttachment,
} from "../../lib/projects/api";

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function ProjectAttachmentsPanel({ projectId }: { projectId: string }) {
  const { notify } = useToast();
  const [items, setItems] = useState<ProjectAttachment[]>([]);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");
  const [mimeType, setMimeType] = useState("application/pdf");
  const [sizeBytes, setSizeBytes] = useState("2048");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const next = await listProjectAttachments(projectId);
      setItems(next);
    } catch (err) {
      const details = getErrorDetails(err);
      setError(details.message);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  const onCreate = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const safeName = fileName.trim();
    const parsedSize = Number(sizeBytes);
    if (!safeName || !Number.isFinite(parsedSize) || parsedSize <= 0) return;

    setPending(true);
    setError(null);
    try {
      const intent = await createProjectAttachmentUpload(projectId, {
        fileName: safeName,
        mimeType: mimeType.trim(),
        sizeBytes: parsedSize,
      });
      await completeProjectAttachmentUpload(
        projectId,
        intent.attachment.id,
        intent.uploadToken,
      );
      await load();
      setFileName("");
      setSizeBytes("2048");
      notify("success", "Project attachment uploaded");
    } catch (err) {
      const details = getErrorDetails(err);
      setError(details.message);
      notify("error", details.message);
    } finally {
      setPending(false);
    }
  };

  const onDelete = async (attachmentId: string) => {
    setPending(true);
    setError(null);
    try {
      await deleteProjectAttachment(projectId, attachmentId);
      await load();
      notify("success", "Attachment removed");
    } catch (err) {
      const details = getErrorDetails(err);
      setError(details.message);
      notify("error", details.message);
    } finally {
      setPending(false);
    }
  };

  return (
    <section className="item-card stack" data-testid="project-attachments-panel">
      <div className="panel-header panel-header-inline">
        <div>
          <h2>Project attachments</h2>
          <p className="soft">
            Store project-level docs and files visible to all project members.
          </p>
        </div>
        <span className="badge badge-neutral">{items.length} files</span>
      </div>

      <form className="auth-form auth-form-compact" onSubmit={onCreate}>
        <label>
          File name
          <input
            data-testid="project-attachment-name"
            placeholder="release-brief.pdf"
            value={fileName}
            onChange={(e) => setFileName(e.target.value)}
            minLength={1}
            maxLength={180}
            required
          />
        </label>
        <label>
          Mime type
          <input
            data-testid="project-attachment-mime"
            placeholder="application/pdf"
            value={mimeType}
            onChange={(e) => setMimeType(e.target.value)}
            minLength={3}
            maxLength={120}
            required
          />
        </label>
        <label>
          Size (bytes)
          <input
            data-testid="project-attachment-size"
            type="number"
            min={1}
            value={sizeBytes}
            onChange={(e) => setSizeBytes(e.target.value)}
            required
          />
        </label>
        <button
          type="submit"
          className="button button-primary"
          disabled={pending}
          data-testid="project-attachment-submit"
        >
          {pending ? "Uploading..." : "Upload"}
        </button>
      </form>

      {error ? <p className="error-text">{error}</p> : null}
      {loading ? <p className="meta">Loading attachments...</p> : null}
      {!loading && items.length === 0 ? (
        <div className="empty-state">No project attachments yet.</div>
      ) : null}

      {!loading && items.length > 0 ? (
        <ul className="stack">
          {items.map((item) => (
            <li key={item.id} className="projects-row">
              <div className="projects-row-main">
                <strong>{item.fileName}</strong>
              </div>
              <div className="projects-row-description">
                <span className="soft">{item.mimeType}</span>
              </div>
              <div className="projects-row-updated">
                <span className="meta">{formatFileSize(item.sizeBytes)}</span>
              </div>
              <div className="projects-row-actions">
                <button
                  type="button"
                  className="button button-ghost button-compact"
                  disabled={pending}
                  onClick={() => void onDelete(item.id)}
                >
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

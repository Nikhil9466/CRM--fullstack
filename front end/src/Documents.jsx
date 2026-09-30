import React, { useEffect, useRef, useState } from "react";
import { dateLabel } from "./util";
import "./documents.css";

const fileSize = (bytes) =>
  bytes < 1048576
    ? `${Math.max(1, Math.ceil(bytes / 1024))} KB`
    : `${(bytes / 1048576).toFixed(1)} MB`;
const extension = (name) =>
  name.includes(".")
    ? name.split(".").at(-1).slice(0, 5).toUpperCase()
    : "FILE";
async function responseError(response, fallback) {
  try {
    const result = await response.json();
    return result.error || fallback;
  } catch {
    return fallback;
  }
}

export default function Documents({ user, api, notify }) {
  const [data, setData] = useState(null);
  const [page, setPage] = useState(1);
  const [revision, setRevision] = useState(0);
  const [file, setFile] = useState(null);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [downloading, setDownloading] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [uploadError, setUploadError] = useState("");
  const apiRef = useRef(api);
  apiRef.current = api;
  const input = useRef(null);
  const uploadBusy = useRef(false);
  const downloadBusy = useRef(new Set());
  const manager = ["ADMIN", "SUB_ADMIN"].includes(user.role);
  const accessText =
    user.role === "ADMIN"
      ? "All documents across your organisation are available here."
      : manager
        ? "Access the documents uploaded by people in your team."
        : "Your documents are visible to you and your managers.";
  useEffect(() => {
    setData(null);
  }, [user.id, user.role, user.teamId, user.orgId]);
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    apiRef
      .current(`/documents?page=${page}`)
      .then((result) => {
        if (!cancelled) setData(result);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [page, revision, user.id, user.role, user.teamId, user.orgId]);
  function chooseFile(selected) {
    if (uploadBusy.current) return;
    setFile(selected || null);
    setUploadError("");
  }
  async function upload(event) {
    event.preventDefault();
    if (uploadBusy.current) return;
    if (!file || !file.size || file.size > 10 * 1024 * 1024) {
      setUploadError("Choose a non-empty file no larger than 10 MB.");
      return;
    }
    uploadBusy.current = true;
    setUploading(true);
    setUploadError("");
    try {
      const response = await window.crmSession.request("/api/documents", {
        method: "POST",
        headers: {
          "Content-Type": "application/octet-stream",
          "X-Document-Name": encodeURIComponent(file.name),
        },
        body: file,
      });
      if (!response.ok)
        throw Error(
          await responseError(response, "Upload failed. Please retry."),
        );
      await response.json();
      setFile(null);
      if (input.current) input.current.value = "";
      setPage(1);
      setRevision((value) => value + 1);
      notify("Document uploaded successfully.");
    } catch (err) {
      setUploadError(err.message);
    } finally {
      uploadBusy.current = false;
      setUploading(false);
    }
  }
  async function download(document) {
    if (downloadBusy.current.has(document.id)) return;
    downloadBusy.current.add(document.id);
    setDownloading(new Set(downloadBusy.current));
    try {
      const response = await window.crmSession.request(
        `/api/documents/${encodeURIComponent(document.id)}/download`,
      );
      if (!response.ok)
        throw Error(
          await responseError(response, "Download failed. Please retry."),
        );
      const url = URL.createObjectURL(await response.blob());
      const link = window.document.createElement("a");
      link.href = url;
      link.download = document.name;
      window.document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (err) {
      notify(err.message, true);
    } finally {
      downloadBusy.current.delete(document.id);
      setDownloading(new Set(downloadBusy.current));
    }
  }
  return (
    <div className="documents-layout">
      <section className="panel documents-upload">
        <div className="panel-head">
          <div>
            <p className="eyebrow">KEEP YOUR WORK TOGETHER</p>
            <h2>Upload a document</h2>
            <small>{accessText}</small>
          </div>
          <span className="badge">Up to 10 MB</span>
        </div>
        <form className="documents-upload-form" onSubmit={upload}>
          <label
            className={`document-dropzone ${dragging ? "dragging" : ""} ${file ? "has-file" : ""}`}
            onDragOver={(event) => {
              event.preventDefault();
              if (!uploading) setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(event) => {
              event.preventDefault();
              setDragging(false);
              chooseFile(event.dataTransfer.files[0]);
            }}
          >
            <input
              id="documentFile"
              ref={input}
              type="file"
              aria-label="Choose document"
              disabled={uploading}
              aria-describedby="document-upload-status"
              onChange={(event) => chooseFile(event.target.files[0])}
            />
            <span className="document-upload-icon" aria-hidden="true">
              <svg
                viewBox="0 0 24 24"
                width="25"
                height="25"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M12 16V4m-4 4 4-4 4 4M4 15v5h16v-5" />
              </svg>
            </span>
            <strong>
              {file ? file.name : "Choose a file or drag it here"}
            </strong>
            <span>
              {file
                ? `${fileSize(file.size)} · Click to choose a different file`
                : "Documents, spreadsheets, images and more · maximum 10 MB"}
            </span>
          </label>
          <div className="documents-upload-footer">
            <p id="document-upload-status" role="status" aria-live="polite">
              {uploading
                ? "Uploading your document…"
                : uploadError || "Your original file and filename are kept."}
            </p>
            <button className="button primary" disabled={uploading || !file}>
              {uploading ? "Uploading…" : "Upload document"}
            </button>
          </div>
        </form>
      </section>
      <section className="panel documents-list">
        <div className="panel-head">
          <div>
            <h2>Document centre</h2>
            <small>
              Find and download files shared within your permitted view.
            </small>
          </div>
          <span className="badge">{data?.total || 0} documents</span>
        </div>
        {error && (
          <div className="documents-error" role="alert">
            {error}{" "}
            <button
              className="text-button"
              onClick={() => setRevision((value) => value + 1)}
            >
              Try again
            </button>
          </div>
        )}
        {loading && (
          <div className="documents-loading" role="status">
            Loading documents…
          </div>
        )}
        {data && (
          <>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>File name</th>
                    <th>Size</th>
                    <th>Uploaded by</th>
                    <th>Uploaded</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.length ? (
                    data.items.map((document) => (
                      <tr key={document.id}>
                        <td>
                          <div className="document-file">
                            <span
                              className={`document-file-type ${["PDF", "DOC", "DOCX"].includes(extension(document.name)) ? "paper" : ["XLS", "XLSX", "CSV"].includes(extension(document.name)) ? "sheet" : ""}`}
                              aria-hidden="true"
                            >
                              {extension(document.name)}
                            </span>
                            <strong className="document-filename">
                              {document.name}
                            </strong>
                          </div>
                        </td>
                        <td>{fileSize(document.size)}</td>
                        <td>{document.uploader.name}</td>
                        <td>{dateLabel(document.createdAt)}</td>
                        <td>
                          <button
                            className="text-button document-download"
                            disabled={downloading.has(document.id)}
                            onClick={() => download(document)}
                          >
                            <svg
                              aria-hidden="true"
                              viewBox="0 0 24 24"
                              width="15"
                              height="15"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="1.7"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            >
                              <path d="M12 3v12m-4-4 4 4 4-4M5 16v5h14v-5" />
                            </svg>
                            {downloading.has(document.id)
                              ? "Downloading…"
                              : "Download"}
                          </button>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={5}>
                        <div className="documents-empty">
                          <span aria-hidden="true">↥</span>
                          <strong>Your documents belong here</strong>
                          <p>
                            Choose a file above to upload your first document.
                          </p>
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="documents-pager">
              <span>
                {data.total} documents · Page {data.page} of{" "}
                {Math.max(1, data.pages)}
              </span>
              <div>
                <button
                  className="button"
                  disabled={loading || data.page <= 1}
                  onClick={() => setPage(data.page - 1)}
                >
                  Previous
                </button>
                <button
                  className="button"
                  disabled={loading || data.page >= data.pages}
                  onClick={() => setPage(data.page + 1)}
                >
                  Next
                </button>
              </div>
            </div>
          </>
        )}
      </section>
    </div>
  );
}

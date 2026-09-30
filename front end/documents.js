"use strict";
function renderDocuments(data) {
  const size = bytes => bytes < 1048576 ? Math.max(1, Math.ceil(bytes / 1024)) + " KB" : (bytes / 1048576).toFixed(1) + " MB";
  $("content").innerHTML = `<section class="panel document-upload"><h2>Upload a document</h2><p>Files up to 10 MB. ${isAdmin() ? "You can access all documents in your organisation." : isManager() ? "You can access documents uploaded by your team." : "Your documents are visible to you and your managers."}</p><form id="documentUpload"><label for="documentFile">Choose document</label><input id="documentFile" type="file" required aria-describedby="documentStatus"><button class="button primary" type="submit">Upload document</button><p id="documentStatus" role="status" aria-live="polite"></p></form></section><section class="panel"><div class="panel-head"><h2>Documents</h2><span class="pill">${data.total} total</span></div><div class="table-wrap"><table><thead><tr><th>File name</th><th>Size</th><th>Uploaded by</th><th>Uploaded</th><th>Action</th></tr></thead><tbody>${data.items.map(d => `<tr><td class="document-name">${esc(d.name)}</td><td>${size(d.size)}</td><td>${esc(d.uploader.name)}</td><td>${dateLabel(d.createdAt)}</td><td><button class="text-button" data-document-download="${esc(d.id)}">Download</button></td></tr>`).join("") || '<tr><td colspan="5" class="empty">No documents yet. Choose a file above to upload your first document.</td></tr>'}</tbody></table></div><div class="document-pages"><button class="button" id="documentPrevious" ${data.page <= 1 ? "disabled" : ""}>Previous</button><span>Page ${data.page} of ${Math.max(1, data.pages)}</span><button class="button" id="documentNext" ${data.page >= data.pages ? "disabled" : ""}>Next</button></div></section>`;
  $("documentPrevious").onclick = () => { state.page--; loadView(); };
  $("documentNext").onclick = () => { state.page++; loadView(); };
  $("documentUpload").onsubmit = async event => {
    event.preventDefault();
    const form = event.currentTarget, file = $("documentFile").files[0], status = $("documentStatus");
    if (!file || !file.size || file.size > 10 * 1024 * 1024) { status.textContent = "Choose a non-empty file no larger than 10 MB."; return; }
    const button = form.querySelector("button"); button.disabled = true; status.textContent = "Uploading…";
    try {
      const response = await window.crmSession.request("/api/documents", { method: "POST", headers: { "Content-Type": "application/octet-stream", "X-Document-Name": encodeURIComponent(file.name) }, body: file });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Upload failed. Please retry.");
      notice("Document uploaded successfully.");
      if (state.view === "documents") { state.page = 1; await loadView(); }
    } catch (err) { status.textContent = err.message; } finally { button.disabled = false; }
  };
  document.querySelectorAll("[data-document-download]").forEach(button => {
    button.onclick = async () => {
      button.disabled = true;
      try {
        const response = await window.crmSession.request("/api/documents/" + encodeURIComponent(button.dataset.documentDownload) + "/download");
        if (!response.ok) { const error = await response.json(); throw new Error(error.error || "Download failed."); }
        const url = URL.createObjectURL(await response.blob()), link = document.createElement("a");
        link.href = url; link.download = data.items.find(d => d.id === button.dataset.documentDownload).name;
        document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 60000);
      } catch (err) { notice(err.message, true); } finally { button.disabled = false; }
    };
  });
}

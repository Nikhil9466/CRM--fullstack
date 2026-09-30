const express = require("express");
const router = express.Router();
const db = require("../config/prisma");
const { memberScope } = require("../utils/access");
const wrap = fn => (req, res, next) => Promise.resolve(fn(req, res)).catch(next);
const scope = user => ({ orgId: user.orgId, uploader: memberScope(user) });
const select = { id: true, name: true, size: true, createdAt: true, uploader: { select: { name: true } } };
router.get("/documents", wrap(async (req, res) => {
  const page = Math.max(1, Math.min(100000, parseInt(req.query.page, 10) || 1));
  const where = scope(req.user);
  const [items, total] = await db.$transaction([
    db.document.findMany({ where, select, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: (page - 1) * 25, take: 25 }),
    db.document.count({ where }),
  ]);
  res.json({ items, total, page, pages: Math.ceil(total / 25) });
}));
router.post("/documents", express.raw({ type: "application/octet-stream", limit: "10mb" }), wrap(async (req, res) => {
  let name;
  try { name = decodeURIComponent(req.get("X-Document-Name") || ""); } catch { return res.status(400).json({ error: "Invalid file name." }); }
  name = name.trim();
  if (!name || name.length > 255 || /[\x00-\x1f\x7f/\\]/.test(name)) return res.status(400).json({ error: "Choose a file with a valid name (up to 255 characters)." });
  if (!Buffer.isBuffer(req.body) || !req.body.length) return res.status(400).json({ error: "Choose a non-empty file to upload." });
  const row = await db.document.create({ data: { orgId: req.user.orgId, uploaderId: req.user.id, name, size: req.body.length, content: req.body }, select });
  res.status(201).json(row);
}));
router.get("/documents/:id/download", wrap(async (req, res) => {
  const row = await db.document.findFirst({ where: { id: req.params.id, ...scope(req.user) } });
  if (!row) return res.status(404).json({ error: "Document not found." });
  res.setHeader("Content-Type", "application/octet-stream");
  res.setHeader("Content-Disposition", "attachment; filename=\"document\"; filename*=UTF-8''" + encodeURIComponent(row.name).replace(/['()*]/g, c => "%" + c.charCodeAt(0).toString(16)));
  res.send(row.content);
}));
module.exports = router;

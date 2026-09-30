const express = require("express");
const path = require("path");
const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "32kb" }));
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "same-origin");
  res.setHeader("X-Frame-Options", "DENY");
  if (req.path.startsWith("/api/")) res.setHeader("Cache-Control", "no-store");
  next();
});
app.get("/api/health", (req, res) => res.json({ status: "ok" }));
app.use("/api", require("./middleware/csrf").sameOriginRequests);
app.use("/api/auth", require("./routes/authRoutes"));
app.use("/api", require("./routes/crmRoutes"));
app.use("/api", (req, res) =>
  res.status(404).json({ error: "Endpoint not found." }),
);
app.get("/", (req, res) => res.redirect("/home.html"));
// The React build is served beside the API so cookie and CSRF protection stay
// on the same origin. Source files and development tools are not public.
app.use(express.static(path.join(__dirname, "../../front end/dist")));
app.use((err, req, res, next) => {
  if (err.status && err.status < 500)
    return res.status(err.status).json({ error: err.message });
  if (err.code === "P2002")
    return res
      .status(409)
      .json({
        error:
          "That email, phone, organisation ID, or stage name is already in use.",
      });
  if (err.code === "P2003")
    return res
      .status(409)
      .json({
        error:
          "This record is still linked to other records. Unlink them first.",
      });
  if (
    err.name === "PrismaClientUnknownRequestError" &&
    /code: "23001"/.test(err.message)
  )
    return res
      .status(409)
      .json({
        error:
          "This record is still linked to other records. Unlink them first.",
      });
  if (err.code === "P2025")
    return res
      .status(404)
      .json({ error: "Record not found. It may have been deleted." });
  console.error(err);
  res.status(500).json({ error: "Unexpected server error. Please retry." });
});
module.exports = app;

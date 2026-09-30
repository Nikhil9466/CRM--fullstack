const safeMethods = new Set(["GET", "HEAD", "OPTIONS"]);
// JSON APIs only, hosted on the same origin as the frontend. The custom header
// protects login/signup too, before a synchronizer token exists. No credentialed
// cross-origin CORS access is enabled.
function sameOriginRequests(req, res, next) {
  if (safeMethods.has(req.method)) return next();
  const origin = req.get("origin");
  const expected =
    process.env.APP_ORIGIN || `${req.protocol}://${req.get("host")}`;
  if (
    req.get("sec-fetch-site") === "cross-site" ||
    (origin && origin !== expected)
  )
    return res
      .status(403)
      .json({ error: "Cross-origin requests are not allowed." });
  if (req.get("X-CRM-Request") !== "1")
    return res
      .status(403)
      .json({
        error: "Missing request protection. Refresh the app and retry.",
      });
  if (
    (Number(req.headers["content-length"]) > 0 ||
      req.headers["transfer-encoding"]) &&
    !req.is("application/json") &&
    !(req.method === "POST" && req.path === "/documents" && req.is("application/octet-stream"))
  )
    return res
      .status(415)
      .json({ error: "Use application/json for API requests." });
  next();
}
module.exports = { safeMethods, sameOriginRequests };

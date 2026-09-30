export const money = (value) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(Number(value || 0));
export const compactMoney = (value) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(Number(value || 0));
export const dateLabel = (value) =>
  value
    ? new Date(String(value).slice(0, 10) + "T12:00:00").toLocaleDateString(
        "en-IN",
        { day: "numeric", month: "short", year: "numeric" },
      )
    : "—";
export const roleLabel = (role) =>
  ({ ADMIN: "Admin", SUB_ADMIN: "Sub-admin", EMPLOYEE: "Employee" })[role] ||
  role;
export const initials = (name) =>
  String(name || "")
    .trim()
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
export const today = () => {
  const d = new Date();
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, "0"),
    String(d.getDate()).padStart(2, "0"),
  ].join("-");
};
export async function api(path, method = "GET", body) {
  try {
    const res = await window.crmSession.request("/api" + path, {
      method,
      signal: AbortSignal.timeout(15000),
      ...(body !== undefined
        ? {
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          }
        : {}),
    });
    if (res.status === 204) return null;
    const data = await res.json();
    if (!res.ok)
      throw new Error(data.error || "The request could not be completed.");
    return data;
  } catch (error) {
    if (error instanceof TypeError || error.name === "TimeoutError")
      throw new Error(
        "Cannot reach your workspace. Check your connection and retry.",
      );
    throw error;
  }
}
export async function allChoices(type) {
  let page = 1,
    items = [];
  while (true) {
    const data = await api(
      "/" +
        type +
        "?page=" +
        page +
        "&sort=" +
        (type === "contacts" ? "name" : "title") +
        "&direction=asc",
    );
    items.push(...data.items);
    if (page * data.pageSize >= data.total) return items;
    page++;
  }
}

const DEFAULT_DOMAIN = "facebook.com";

const cookieInput = document.getElementById("cookieInput");
const domainInput = document.getElementById("domainInput");
const pathInput = document.getElementById("pathInput");
const expiryInput = document.getElementById("expiryInput");
const subdomainInput = document.getElementById("subdomainInput");
const applyBtn = document.getElementById("applyBtn");
const getCookieBtn = document.getElementById("getCookieBtn");
const copyBtn = document.getElementById("copyBtn");
const statusBox = document.getElementById("statusBox");
const domainBadge = document.getElementById("domainBadge");
const siteLine = document.getElementById("siteLine");

function normalizeDomain(input) {
  return String(input || DEFAULT_DOMAIN)
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "")
    .replace(/^\.+/, "");
}

function normalizePath(input) {
  const path = String(input || "/").trim();
  if (!path) return "/";
  return path.startsWith("/") ? path : `/${path}`;
}

function parseCookieString(raw) {
  return String(raw || "")
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const eqIndex = part.indexOf("=");
      if (eqIndex === -1) {
        return { name: part, value: "" };
      }
      return {
        name: part.slice(0, eqIndex).trim(),
        value: part.slice(eqIndex + 1).trim()
      };
    })
    .filter((item) => item.name);
}

function setStatus(text, tone = "neutral") {
  statusBox.textContent = text;
  statusBox.classList.remove("warn", "ok");
  if (tone === "warn") statusBox.classList.add("warn");
  if (tone === "ok") statusBox.classList.add("ok");
}

function syncDomainBadge() {
  const domain = normalizeDomain(domainInput.value);
  domainBadge.textContent = `Domain: ${domain}`;
}

function syncSiteLine(hostname) {
  siteLine.textContent = hostname
    ? `Site hiện tại: ${hostname}`
    : "Site hiện tại: chưa xác định";
}

async function sendMessage(message) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(message, (response) => {
      resolve(
        response || {
          ok: false,
          error: chrome.runtime.lastError?.message || "Không có phản hồi"
        }
      );
    });
  });
}


async function getActiveTabInfo() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const tab = tabs[0];
  if (!tab?.url) return null;
  const url = new URL(tab.url);
  return { tab, url, hostname: url.hostname.replace(/^www\./, "") };
}

async function getCookiesFromCurrentTab() {
  try {
    const active = await getActiveTabInfo();
    if (!active) {
      setStatus("Không xác định được tab hiện tại.", "warn");
      return;
    }

    const hostname = active.hostname;

    const cookies = await chrome.cookies.getAll({
      url: active.tab.url
    });

    const cookieText = cookies
      .map((cookie) => `${cookie.name}=${cookie.value}`)
      .join(";");

    cookieInput.value = cookieText;
    domainInput.value = hostname;
    syncDomainBadge();
    syncSiteLine(hostname);

    setStatus(
      `Đã get ${cookies.length} cookie từ ${hostname}.`,
      cookies.length ? "ok" : "warn"
    );
  } catch (error) {
    setStatus(`Lỗi get cookie: ${error?.message || String(error)}`, "warn");
  }
}

async function copyCookieToClipboard() {
  const text = cookieInput.value.trim();
  if (!text) {
    setStatus("Chưa có cookie để copy.", "warn");
    return;
  }
  await navigator.clipboard.writeText(text);
  setStatus("Đã copy cookie.", "ok");
}

async function loadLastState() {
  const stored = await chrome.storage.local.get(["lastImportedCookies", "lastImportedDomain"]);
  if (Array.isArray(stored.lastImportedCookies) && stored.lastImportedCookies.length) {
    setStatus(
      `Lần trước đã thêm ${stored.lastImportedCookies.length} cookie cho ${stored.lastImportedDomain || DEFAULT_DOMAIN}.`,
      "ok"
    );
  }
}

async function detectActiveDomain() {
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const tab = tabs[0];
    if (!tab?.url) return;
    const url = new URL(tab.url);
    syncSiteLine(url.hostname.replace(/^www\./, ""));
  } catch {
    syncSiteLine("");
  }
}

cookieInput.addEventListener("input", () => {
  const items = parseCookieString(cookieInput.value);
  setStatus(`Đã nhập ${items.length} cookie.`, items.length ? "ok" : "neutral");
});

domainInput.addEventListener("input", syncDomainBadge);

getCookieBtn.addEventListener("click", getCookiesFromCurrentTab);
copyBtn.addEventListener("click", copyCookieToClipboard);

applyBtn.addEventListener("click", async () => {
  const items = parseCookieString(cookieInput.value);
  if (!items.length) {
    setStatus("Bạn chưa nhập cookie nào.", "warn");
    return;
  }

  const domain = normalizeDomain(domainInput.value);
  const path = normalizePath(pathInput.value);
  const response = await sendMessage({
    type: "set-cookies",
    domain: subdomainInput.checked ? `.${domain}` : domain,
    path,
    rawCookies: cookieInput.value,
    expiry: expiryInput.value
  });

  if (response.ok) {
    setStatus(`Đã thêm ${items.length} cookie cho ${domain}.`, "ok");
    return;
  }

  const failures = Array.isArray(response.results)
    ? response.results.filter((item) => !item.ok).map((item) => item.name).join(", ")
    : "";
  setStatus(`Không thêm được hết cookie${failures ? `: ${failures}` : ""}.`, "warn");
});

(async function init() {
  domainInput.value = DEFAULT_DOMAIN;
  syncDomainBadge();
  await detectActiveDomain();
  await loadLastState();
})();

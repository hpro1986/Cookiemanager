const DEFAULT_DOMAIN = "facebook.com";

function normalizeDomain(input) {
  const domain = String(input || DEFAULT_DOMAIN).trim().toLowerCase();
  return domain
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

function cookieUrlForDomain(domain, path) {
  const cleanDomain = normalizeDomain(domain);
  const cleanPath = normalizePath(path);
  return `https://${cleanDomain}${cleanPath}`;
}

function makeCookieDetails(domain, path, item) {
  const host = normalizeDomain(domain);
  const cleanPath = normalizePath(path);
  const secure = true;
  return {
    url: `https://${host}${cleanPath}`,
    name: item.name,
    value: item.value,
    domain: String(domain || "").trim().startsWith(".") ? `.${host}` : host,
    path: cleanPath,
    secure,
    sameSite: "lax"
  };
}

async function setCookiesForDomain(domain, path, rawCookies, expiryMode) {
  const items = parseCookieString(rawCookies);
  const expiry = normalizeExpiry(expiryMode);
  const results = [];

  for (const item of items) {
    try {
      const details = makeCookieDetails(domain, path, item);
      if (expiry !== null) {
        details.expirationDate = expiry;
      }
      await chrome.cookies.set(details);
      results.push({ name: item.name, ok: true });
    } catch (error) {
      results.push({
        name: item.name,
        ok: false,
        error: error?.message || String(error)
      });
    }
  }

  await chrome.storage.local.set({
    lastImportedCookies: items.map((item) => item.name),
    lastImportedDomain: normalizeDomain(domain)
  });

  return {
    ok: results.every((item) => item.ok),
    results
  };
}

function normalizeExpiry(input) {
  const mode = String(input || "session");
  const now = Math.floor(Date.now() / 1000);
  if (mode === "1h") return now + 60 * 60;
  if (mode === "1d") return now + 60 * 60 * 24;
  return null;
}

async function deleteImportedCookies(domain, path) {
  const stored = await chrome.storage.local.get(["lastImportedCookies"]);
  const names = Array.isArray(stored.lastImportedCookies) ? stored.lastImportedCookies : [];
  const cleanDomain = normalizeDomain(domain);
  const cleanPath = normalizePath(path);
  const url = cookieUrlForDomain(cleanDomain, cleanPath);
  const results = [];

  for (const name of names) {
    try {
      await chrome.cookies.remove({ url, name });
      results.push({ name, ok: true });
    } catch (error) {
      results.push({
        name,
        ok: false,
        error: error?.message || String(error)
      });
    }
  }

  return {
    ok: results.every((item) => item.ok),
    results
  };
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || typeof message !== "object") {
    return;
  }

  if (message.type === "set-cookies") {
    setCookiesForDomain(message.domain, message.path, message.rawCookies, message.expiry)
      .then(sendResponse)
      .catch((error) => sendResponse({ ok: false, error: error?.message || String(error) }));
    return true;
  }

  if (message.type === "delete-imported-cookies") {
    deleteImportedCookies(message.domain, message.path)
      .then(sendResponse)
      .catch((error) => sendResponse({ ok: false, error: error?.message || String(error) }));
    return true;
  }
});

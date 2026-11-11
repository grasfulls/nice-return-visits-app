// NRV internationalization runtime. English is the default and the fallback.
// Nothing here runs automatically: callers must call NRVI18n.init().
(function (root, factory) {
  const api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.NRVI18n = api;
})(typeof window !== "undefined" ? window : globalThis, function (root) {
  const DEFAULT_LANGUAGE = "en";
  const CATALOG_TIMEOUT_MS = 3000;
  const CACHE_READ_TIMEOUT_MS = 500;
  const STORAGE_KEY = "nrv_language";
  // To add a language: add one entry here and one locales/<code>.json file.
  const LANGUAGES = [
    { code: "en", name: "English", file: "locales/en.json" },
    { code: "es", name: "Español", file: "locales/es.json" },
  ];

  const catalogs = {};
  let current = DEFAULT_LANGUAGE;
  let pendingLanguagePreference = null;
  const setTimer = (callback, duration) =>
    (root.setTimeout || setTimeout).call(root, callback, duration);
  const clearTimer = (timer) =>
    (root.clearTimeout || clearTimeout).call(root, timer);

  const isSupported = (code) => LANGUAGES.some((l) => l.code === code);

  function readStoredLanguage() {
    try {
      const stored = root.localStorage.getItem(STORAGE_KEY);
      return isSupported(stored) ? stored : DEFAULT_LANGUAGE;
    } catch (error) {
      console.error("Unable to read the selected language:", error);
      return DEFAULT_LANGUAGE;
    }
  }

  function explicitLanguage() {
    const code = new URLSearchParams(root.location ? root.location.search : "").get("lang");
    return isSupported(code) ? code : null;
  }

  function setLanguage(code) {
    if (!isSupported(code)) throw new Error(`Unsupported language: ${code}`);
    root.localStorage.setItem(STORAGE_KEY, code);
  }

  async function loadCatalog(code) {
    if (catalogs[code]) return catalogs[code];
    const entry = LANGUAGES.find((l) => l.code === code);
    if (!entry) throw new Error(`Unsupported language: ${code}`);
    if (root.caches && root.location) {
      try {
        const cached = await withTimeout(
          root.caches.match(new URL(entry.file, root.location.href)),
          CACHE_READ_TIMEOUT_MS,
          `Reading the cached ${code} language catalog timed out.`,
        );
        if (cached?.ok) {
          catalogs[code] = await withTimeout(
            cached.json(),
            CATALOG_TIMEOUT_MS,
            `Reading the cached ${code} language catalog timed out.`,
          );
          return catalogs[code];
        }
      } catch (error) {
        console.error(`Unable to read the cached ${code} language catalog:`, error);
      }
    }
    const controller = typeof root.AbortController === "function"
      ? new root.AbortController()
      : null;
    let timer;
    const timeout = new Promise((_, reject) => {
      timer = setTimer(() => {
        controller?.abort();
        reject(new Error(`Loading the ${code} language catalog timed out.`));
      }, CATALOG_TIMEOUT_MS);
    });
    let response;
    try {
      response = await Promise.race([
        root.fetch(entry.file, controller ? { signal: controller.signal } : undefined),
        timeout,
      ]);
    } finally {
      clearTimer(timer);
    }
    if (!response.ok) throw new Error(`Could not load ${entry.file}`);
    catalogs[code] = await withTimeout(
      response.json(),
      CATALOG_TIMEOUT_MS,
      `Reading the ${code} language catalog timed out.`,
    );
    return catalogs[code];
  }

  function withTimeout(promise, duration, message) {
    let timer;
    return Promise.race([
      Promise.resolve(promise),
      new Promise((_, reject) => {
        timer = setTimer(() => reject(new Error(message)), duration);
      }),
    ]).finally(() => clearTimer(timer));
  }

  function lookup(key, count) {
    const chain = current === DEFAULT_LANGUAGE ? [current] : [current, DEFAULT_LANGUAGE];
    for (const code of chain) {
      const catalog = catalogs[code];
      if (!catalog) continue;
      if (typeof count === "number") {
        let category = "other";
        try {
          category = new Intl.PluralRules(code).select(count);
        } catch {
          // Keep "other" for unsupported language codes.
        }
        if (typeof catalog[`${key}_${category}`] === "string") return catalog[`${key}_${category}`];
        if (typeof catalog[`${key}_other`] === "string") return catalog[`${key}_other`];
      }
      if (typeof catalog[key] === "string") return catalog[key];
    }
    return null;
  }

  // Missing keys return the fallback (when given) or the key itself, never blank.
  function t(key, vars, fallback) {
    const template = lookup(key, vars && vars.count);
    const text = template === null ? (fallback !== undefined ? fallback : key) : template;
    return text.replace(/\{(\w+)\}/g, (match, name) =>
      vars && Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : match,
    );
  }

  // Elements keep their existing English text unless a translation is found.
  //   data-i18n="key"                        -> textContent
  //   data-i18n-attr="aria-label:key;title:key" -> attributes
  function apply(scope) {
    const doc = scope || root.document;
    if (!doc) return;
    doc.querySelectorAll("[data-i18n]").forEach((el) => {
      const value = lookup(el.dataset.i18n);
      if (value !== null) el.textContent = value;
    });
    doc.querySelectorAll("[data-i18n-attr]").forEach((el) => {
      el.dataset.i18nAttr.split(";").forEach((pair) => {
        const [attr, key] = pair.split(":").map((part) => part.trim());
        const value = attr && key ? lookup(key) : null;
        if (value !== null) el.setAttribute(attr, value);
      });
    });
    if (root.document && root.document.documentElement) {
      root.document.documentElement.lang = current;
    }
  }

  async function init({ deferExplicitSave = false } = {}) {
    const explicit = explicitLanguage();
    const code = explicit || readStoredLanguage();
    let languageSaveFailed = false;
    if (explicit) {
      if (deferExplicitSave) {
        pendingLanguagePreference = code;
      } else {
        try {
          root.localStorage.setItem(STORAGE_KEY, code);
          pendingLanguagePreference = null;
        } catch (error) {
          console.error("Unable to save the selected language:", error);
          languageSaveFailed = true;
        }
      }
    }
    try {
      await loadCatalog(DEFAULT_LANGUAGE);
      await loadCatalog(code);
      current = code;
      if (languageSaveFailed) {
        await root.NRVDialogs.alert(
          t(
            "language.saveError",
            undefined,
            "The language choice could not be saved on this device. Check your browser storage settings and try again.",
          ),
        );
      }
    } finally {
      apply();
    }
    return current;
  }

  async function persistPendingLanguagePreference() {
    if (!pendingLanguagePreference) return true;
    try {
      root.localStorage.setItem(STORAGE_KEY, pendingLanguagePreference);
      pendingLanguagePreference = null;
      return true;
    } catch (error) {
      console.error("Unable to save the selected language:", error);
      await root.NRVDialogs.alert(
        t(
          "language.saveError",
          undefined,
          "The language choice could not be saved on this device. Check your browser storage settings and try again.",
        ),
      );
      return false;
    }
  }

  return {
    DEFAULT_LANGUAGE,
    STORAGE_KEY,
    LANGUAGES,
    t,
    apply,
    init,
    persistPendingLanguagePreference,
    setLanguage,
    getLanguage: () => current,
    // Test hook: supplies a catalog without fetching.
    _setCatalog: (code, catalog) => {
      catalogs[code] = catalog;
    },
    _setCurrent: (code) => {
      current = code;
    },
  };
});

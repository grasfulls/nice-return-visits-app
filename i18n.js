// NRV internationalization runtime. English is the default and the fallback.
// Nothing here runs automatically: callers must call NRVI18n.init().
(function (root, factory) {
  const api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.NRVI18n = api;
})(typeof window !== "undefined" ? window : globalThis, function (root) {
  const DEFAULT_LANGUAGE = "en";
  const STORAGE_KEY = "nrv_language";
  // To add a language: add one entry here and one locales/<code>.json file.
  const LANGUAGES = [{ code: "en", name: "English", file: "locales/en.json" }];

  const catalogs = {};
  let current = DEFAULT_LANGUAGE;

  const isSupported = (code) => LANGUAGES.some((l) => l.code === code);

  function readStoredLanguage() {
    try {
      const stored = root.localStorage.getItem(STORAGE_KEY);
      return isSupported(stored) ? stored : DEFAULT_LANGUAGE;
    } catch {
      return DEFAULT_LANGUAGE;
    }
  }

  async function loadCatalog(code) {
    if (catalogs[code]) return catalogs[code];
    const entry = LANGUAGES.find((l) => l.code === code);
    if (!entry) throw new Error(`Unsupported language: ${code}`);
    const response = await root.fetch(entry.file);
    if (!response.ok) throw new Error(`Could not load ${entry.file}`);
    catalogs[code] = await response.json();
    return catalogs[code];
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

  // The stored language is only changed after its catalog loads successfully.
  async function setLanguage(code) {
    if (!isSupported(code)) code = DEFAULT_LANGUAGE;
    await loadCatalog(DEFAULT_LANGUAGE);
    await loadCatalog(code);
    current = code;
    try {
      root.localStorage.setItem(STORAGE_KEY, code);
    } catch (error) {
      console.error("Unable to save the selected language:", error);
    }
    apply();
    return code;
  }

  async function init() {
    const code = readStoredLanguage();
    await loadCatalog(DEFAULT_LANGUAGE);
    if (code !== DEFAULT_LANGUAGE) {
      try {
        await loadCatalog(code);
        current = code;
      } catch (error) {
        console.error("Falling back to English:", error);
      }
    }
    apply();
    return current;
  }

  return {
    DEFAULT_LANGUAGE,
    STORAGE_KEY,
    LANGUAGES,
    t,
    apply,
    init,
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

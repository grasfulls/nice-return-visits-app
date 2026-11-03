const DEFAULT_SETTINGS = {
  country: "United States",
  countries: ["Canada", "Mexico", "United States"],
  state: "",
  defaultCity: "",
  cities: [],
  regions: [],
  areas: [],
};
const ENCRYPTION_ITERATIONS = 310000;
const ENCRYPTION_META_KEY = "encryption-meta";
// Set to true to require a passphrase when no encryption has been set up yet.
const REQUIRE_PASSPHRASE_ON_FIRST_USE = false;
// Applies to newly created passphrases only; existing 8+ character ones still unlock.
const MIN_PASSPHRASE_LENGTH = 12;

// Bump on any change to the stored data shape, and add a migration in
// normalizeRegionData. Version 3 added country to settings and contacts.
const SCHEMA_VERSION = 4;
const EPOCH_TIMESTAMP = "1970-01-01T00:00:00.000Z";

class NewerDataVersionError extends Error {
  constructor() {
    super(
      "This data was saved by a newer version of the app. Update the app (reload it) before opening this data. Nothing was changed.",
    );
    this.name = "NewerDataVersionError";
  }
}
const APP_UPDATE_PENDING_KEY = "return_visits_app_update_pending";
const INSTALLED_SETUP_COMPLETE_KEY = "nrv_installed_setup_completed";
const isInstalledApp = () =>
  window.matchMedia("(display-mode: standalone)").matches ||
  navigator.standalone === true;
const showBrowserInstallGuide = () => {
  document.getElementById("unlock-screen").remove();
  document.getElementById("app-container").hidden = true;
  document.title = "NRV";
  const screen = document.getElementById("browser-install-screen");
  screen.hidden = false;
  const userAgent = navigator.userAgent || "";
  const isApplePhone =
    /iPad|iPhone|iPod/i.test(userAgent) ||
    (/Macintosh/i.test(userAgent) && navigator.maxTouchPoints > 1);
  document.getElementById("browser-install-ios").hidden = !isApplePhone;
  document.getElementById("browser-install-other").hidden = isApplePhone;
  const normalSafariCheck = document.getElementById(
    "browser-normal-safari-check",
  );
  const iosSteps = document.getElementById("browser-install-ios-steps");
  normalSafariCheck.addEventListener("change", () => {
    iosSteps.hidden = !normalSafariCheck.checked;
  });
  document
    .getElementById("browser-install-added")
    .addEventListener("click", () => {
      document.getElementById("browser-install-handoff").hidden = false;
      document
        .getElementById("browser-install-handoff")
        .scrollIntoView({ block: "nearest" });
    });
};
const markInstalledSetupComplete = () => {
  try {
    localStorage.setItem(INSTALLED_SETUP_COMPLETE_KEY, "true");
    return true;
  } catch (error) {
    console.error("Unable to save the installed-app setup status:", error);
    return false;
  }
};
let appUpdateAvailable = false;
let appReadyForUpdates = false;
let appUpdatePromptDismissed = false;
let appUpdatePromptTimer = null;
let getAppRefreshBlockMessage = () => "";
let revealAppRefreshBlock = () => {};
let confirmLeaveSettings = () => true;
let appUpdatePromptHandler = () => {
  if (!appReadyForUpdates) return;
  const dialog = document.getElementById("app-update-dialog");
  if (!appUpdateAvailable || appUpdatePromptDismissed || dialog.open) return;
  appUpdatePromptTimer = window.setTimeout(() => {
    appUpdatePromptTimer = null;
    if (
      appUpdateAvailable &&
      !appUpdatePromptDismissed &&
      !dialog.open &&
      !document.querySelector("dialog[open]")
    ) {
      dialog.showModal();
    }
  }, 750);
};
const APP_JUST_UPDATED_KEY = "return-visits-just-updated";
const reloadAfterUpdate = () => {
  try {
    sessionStorage.setItem(APP_JUST_UPDATED_KEY, "1");
  } catch (error) {
    console.error("Unable to note the app update:", error);
  }
  window.location.reload();
};
const showJustUpdatedNotice = () => {
  let pending = false;
  try {
    pending = sessionStorage.getItem(APP_JUST_UPDATED_KEY) === "1";
    sessionStorage.removeItem(APP_JUST_UPDATED_KEY);
  } catch (error) {
    console.error("Unable to read the app update note:", error);
  }
  if (!pending) return;
  const dialog = document.getElementById("app-updated-dialog");
  window.setTimeout(() => {
    if (!document.querySelector("dialog[open]")) dialog.showModal();
  }, 750);
};
document
  .getElementById("btn-ok-updated")
  .addEventListener("click", () =>
    document.getElementById("app-updated-dialog").close(),
  );
document
  .getElementById("btn-apply-app-update")
  .addEventListener("click", () => {
    const blockMessage = getAppRefreshBlockMessage();
    if (blockMessage) {
      document.getElementById("app-update-dialog").close();
      document.getElementById("app-update-status").textContent = blockMessage;
      alert(blockMessage);
      revealAppRefreshBlock();
      return;
    }
    try {
      localStorage.removeItem(APP_UPDATE_PENDING_KEY);
    } catch (error) {
      console.error("Unable to clear the pending app update status:", error);
    }
    reloadAfterUpdate();
  });
document
  .getElementById("btn-later-app-update")
  .addEventListener("click", () => {
    appUpdatePromptDismissed = true;
    document.getElementById("app-update-dialog").close();
  });
try {
  // A fresh page load already runs the newest files, so any earlier pending
  // flag is stale. The flag is set again only if an update activates later.
  localStorage.removeItem(APP_UPDATE_PENDING_KEY);
} catch (error) {
  console.error("Unable to clear the pending app update status:", error);
}
document.addEventListener("app-update-available", () => {
  appUpdateAvailable = true;
  try {
    localStorage.setItem(APP_UPDATE_PENDING_KEY, "true");
  } catch (error) {
    console.error("Unable to save the pending app update status:", error);
  }
  appUpdatePromptHandler?.();
});
const US_STATE_ABBREVIATIONS = {
  alabama: "AL",
  alaska: "AK",
  arizona: "AZ",
  arkansas: "AR",
  california: "CA",
  colorado: "CO",
  connecticut: "CT",
  delaware: "DE",
  florida: "FL",
  georgia: "GA",
  hawaii: "HI",
  idaho: "ID",
  illinois: "IL",
  indiana: "IN",
  iowa: "IA",
  kansas: "KS",
  kentucky: "KY",
  louisiana: "LA",
  maine: "ME",
  maryland: "MD",
  massachusetts: "MA",
  michigan: "MI",
  minnesota: "MN",
  mississippi: "MS",
  missouri: "MO",
  montana: "MT",
  nebraska: "NE",
  nevada: "NV",
  "new hampshire": "NH",
  "new jersey": "NJ",
  "new mexico": "NM",
  "new york": "NY",
  "north carolina": "NC",
  "north dakota": "ND",
  ohio: "OH",
  oklahoma: "OK",
  oregon: "OR",
  pennsylvania: "PA",
  "rhode island": "RI",
  "south carolina": "SC",
  "south dakota": "SD",
  tennessee: "TN",
  texas: "TX",
  utah: "UT",
  vermont: "VT",
  virginia: "VA",
  washington: "WA",
  "west virginia": "WV",
  wisconsin: "WI",
  wyoming: "WY",
  "district of columbia": "DC",
  "puerto rico": "PR",
  "u.s. virgin islands": "VI",
  "virgin islands": "VI",
  guam: "GU",
  "american samoa": "AS",
  "northern mariana islands": "MP",
};

const toTitleCase = (value) =>
  String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/(^|[\s-])([a-z])/g, (_, separator, letter) =>
      `${separator}${letter.toUpperCase()}`,
    )
    .replace(/(^|[\s-])([a-z])'([a-z])/gi, (_, separator, first, following) =>
      `${separator}${first.toUpperCase()}'${following.toUpperCase()}`,
    )
    .replace(/\b(Nw|Ne|Sw|Se|N|S|E|W)\b/g, (direction) =>
      direction.toUpperCase(),
    );

const normalizeUsState = (value) => {
  const state = String(value ?? "").trim().replace(/\s+/g, " ");
  if (!state) return "";
  const normalized = state.toLowerCase().replace(/\./g, "");
  const fullName = US_STATE_ABBREVIATIONS[normalized];
  if (fullName) return fullName;
  if (/^[a-z]{2}$/i.test(normalized)) return normalized.toUpperCase();
  return toTitleCase(state);
};
const normalizeCountry = (value) => {
  const country = String(value ?? "").trim().replace(/\s+/g, " ");
  const normalized = country.toLowerCase();
  if (["ca", "can", "canada"].includes(normalized)) return "Canada";
  if (["mx", "mex", "mexico", "méxico"].includes(normalized)) return "Mexico";
  if (
    ["us", "usa", "u.s.", "u.s.a.", "united states", "united states of america"].includes(
      normalized,
    )
  ) {
    return "United States";
  }
  return toTitleCase(country);
};
const normalizeLocationState = (country, value) =>
  normalizeCountry(country) === "United States"
    ? normalizeUsState(value)
    : /^[a-z]{2}$/i.test(String(value ?? "").trim())
      ? String(value).trim().toUpperCase()
      : toTitleCase(String(value ?? "").trim().replace(/\s+/g, " "));
const DEFAULT_COUNTRIES = ["Canada", "Mexico", "United States"];

const STREET_SUFFIX_ABBREVIATIONS = {
  alley: "Aly",
  annex: "Anx",
  arcade: "Arc",
  avenue: "Av",
  ave: "Av",
  av: "Av",
  bayou: "Byu",
  beach: "Bch",
  bend: "Bnd",
  bluff: "Blf",
  bottom: "Btm",
  boulevard: "Blvd",
  branch: "Br",
  bridge: "Brg",
  brook: "Brk",
  burg: "Bg",
  bypass: "Byp",
  camp: "Cp",
  canyon: "Cyn",
  cape: "Cpe",
  causeway: "Cswy",
  center: "Ctr",
  centre: "Ctr",
  circle: "Cir",
  cliff: "Clf",
  club: "Clb",
  common: "Cmn",
  corner: "Cor",
  course: "Crse",
  court: "Ct",
  creek: "Crk",
  crescent: "Cres",
  crossing: "Xing",
  dale: "Dl",
  dam: "Dm",
  divide: "Dv",
  drive: "Dr",
  estate: "Est",
  extension: "Ext",
  fall: "Fl",
  ferry: "Fry",
  field: "Fld",
  flat: "Flt",
  ford: "Frd",
  forest: "Frst",
  forge: "Frg",
  fork: "Frk",
  fort: "Ft",
  freeway: "Fwy",
  garden: "Gdn",
  gateway: "Gtwy",
  glen: "Gln",
  green: "Grn",
  grove: "Grv",
  harbor: "Hbr",
  haven: "Hvn",
  heights: "Hts",
  highway: "Hwy",
  hill: "Hl",
  hollow: "Holw",
  inlet: "Inlt",
  island: "Is",
  junction: "Jct",
  key: "Ky",
  knoll: "Knl",
  lake: "Lk",
  landing: "Lndg",
  light: "Lgt",
  loaf: "Lf",
  lock: "Lck",
  lodge: "Ldg",
  manor: "Mnr",
  meadow: "Mdw",
  mill: "Ml",
  mission: "Msn",
  mount: "Mt",
  mountain: "Mtn",
  neck: "Nck",
  orchard: "Orch",
  oval: "Oval",
  overpass: "Opas",
  park: "Pk",
  parkway: "Pkwy",
  pass: "Pass",
  passage: "Psge",
  path: "Path",
  pike: "Pike",
  pine: "Pnes",
  plain: "Pln",
  plaza: "Plz",
  point: "Pt",
  port: "Prt",
  prairie: "Pr",
  radial: "Radl",
  ramp: "Ramp",
  ranch: "Rnch",
  rapid: "Rpd",
  rest: "Rst",
  ridge: "Rdg",
  river: "Riv",
  road: "Rd",
  route: "Rte",
  row: "Row",
  rue: "Rue",
  run: "Run",
  shoal: "Shl",
  shore: "Shr",
  skyway: "Skwy",
  spring: "Spg",
  spur: "Spur",
  square: "Sq",
  station: "Sta",
  stravenue: "Stra",
  stream: "Strm",
  street: "St",
  summit: "Smt",
  terrace: "Ter",
  throughway: "Trwy",
  trace: "Trce",
  track: "Trak",
  trafficway: "Trfy",
  trail: "Trl",
  trailer: "Trlr",
  tunnel: "Tunl",
  turnpike: "Tpke",
  underpass: "Upas",
  union: "Un",
  valley: "Vly",
  viaduct: "Via",
  view: "Vw",
  village: "Vlg",
  ville: "Vl",
  vista: "Vis",
  walk: "Walk",
  wall: "Wall",
  way: "Way",
  wells: "Wls",
  expressway: "Expy",
  lane: "Ln",
  place: "Pl",
};
const STREET_DIRECTIONS = new Set(["N", "S", "E", "W", "NE", "NW", "SE", "SW"]);

const normalizeStreetName = (value) => {
  const street = toTitleCase(value);
  const words = street.split(/\s+/);
  const finalWord = words[words.length - 1];
  const suffixIndex = STREET_DIRECTIONS.has(finalWord?.toUpperCase())
    ? words.length - 2
    : words.length - 1;
  const suffix = words[suffixIndex];
  if (suffix) {
    const match = suffix.match(/^([a-z]+)([.,]?)$/i);
    if (match) {
      words[suffixIndex] =
        STREET_SUFFIX_ABBREVIATIONS[match[1].toLowerCase()] || suffix;
    }
  }
  return words.join(" ");
};

const escapeHtml = (value) =>
  String(value ?? "").replace(/[&<>"']/g, (character) => {
    const entities = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return entities[character];
  });

const getStreetAddress = (contact) => {
  if (typeof contact.streetAddress === "string") return contact.streetAddress;
  const parts = (contact.address || "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  if (
    contact.country &&
    parts[parts.length - 1]?.toLowerCase() === contact.country.toLowerCase()
  ) {
    parts.pop();
  }
  if (contact.state && parts[parts.length - 1] === contact.state) parts.pop();
  if (contact.city && parts[parts.length - 1] === contact.city) parts.pop();
  return parts.join(", ");
};

const getFormattedContactAddress = (contact) =>
  [
    normalizeStreetName(getStreetAddress(contact)),
    contact.city,
    normalizeLocationState(contact.country, contact.state),
    contact.country,
  ]
    .filter(Boolean)
    .join(", ");

const hasContactCoordinates = (contact) => {
  const latitude = Number(contact.lat);
  const longitude = Number(contact.lng);
  return (
    contact.lat !== undefined &&
    contact.lat !== null &&
    String(contact.lat).trim() !== "" &&
    contact.lng !== undefined &&
    contact.lng !== null &&
    String(contact.lng).trim() !== "" &&
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    Math.abs(latitude) <= 90 &&
    Math.abs(longitude) <= 180
  );
};

const getNavigationUrl = (contact) => {
  const latitude = Number(contact.lat);
  const longitude = Number(contact.lng);
  const hasLatitude =
    contact.lat !== undefined &&
    contact.lat !== null &&
    String(contact.lat).trim() !== "";
  const hasLongitude =
    contact.lng !== undefined &&
    contact.lng !== null &&
    String(contact.lng).trim() !== "";
  const hasCoordinates =
    hasLatitude &&
    hasLongitude &&
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    longitude >= -180 &&
    longitude <= 180;
  const address = getFormattedContactAddress(contact);
  const destination = hasCoordinates ? `${latitude},${longitude}` : address;
  if (!destination) return "";
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}`;
};

const getContactShareText = (contact, notes = [], senderName = "") => {
  const fullName = `${contact.firstName} ${contact.lastName || ""}`.trim();
  const lines = [fullName];
  if (contact.phone) lines.push(`Phone: ${contact.phone}`);
  if (contact.email) lines.push(`Email: ${contact.email}`);
  const address = getFormattedContactAddress(contact);
  if (address) lines.push(`Address: ${address}`);
  const navigationUrl = getNavigationUrl(contact);
  if (navigationUrl) lines.push(`Directions: ${navigationUrl}`);
  notes.forEach((note, index) => {
    const parsedDate = new Date(note.rawDate || note.date || "");
    const dateLabel = Number.isNaN(parsedDate.getTime())
      ? note.date || ""
      : parsedDate.toLocaleString();
    if (index === 0) lines.push("");
    lines.push(`${notes.length > 1 ? "Visit note" : "Last visit note"}${dateLabel ? ` (${dateLabel})` : ""}: ${note.text}`);
  });
  if (senderName) lines.push("", `Shared by ${senderName}`);
  return lines.join("\n");
};

const openAppDatabase = () =>
  new Promise((resolve, reject) => {
    const request = indexedDB.open("return-visits-app", 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore("appData", { keyPath: "key" });
    };
    request.onsuccess = () => {
      request.result.onversionchange = () => request.result.close();
      resolve(request.result);
    };
    request.onerror = () => reject(request.error);
  });

const readStoredValue = (database, key) =>
  new Promise((resolve, reject) => {
    const transaction = database.transaction("appData", "readonly");
    const request = transaction.objectStore("appData").get(key);
    request.onsuccess = () => resolve(request.result?.value);
    request.onerror = () => reject(request.error);
    transaction.onabort = () => reject(transaction.error);
  });

const readStoredKeys = (database) =>
  new Promise((resolve, reject) => {
    const transaction = database.transaction("appData", "readonly");
    const request = transaction.objectStore("appData").getAllKeys();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    transaction.onabort = () => reject(transaction.error);
  });

const writeStoredValue = (database, key, value) =>
  new Promise((resolve, reject) => {
    const transaction = database.transaction("appData", "readwrite");
    transaction.objectStore("appData").put({ key, value });
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });

const writeStoredValues = (database, entries) =>
  new Promise((resolve, reject) => {
    const transaction = database.transaction("appData", "readwrite");
    const store = transaction.objectStore("appData");
    entries.forEach(([key, value]) => store.put({ key, value }));
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });

const replaceStoredValuesIfUnchanged = (
  database,
  expectedEntries,
  replacementEntries,
  deleteKeys = [],
) =>
  new Promise((resolve, reject) => {
    const transaction = database.transaction("appData", "readwrite");
    const store = transaction.objectStore("appData");
    let remainingChecks = expectedEntries.length;
    let dataChanged = false;

    expectedEntries.forEach(([key, expectedValue]) => {
      const request = store.get(key);
      request.onsuccess = () => {
        if (
          JSON.stringify(request.result?.value ?? null) !==
          JSON.stringify(expectedValue ?? null)
        ) {
          dataChanged = true;
          transaction.abort();
          return;
        }
        remainingChecks -= 1;
        if (remainingChecks === 0) {
          replacementEntries.forEach(([replacementKey, value]) =>
            store.put({ key: replacementKey, value }),
          );
          deleteKeys.forEach((key) => store.delete(key));
        }
      };
      request.onerror = () => transaction.abort();
    });

    transaction.oncomplete = () => resolve();
    transaction.onerror = () =>
      reject(
        dataChanged
          ? new Error("Saved data changed during the passphrase update.")
          : transaction.error || new Error("The storage update failed."),
      );
    transaction.onabort = () =>
      reject(
        dataChanged
          ? new Error("Saved data changed during the passphrase update.")
          : transaction.error || new Error("The storage update was aborted."),
      );
  });

const deleteStoredValues = (database, keys) =>
  new Promise((resolve, reject) => {
    const transaction = database.transaction("appData", "readwrite");
    const store = transaction.objectStore("appData");
    keys.forEach((key) => store.delete(key));
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });

const parseLegacyValue = (key) => {
  const value = localStorage.getItem(key);
  return value === null ? undefined : JSON.parse(value);
};

const bytesToBase64 = (bytes) => {
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(
      ...bytes.subarray(offset, offset + chunkSize),
    );
  }
  return btoa(binary);
};

const base64ToBytes = (value) =>
  Uint8Array.from(atob(value), (character) => character.charCodeAt(0));

const createCryptoMetadata = () => ({
  version: 1,
  algorithm: "AES-GCM",
  keyDerivation: "PBKDF2-SHA-256",
  iterations: ENCRYPTION_ITERATIONS,
  salt: bytesToBase64(crypto.getRandomValues(new Uint8Array(16))),
});

const deriveEncryptionKey = async (passphrase, metadata) => {
  const material = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(passphrase),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: base64ToBytes(metadata.salt),
      iterations: metadata.iterations,
      hash: "SHA-256",
    },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
};

const encryptValue = async (value, key) => {
  // No key means passphrase protection is off; data is stored unencrypted.
  if (!key) return value;
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(JSON.stringify(value)),
  );
  return {
    version: 1,
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(new Uint8Array(ciphertext)),
  };
};

const decryptValue = async (encryptedValue, key) => {
  if (!key) return encryptedValue;
  if (
    !encryptedValue ||
    encryptedValue.version !== 1 ||
    !encryptedValue.iv ||
    !encryptedValue.ciphertext
  ) {
    throw new Error("Encrypted data is invalid or unsupported.");
  }
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: base64ToBytes(encryptedValue.iv) },
    key,
    base64ToBytes(encryptedValue.ciphertext),
  );
  return JSON.parse(new TextDecoder().decode(plaintext));
};

// A recovery code is a random 25-character code that unlocks a copy of the
// passphrase stored in the encryption metadata (and therefore in backups).
const RECOVERY_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

const generateRecoveryCode = () => {
  const bytes = crypto.getRandomValues(new Uint8Array(25));
  const chars = Array.from(bytes, (byte) => RECOVERY_ALPHABET[byte % 32]);
  return [0, 5, 10, 15, 20].map((i) => chars.slice(i, i + 5).join("")).join("-");
};

const normalizeRecoveryCode = (input) => {
  const code = String(input ?? "")
    .toUpperCase()
    .replace(/[\s-]/g, "");
  return code.length === 25 && [...code].every((c) => RECOVERY_ALPHABET.includes(c))
    ? code
    : null;
};

const wrapPassphraseWithRecoveryCode = async (passphrase, recoveryCode) => {
  const salt = bytesToBase64(crypto.getRandomValues(new Uint8Array(16)));
  const key = await deriveEncryptionKey(normalizeRecoveryCode(recoveryCode), {
    salt,
    iterations: ENCRYPTION_ITERATIONS,
  });
  return {
    version: 1,
    salt,
    iterations: ENCRYPTION_ITERATIONS,
    ...(await encryptValue(passphrase, key)),
  };
};

const withRecoveryCode = async (metadata, passphrase) => {
  const recoveryCode = generateRecoveryCode();
  return {
    recoveryCode,
    metadata: {
      ...metadata,
      recovery: await wrapPassphraseWithRecoveryCode(passphrase, recoveryCode),
    },
  };
};

// Returns the real passphrase when the input is a valid recovery code for this
// metadata; otherwise returns the input unchanged.
const resolvePassphrase = async (input, metadata) => {
  const code = normalizeRecoveryCode(input);
  const recovery = metadata?.recovery;
  if (!code || !recovery || recovery.version !== 1) return input;
  try {
    if (
      !Number.isInteger(recovery.iterations) ||
      recovery.iterations < 100000 ||
      recovery.iterations > 1000000
    ) {
      return input;
    }
    const key = await deriveEncryptionKey(code, recovery);
    const passphrase = await decryptValue(recovery, key);
    return typeof passphrase === "string" ? passphrase : input;
  } catch (error) {
    return input;
  }
};

const showRecoveryCodeDialog = (recoveryCode) =>
  new Promise((resolve) => {
    const dialog = document.getElementById("recovery-code-dialog");
    const display = document.getElementById("recovery-code-value");
    const copyStatus = document.getElementById("recovery-code-copy-status");
    display.textContent = recoveryCode;
    copyStatus.textContent = "";
    const copyButton = document.getElementById("btn-copy-recovery-code");
    const doneButton = document.getElementById("btn-recovery-code-done");
    const onCancel = (event) => event.preventDefault();
    const onCopy = async () => {
      try {
        await navigator.clipboard.writeText(recoveryCode);
        copyStatus.textContent = "Copied. Paste it somewhere safe.";
      } catch (error) {
        copyStatus.textContent = "Could not copy. Write the code down instead.";
      }
    };
    const onDone = () => {
      copyButton.removeEventListener("click", onCopy);
      doneButton.removeEventListener("click", onDone);
      dialog.removeEventListener("cancel", onCancel);
      display.textContent = "";
      dialog.close();
      resolve();
    };
    copyButton.addEventListener("click", onCopy);
    doneButton.addEventListener("click", onDone);
    dialog.addEventListener("cancel", onCancel);
    dialog.showModal();
  });

const PLAIN_CONTACT_FORMAT = "return-visits-contact";

const ICON_PATHS = {
  plus: '<path d="M12 5v14M5 12h14"/>',
  home: '<path d="M3 11l9-8 9 8M5 10v10h5v-6h4v6h5V10"/>',
  print: '<path d="M6 9V3h12v6M6 18H4v-7h16v7h-2M7 14h10v7H7z"/>',
  export: '<path d="M12 15V3M8 7l4-4 4 4M4 14v6h16v-6"/>',
  import: '<path d="M12 3v12M8 11l4 4 4-4M4 14v6h16v-6"/>',
  share:
    '<circle cx="18" cy="5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="19" r="2.5"/><path d="M8.2 10.8l7.6-4.6M8.2 13.2l7.6 4.6"/>',
};

const iconSvg = (name) =>
  `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICON_PATHS[name]}</svg>`;
const PLAIN_CONTACTS_FORMAT = "return-visits-contacts";
const ENCRYPTED_CONTACTS_FORMAT = "return-visits-encrypted-contacts";

const isSupportedEncryptionMetadata = (metadata) =>
  metadata?.version === 1 &&
  metadata.algorithm === "AES-GCM" &&
  metadata.keyDerivation === "PBKDF2-SHA-256" &&
  Number.isInteger(metadata.iterations) &&
  metadata.iterations >= 100000 &&
  metadata.iterations <= 1000000 &&
  base64ToBytes(metadata.salt).length === 16;

const decryptContactTransfer = async (transfer, passphrase) => {
  let contact;
  if (transfer.format === PLAIN_CONTACT_FORMAT && transfer.version === 1) {
    contact = transfer.data;
  } else {
    const metadata = transfer.encryption;
    if (
      transfer.format !== "return-visits-encrypted-contact" ||
      transfer.version !== 1 ||
      metadata?.version !== 1 ||
      metadata.algorithm !== "AES-GCM" ||
      metadata.keyDerivation !== "PBKDF2-SHA-256" ||
      !Number.isInteger(metadata.iterations) ||
      metadata.iterations < 100000 ||
      metadata.iterations > 1000000 ||
      base64ToBytes(metadata.salt).length !== 16
    ) {
      throw new Error("This is not a supported contact file.");
    }
    const encryptionKey = await deriveEncryptionKey(passphrase, metadata);
    contact = await decryptValue(transfer.data, encryptionKey);
  }
  return normalizeTransferredContact(contact);
};

const normalizeTransferredContact = (contact) => {
  if (
    !contact ||
    (typeof contact.id !== "number" && typeof contact.id !== "string") ||
    typeof contact.firstName !== "string" ||
    typeof contact.lastName !== "string" ||
    (contact.notesHistory &&
      (!Array.isArray(contact.notesHistory) ||
        !contact.notesHistory.every(
          (note) => note && typeof note.text === "string",
        ))) ||
    (contact.areas &&
      (!Array.isArray(contact.areas) ||
        !contact.areas.every((area) => typeof area === "string"))) ||
    (contact.areaAssignments &&
      (!Array.isArray(contact.areaAssignments) ||
        !contact.areaAssignments.every(
          (area) =>
            area &&
            typeof area.name === "string" &&
            typeof area.region === "string" &&
            (area.city === undefined || typeof area.city === "string"),
        ))) ||
    ["country", "city", "region", "area", "state", "streetAddress"].some(
      (field) =>
        contact[field] !== undefined && typeof contact[field] !== "string",
    ) ||
    ["email", "phone"].some(
      (field) =>
        contact[field] !== undefined && typeof contact[field] !== "string",
    )
  ) {
    throw new Error("The contact file contents are invalid.");
  }
  return {
    ...contact,
    region:
      contact.region ||
      contact.areaAssignments?.[0]?.region ||
      contact.areas
        ?.map((areaName) =>
          contact.areaAssignments?.find((assignment) => assignment.name === areaName)
            ?.region,
        )
        .find(Boolean) ||
      "",
    area:
      contact.area ||
      contact.areas?.[0] ||
      contact.areaAssignments?.[0]?.name ||
      "",
    email: contact.email || "",
    phone: contact.phone || "",
    areaAssignments: contact.areaAssignments || [],
    notesHistory: contact.notesHistory || [],
  };
};

// Reads a file holding one contact or several, plain or encrypted.
const decryptContactsTransfer = async (transfer, passphrase) => {
  let contactList;
  if (transfer.format === PLAIN_CONTACTS_FORMAT && transfer.version === 1) {
    contactList = transfer.data?.contacts;
  } else if (
    transfer.format === ENCRYPTED_CONTACTS_FORMAT &&
    transfer.version === 1
  ) {
    if (!isSupportedEncryptionMetadata(transfer.encryption)) {
      throw new Error("This is not a supported contact file.");
    }
    const transferKey = await deriveEncryptionKey(
      passphrase,
      transfer.encryption,
    );
    contactList = (await decryptValue(transfer.data, transferKey))?.contacts;
  } else {
    return [await decryptContactTransfer(transfer, passphrase)];
  }
  if (!Array.isArray(contactList) || !contactList.length) {
    throw new Error("The contact file contains no contacts.");
  }
  return contactList.map(normalizeTransferredContact);
};

const getContactLastActivity = (contact) => {
  const noteDates = (contact.notesHistory || [])
    .map((note) => note?.rawDate)
    .filter((date) => date && !Number.isNaN(new Date(date).getTime()));
  const candidates = [contact.createdAt, ...noteDates].filter(
    (date) => date && !Number.isNaN(new Date(date).getTime()),
  );
  if (!candidates.length) return EPOCH_TIMESTAMP;
  return candidates
    .map((date) => new Date(date).toISOString())
    .sort()
    .pop();
};

const normalizeTimeTracking = (value) => {
  const source = value && typeof value === "object" ? value : {};
  const enabled = source.enabled === true;
  const runningSince =
    enabled &&
    typeof source.runningSince === "string" &&
    !Number.isNaN(Date.parse(source.runningSince))
      ? source.runningSince
      : null;
  const entries = enabled && Array.isArray(source.entries) ? source.entries : [];
  return {
    enabled,
    showMonthly: source.showMonthly !== false,
    showYearly: source.showYearly !== false,
    runningSince,
    entries: entries
      .filter(
        (entry) =>
          entry &&
          entry.id !== undefined &&
          /^\d{4}-\d{2}-\d{2}$/.test(entry.date || "") &&
          Number(entry.seconds) > 0,
      )
      .map((entry) => ({
        id: String(entry.id),
        date: entry.date,
        seconds: Math.round(Number(entry.seconds)),
        note: typeof entry.note === "string" ? entry.note : "",
      })),
    deleted:
      enabled && Array.isArray(source.deleted)
        ? source.deleted.filter((id) => typeof id === "string")
        : [],
  };
};

const normalizeRegionData = (settings, contacts) => {
  if ((Number(settings.schemaVersion) || 1) > SCHEMA_VERSION) {
    throw new NewerDataVersionError();
  }
  const normalizedSettings = { ...settings };
  const defaultCountry = normalizeCountry(
    settings.me?.country || settings.country || DEFAULT_SETTINGS.country,
  );
  const countries = [
    ...new Set([
      ...DEFAULT_COUNTRIES,
      ...(Array.isArray(settings.countries) ? settings.countries : [])
        .filter((country) => typeof country === "string" && country.trim())
        .map(normalizeCountry),
      defaultCountry,
    ]),
  ];
  const cities = Array.isArray(settings.cities)
    ? [...new Set(settings.cities.filter((city) => typeof city === "string"))]
    : [...DEFAULT_SETTINGS.cities];
  const defaultCity = cities.includes(settings.defaultCity)
    ? settings.defaultCity
    : cities[0] || "";
  const legacyAreaDefinitions = (settings.areas || []).map((area) =>
    typeof area === "string"
      ? { name: area, region: "Unassigned" }
      : { name: area.name, region: area.region || "", city: area.city },
  );
  const originalRegions = Array.isArray(settings.regions)
    ? settings.regions
    : DEFAULT_SETTINGS.regions;
  const regionDefinitions = [];
  const areaDefinitions = [];
  const addRegion = (name, city) => {
    if (!name || !city) return;
    if (
      !regionDefinitions.some(
        (region) => region.name === name && region.city === city,
      )
    ) {
      regionDefinitions.push({ name, city });
    }
  };
  // An area belongs to a city only; it is independent of any region.
  const addArea = (name, city) => {
    if (!name || !city) return;
    if (!areaDefinitions.some((area) => area.name === name && area.city === city)) {
      areaDefinitions.push({ name, city });
    }
  };
  if (typeof settings.me?.city === "string" && settings.me.city) {
    if (!cities.includes(settings.me.city)) cities.push(settings.me.city);
    if (settings.me.region) addRegion(settings.me.region, settings.me.city);
    if (settings.me.area) addArea(settings.me.area, settings.me.city);
  }

  if (
    originalRegions.every(
      (region) => region && typeof region === "object" && region.name,
    )
  ) {
    originalRegions.forEach((region) => {
      const regionCities = region.city ? [region.city] : cities;
      regionCities.forEach((city) => addRegion(region.name, city));
    });
  } else {
    originalRegions.forEach((region) => {
      if (typeof region === "string") {
        cities.forEach((city) => addRegion(region, city));
      }
    });
  }

  contacts.forEach((contact) => {
    const city = typeof contact.city === "string" ? contact.city : defaultCity;
    if (city && !cities.includes(city)) cities.push(city);
    const legacyAreaNames = Array.isArray(contact.areas)
      ? contact.areas
      : contact.area
        ? [contact.area]
        : [];
    const firstArea =
      legacyAreaNames.find((area) => typeof area === "string") || "";
    const areaDefinition = legacyAreaDefinitions.find(
      (area) => area.name === firstArea,
    );
    const region =
      typeof contact.region === "string" && contact.region
        ? contact.region
        : areaDefinition?.region || "";
    if (region) addRegion(region, city);
    if (firstArea) addArea(firstArea, city);
  });

  legacyAreaDefinitions.forEach((area) => {
    const matchingContacts = contacts.filter((contact) => {
      const assignedAreas = Array.isArray(contact.areas)
        ? contact.areas
        : contact.area
          ? [contact.area]
          : [];
      return assignedAreas.includes(area.name);
    });
    const areaCities = area.city
      ? [area.city]
      : matchingContacts.length
        ? matchingContacts.map((contact) => contact.city || defaultCity)
        : [defaultCity];
    areaCities.forEach((city) => {
      if (city && !cities.includes(city)) cities.push(city);
      if (area.region && area.region !== "Unassigned") {
        addRegion(area.region, city);
      }
      addArea(area.name, city);
    });
  });

  const normalizedContacts = contacts.map((contact) => {
    const legacyAreaNames = Array.isArray(contact.areas)
      ? contact.areas
      : contact.area
        ? [contact.area]
        : [];
    const areaName =
      legacyAreaNames.find((area) => typeof area === "string") || "";
    const city = typeof contact.city === "string" ? contact.city : defaultCity;
    const candidateRegion =
      (typeof contact.region === "string" && contact.region) ||
      legacyAreaDefinitions.find((area) => area.name === areaName)?.region ||
      "";
    const region = regionDefinitions.some(
      (item) => item.name === candidateRegion && item.city === city,
    )
      ? candidateRegion
      : "";
    const rest = { ...contact };
    delete rest.areas;
    delete rest.areaAssignments;
    return {
      ...rest,
      country: normalizeCountry(contact.country || defaultCountry),
      city,
      region,
      area: areaDefinitions.some(
        (area) => area.name === areaName && area.city === city,
      )
        ? areaName
        : "",
      streetAddress: getStreetAddress(contact),
      updatedAt: contact.updatedAt || getContactLastActivity(contact),
    };
  });

  normalizedSettings.schemaVersion = SCHEMA_VERSION;
  normalizedSettings.timeTracking = normalizeTimeTracking(settings.timeTracking);
  normalizedSettings.country = defaultCountry;
  normalizedSettings.countries = countries;
  if (normalizedSettings.me) {
    normalizedSettings.me = {
      ...normalizedSettings.me,
      country: normalizeCountry(normalizedSettings.me.country || defaultCountry),
      state: normalizeLocationState(
        normalizedSettings.me.country || defaultCountry,
        normalizedSettings.me.state,
      ),
    };
  }
  normalizedSettings.deletedContacts = Array.isArray(settings.deletedContacts)
    ? settings.deletedContacts.filter(
        (entry) => entry && entry.id !== undefined && entry.deletedAt,
      )
    : [];
  normalizedSettings.cities = cities;
  normalizedSettings.defaultCity = defaultCity;
  normalizedSettings.regions = regionDefinitions;
  normalizedSettings.areas = areaDefinitions;
  return { settings: normalizedSettings, contacts: normalizedContacts };
};

const decryptBackup = async (backup, passphrase) => {
  if (passphrase !== null && passphrase.length < 8) {
    throw new Error("The backup passphrase must be at least 8 characters.");
  }
  if (
    backup.format === "return-visits-backup" &&
    backup.version === 1 &&
    backup.settings &&
    Array.isArray(backup.contacts)
  ) {
    if (
      !Array.isArray(backup.settings.cities) ||
      !Array.isArray(backup.settings.areas) ||
      !backup.contacts.every(
        (contact) =>
          contact &&
          (typeof contact.id === "number" ||
            typeof contact.id === "string") &&
          typeof contact.firstName === "string" &&
          ["email", "phone"].every(
            (field) =>
              contact[field] === undefined ||
              typeof contact[field] === "string",
          ),
      )
    ) {
      throw new Error("The backup contents are invalid.");
    }
    const metadata = passphrase === null ? null : createCryptoMetadata();
    const encryptionKey =
      passphrase === null
        ? null
        : await deriveEncryptionKey(passphrase, metadata);
    const normalized = normalizeRegionData(
      backup.settings,
      backup.contacts,
    );
    return {
      metadata,
      encryptionKey,
      settings: normalized.settings,
      contacts: normalized.contacts,
      encryptedSettings: await encryptValue(
        normalized.settings,
        encryptionKey,
      ),
      encryptedContacts: await encryptValue(
        normalized.contacts,
        encryptionKey,
      ),
      wasLegacyPlaintext: true,
    };
  }

  if (passphrase === null) {
    throw new Error("This backup requires a passphrase.");
  }
  const metadata = backup.encryption;
  if (
    backup.format !== "return-visits-encrypted-backup" ||
    backup.version !== 1 ||
    metadata?.version !== 1 ||
    metadata.algorithm !== "AES-GCM" ||
    metadata.keyDerivation !== "PBKDF2-SHA-256" ||
    !Number.isInteger(metadata.iterations) ||
    metadata.iterations < 100000 ||
    metadata.iterations > 1000000 ||
    !backup.data?.settings ||
    !backup.data?.contacts ||
    base64ToBytes(metadata.salt).length !== 16
  ) {
    throw new Error("This is not a supported encrypted backup file.");
  }
  const encryptionKey = await deriveEncryptionKey(
    await resolvePassphrase(passphrase, metadata),
    metadata,
  );
  const [settings, contacts] = await Promise.all([
    decryptValue(backup.data.settings, encryptionKey),
    decryptValue(backup.data.contacts, encryptionKey),
  ]);
  if (
    !settings ||
    !Array.isArray(settings.cities) ||
    !Array.isArray(settings.areas) ||
    !Array.isArray(contacts) ||
    !contacts.every(
      (contact) =>
        contact &&
        (typeof contact.id === "number" || typeof contact.id === "string") &&
        typeof contact.firstName === "string" &&
        ["email", "phone"].every(
          (field) =>
            contact[field] === undefined ||
            typeof contact[field] === "string",
        ),
    )
  ) {
    throw new Error("The backup contents are invalid.");
  }
  const normalized = normalizeRegionData(settings, contacts);
  return {
    metadata,
    encryptionKey,
    settings: normalized.settings,
    contacts: normalized.contacts,
    encryptedSettings: await encryptValue(
      normalized.settings,
      encryptionKey,
    ),
    encryptedContacts: await encryptValue(
      normalized.contacts,
      encryptionKey,
    ),
    wasLegacyPlaintext: false,
  };
};

const encryptStoredValue = async (database, storageKey, value, encryptionKey) =>
  writeStoredValue(
    database,
    storageKey,
    await encryptValue(value, encryptionKey),
  );

const dismissUnlockScreen = (screen) => {
  screen.remove();
  const appContainer = document.getElementById("app-container");
  appContainer.removeAttribute("inert");
  appContainer.setAttribute("aria-hidden", "false");
};

// Update this version when the Terms of Use or Privacy & Data Notice changes.
const USER_AGREEMENT_VERSION = "2026-10-30";
const requireUserAgreement = () => {
  const screen = document.getElementById("unlock-screen");
  const agreementPanel = document.getElementById("agreement-panel");
  const unlockContent = document.getElementById("unlock-content");
  const checkbox = document.getElementById("user-agreement-checkbox");
  const acceptButton = document.getElementById("btn-accept-agreement");
  const errorMessage = document.getElementById("agreement-error");
  let acceptedVersion = null;
  try {
    acceptedVersion = localStorage.getItem("return_visits_agreement_version");
  } catch (error) {
    console.error("Unable to check the user agreement status:", error);
    errorMessage.textContent =
      "We could not check this device's agreement status. You may review and accept the notices again to continue.";
    errorMessage.hidden = false;
  }

  if (acceptedVersion === USER_AGREEMENT_VERSION) {
    agreementPanel.hidden = true;
    unlockContent.hidden = false;
    return Promise.resolve();
  }

  screen.hidden = false;
  acceptButton.disabled = !checkbox.checked;
  checkbox.addEventListener("change", () => {
    acceptButton.disabled = !checkbox.checked;
  });

  return new Promise((resolve) => {
    acceptButton.addEventListener("click", () => {
      if (!checkbox.checked) return;
      acceptButton.disabled = true;
      errorMessage.hidden = true;
      try {
        localStorage.setItem(
          "return_visits_agreement_version",
          USER_AGREEMENT_VERSION,
        );
      } catch (error) {
        console.error("Unable to save the user agreement status:", error);
        errorMessage.textContent =
          "We could not save your agreement on this device. Check your browser storage settings and try again.";
        errorMessage.hidden = false;
        acceptButton.disabled = false;
        return;
      }
      agreementPanel.hidden = true;
      unlockContent.hidden = false;
      resolve();
    });
  });
};

const createUnlockPrompt = (hasEncryption) => {
  const screen = document.getElementById("unlock-screen");
  document.getElementById("unlock-title").textContent = hasEncryption
    ? "Unlock Nice Return Visits"
    : "First-time use";
  const description = document.getElementById("unlock-description");
  document.getElementById("first-use-notice").hidden = hasEncryption;
  const confirmContainer = document.getElementById(
    "confirm-passphrase-container",
  );
  const confirmInput = document.getElementById(
    "confirm-encryption-passphrase",
  );
  const passphraseInput = document.getElementById("encryption-passphrase");
  const submitButton = document.getElementById("unlock-submit");
  const errorMessage = document.getElementById("unlock-error");

  confirmContainer.hidden = hasEncryption;
  confirmInput.required = !hasEncryption;
  description.textContent = hasEncryption
    ? "Enter your passphrase to decrypt and open your local contact database."
    : `Create a passphrase to encrypt this device's contact database. Use at least ${MIN_PASSPHRASE_LENGTH} characters and keep it safe.`;
  submitButton.textContent = hasEncryption ? "Unlock" : "Encrypt and Continue";
  screen.hidden = false;
  return { screen, passphraseInput, confirmInput, submitButton, errorMessage };
};

const initializeAppData = async () => {
  const database = await openAppDatabase();
  const [storedKeys, storedSettingsBeforeInit, storedContactsBeforeInit, existingMetadata] =
    await Promise.all([
      readStoredKeys(database),
      readStoredValue(database, "settings"),
      readStoredValue(database, "contacts"),
      readStoredValue(database, ENCRYPTION_META_KEY),
    ]);
  const defaultSettings = normalizeRegionData(DEFAULT_SETTINGS, []).settings;
  const hasMeaningfulStoredSettings =
    storedSettingsBeforeInit !== undefined &&
    JSON.stringify(storedSettingsBeforeInit) !== JSON.stringify(defaultSettings);
  const hasMeaningfulStoredContacts =
    storedContactsBeforeInit !== undefined &&
    (!Array.isArray(storedContactsBeforeInit) ||
      storedContactsBeforeInit.length > 0);
  const hasPriorSetupInProgress =
    localStorage.getItem("return_visits_setup_pending") === "true";
  const hasPriorSetupDismissal =
    localStorage.getItem("return_visits_onboarding_v2_dismissed") === "true";
  const hasMeaningfulLocalState = [
    "return_visits_settings",
    "return_visits_contacts",
    INSTALLED_SETUP_COMPLETE_KEY,
    "return_visits_dropbox",
  ].some((key) => localStorage.getItem(key) !== null);
  const hasOtherStoredData = storedKeys.some(
    (key) => key !== "settings" && key !== "contacts",
  );
  const existingStateDetected =
    Boolean(existingMetadata) ||
    hasOtherStoredData ||
    hasMeaningfulStoredSettings ||
    hasMeaningfulStoredContacts ||
    hasMeaningfulLocalState ||
    (hasPriorSetupDismissal && !hasPriorSetupInProgress);
  if (!existingMetadata && !REQUIRE_PASSPHRASE_ON_FIRST_USE) {
    const [storedSettings, storedContacts] = await Promise.all([
      readStoredValue(database, "settings"),
      readStoredValue(database, "contacts"),
    ]);
    const { settings, contacts } = normalizeRegionData(
      storedSettings ??
        parseLegacyValue("return_visits_settings") ??
        DEFAULT_SETTINGS,
      storedContacts ?? parseLegacyValue("return_visits_contacts") ?? [],
    );
    await writeStoredValues(database, [
      ["settings", settings],
      ["contacts", contacts],
    ]);
    localStorage.removeItem("return_visits_settings");
    localStorage.removeItem("return_visits_contacts");
    dismissUnlockScreen(document.getElementById("unlock-screen"));
    return {
      database,
      settings,
      contacts,
      encryptionKey: null,
      metadata: null,
      existingStateDetected,
      restoredFromBackup: false,
    };
  }
  const prompt = createUnlockPrompt(Boolean(existingMetadata));

  return new Promise((resolve) => {
    const initialBackupInput = document.getElementById(
      "initial-backup-file-input",
    );
    const initialRestoreButton = document.getElementById(
      "btn-initial-restore",
    );
    initialRestoreButton.addEventListener("click", () =>
      initialBackupInput.click(),
    );
    initialBackupInput.addEventListener("change", async () => {
      const file = initialBackupInput.files[0];
      if (!file) return;
      initialRestoreButton.disabled = true;
      prompt.errorMessage.textContent = "";
      try {
        const passphrase = prompt.passphraseInput.value;
        if (!passphrase) {
          throw new Error("Enter the backup passphrase before restoring.");
        }
        const backup = JSON.parse(await file.text());
        const restored = await decryptBackup(backup, passphrase);
        if (
          restored.wasLegacyPlaintext &&
          !confirm(
            "This older backup is not encrypted. It will be encrypted with the passphrase you entered when restored. Continue?",
          )
        ) {
          return;
        }
        const [storedSettings, storedContacts] = await Promise.all([
          readStoredValue(database, "settings"),
          readStoredValue(database, "contacts"),
        ]);
        if (
          (existingMetadata ||
            storedSettings !== undefined ||
            storedContacts !== undefined ||
            localStorage.getItem("return_visits_settings") !== null ||
            localStorage.getItem("return_visits_contacts") !== null) &&
          !confirm(
            "Restoring this backup will replace the data currently stored on this device. Continue?",
          )
        ) {
          return;
        }
        await writeStoredValues(database, [
          ["settings", restored.encryptedSettings],
          ["contacts", restored.encryptedContacts],
          [ENCRYPTION_META_KEY, restored.metadata],
        ]);
        localStorage.removeItem("return_visits_settings");
        localStorage.removeItem("return_visits_contacts");
        localStorage.setItem("return_visits_last_backup_reminder", Date.now());
        dismissUnlockScreen(prompt.screen);
        resolve({
          database,
          settings: restored.settings,
          contacts: restored.contacts,
          encryptionKey: restored.encryptionKey,
          metadata: restored.metadata,
          existingStateDetected,
          restoredFromBackup: true,
        });
      } catch (error) {
        console.error("Unable to restore encrypted backup during startup:", error);
        prompt.errorMessage.textContent =
          error.message === "Enter the backup passphrase before restoring." ||
          error instanceof NewerDataVersionError
            ? error.message
            : "Could not restore that backup. Check that the file is valid and the passphrase is correct.";
      } finally {
        initialBackupInput.value = "";
        initialRestoreButton.disabled = false;
      }
    });

    prompt.passphraseInput.focus();
    document
      .getElementById("unlock-form")
      .addEventListener("submit", async (event) => {
        event.preventDefault();
        prompt.submitButton.disabled = true;
        prompt.errorMessage.textContent = "";
        try {
          const passphrase = prompt.passphraseInput.value;
          let metadata = existingMetadata;
          let encryptionKey;
          let settings;
          let contacts;

          let usedRecoveryCode = false;
          let newRecoveryCode = null;

          if (metadata) {
            const resolvedPassphrase = await resolvePassphrase(
              passphrase,
              metadata,
            );
            usedRecoveryCode = resolvedPassphrase !== passphrase;
            encryptionKey = await deriveEncryptionKey(
              resolvedPassphrase,
              metadata,
            );
            const [storedEncryptedSettings, storedEncryptedContacts] = await Promise.all([
              readStoredValue(database, "settings"),
              readStoredValue(database, "contacts"),
            ]);
            [settings, contacts] = await Promise.all([
              decryptValue(storedEncryptedSettings, encryptionKey),
              decryptValue(storedEncryptedContacts, encryptionKey),
            ]);
            if (
              !settings ||
              !Array.isArray(settings.cities) ||
              !Array.isArray(settings.areas) ||
              !Array.isArray(contacts)
            ) {
              throw new Error("The encrypted database contents are invalid.");
            }
            const normalized = normalizeRegionData(settings, contacts);
            settings = normalized.settings;
            contacts = normalized.contacts;
            if (
              JSON.stringify(settings) !==
                JSON.stringify(
                  await decryptValue(storedEncryptedSettings, encryptionKey),
                ) ||
              JSON.stringify(contacts) !==
                JSON.stringify(
                  await decryptValue(storedEncryptedContacts, encryptionKey),
                )
            ) {
              await writeStoredValues(database, [
                ["settings", await encryptValue(settings, encryptionKey)],
                ["contacts", await encryptValue(contacts, encryptionKey)],
              ]);
            }
            localStorage.removeItem("return_visits_settings");
            localStorage.removeItem("return_visits_contacts");
          } else {
            if (passphrase.length < MIN_PASSPHRASE_LENGTH) {
              throw new Error(
                `Use a passphrase with at least ${MIN_PASSPHRASE_LENGTH} characters.`,
              );
            }
            if (passphrase !== prompt.confirmInput.value) {
              throw new Error("The passphrases do not match.");
            }

            const [storedSettings, storedContacts] = await Promise.all([
              readStoredValue(database, "settings"),
              readStoredValue(database, "contacts"),
            ]);
            settings =
              storedSettings ??
              parseLegacyValue("return_visits_settings") ??
              DEFAULT_SETTINGS;
            contacts =
              storedContacts ??
              parseLegacyValue("return_visits_contacts") ??
              [];
            ({ settings, contacts } = normalizeRegionData(settings, contacts));
            metadata = createCryptoMetadata();
            encryptionKey = await deriveEncryptionKey(passphrase, metadata);
            ({ metadata, recoveryCode: newRecoveryCode } = await withRecoveryCode(
              metadata,
              passphrase,
            ));
            const encryptedSettings = await encryptValue(settings, encryptionKey);
            const encryptedContacts = await encryptValue(contacts, encryptionKey);
            await writeStoredValues(database, [
              ["__migration_settings", encryptedSettings],
              ["__migration_contacts", encryptedContacts],
            ]);
            const [verifiedSettings, verifiedContacts] = await Promise.all([
              decryptValue(
                await readStoredValue(database, "__migration_settings"),
                encryptionKey,
              ),
              decryptValue(
                await readStoredValue(database, "__migration_contacts"),
                encryptionKey,
              ),
            ]);
            if (
              JSON.stringify(verifiedSettings) !== JSON.stringify(settings) ||
              JSON.stringify(verifiedContacts) !== JSON.stringify(contacts)
            ) {
              throw new Error("Encrypted data verification did not match.");
            }
            await writeStoredValues(database, [
              ["settings", encryptedSettings],
              ["contacts", encryptedContacts],
              [ENCRYPTION_META_KEY, metadata],
            ]);
            await deleteStoredValues(database, [
              "__migration_settings",
              "__migration_contacts",
            ]);
            localStorage.removeItem("return_visits_settings");
            localStorage.removeItem("return_visits_contacts");
          }

          dismissUnlockScreen(prompt.screen);
          if (newRecoveryCode) await showRecoveryCodeDialog(newRecoveryCode);
          if (usedRecoveryCode) {
            alert(
              "Unlocked with your recovery code. Open Settings → Data/Security → Passphrase to Open App and choose a new passphrase; you can enter your recovery code as the current passphrase. You will also get a new recovery code.",
            );
          }
          resolve({
            database,
            settings,
            contacts,
            encryptionKey,
            metadata,
            existingStateDetected,
            restoredFromBackup: false,
          });
        } catch (error) {
          console.error("Unable to unlock or encrypt local data:", error);
          prompt.errorMessage.textContent =
            error instanceof NewerDataVersionError
              ? error.message
              : existingMetadata
            ? "The passphrase was incorrect, or the encrypted data could not be read."
            : error.message ||
              "Could not encrypt existing data. The original data was preserved.";
          prompt.passphraseInput.select();
        } finally {
          prompt.submitButton.disabled = false;
        }
      });
  });
};

const showStorageError = (action, error) => {
  console.error(`Unable to ${action}:`, error);
  alert(
    `Could not ${action}. Your changes may not have been saved. Please try again.`,
  );
};

const LAST_BACKUP_KEY = "return_visits_last_backup_at";
const LAST_BACKUP_PROMPT_KEY = "return_visits_last_backup_prompt";
const markBackupDone = () => {
  try {
    localStorage.setItem(LAST_BACKUP_KEY, String(Date.now()));
    localStorage.removeItem(LAST_BACKUP_PROMPT_KEY);
  } catch (error) {
    console.error("Unable to save the backup time:", error);
  }
};
// Set once the app is running; called after saves so a connected Dropbox
// backup can follow.
let cloudBackupHook = () => {};

const initializeApp = async () => {
  await requireUserAgreement();
  if (!isInstalledApp()) {
    showBrowserInstallGuide();
    return;
  }
  if (window.RVDropbox) await window.RVDropbox.ready;
  const {
    database,
    settings: savedSettings,
    contacts: savedContacts,
    encryptionKey: initialEncryptionKey,
    metadata: initialMetadata,
    existingStateDetected,
    restoredFromBackup,
  } =
    await initializeAppData();
  let encryptionKey = initialEncryptionKey;
  let cryptoMetadata = initialMetadata;

  // Settings State & Lists
  let settings = savedSettings;
  settings.country = normalizeCountry(settings.country);
  settings.state = normalizeLocationState(settings.country, settings.state);
  settings.timeTracking = normalizeTimeTracking(settings.timeTracking);
  const saveSettings = () =>
    encryptStoredValue(database, "settings", settings, encryptionKey).then(
      (result) => {
        cloudBackupHook();
        return result;
      },
    );

  // Populate Settings View Form
  document.getElementById("setting-state").value = settings.state;
  document.getElementById("setting-default-city").value =
    toTitleCase(settings.defaultCity || "");

  // Populate All Dropdowns (Filters & Modal Selects)
  let selectedContactArea = "";
  let selectedContactRegion = "";
  const countrySelects = [
    document.getElementById("me-country"),
    document.getElementById("contact-country"),
  ];
  const populateCountryOptions = () => {
    countrySelects.forEach((select) => {
      const currentCountry = select.value || settings.country;
      select.innerHTML = "";
      [...DEFAULT_COUNTRIES, ...settings.countries.filter(
        (country) => !DEFAULT_COUNTRIES.includes(country),
      )].forEach((country) => {
        const option = document.createElement("option");
        option.value = country;
        option.textContent = country;
        select.appendChild(option);
      });
      const addCountryOption = document.createElement("option");
      addCountryOption.value = "__ADD_COUNTRY__";
      addCountryOption.textContent = "+ Country";
      select.appendChild(addCountryOption);
      select.value = Array.from(select.options).some(
        (option) => option.value === currentCountry,
      )
        ? currentCountry
        : settings.country;
      select.dataset.selectedCountry = select.value;
    });
  };
  populateCountryOptions();
  const compareNames = (a, b) =>
    a.localeCompare(b, undefined, { sensitivity: "base", numeric: true });
  const sortLocations = () => {
    settings.cities.sort(compareNames);
    settings.regions.sort(
      (a, b) => compareNames(a.city, b.city) || compareNames(a.name, b.name),
    );
    settings.areas.sort(
      (a, b) => compareNames(a.city, b.city) || compareNames(a.name, b.name),
    );
  };
  const addCity = (cityName) => {
    settings.cities.push(cityName);
  };
  const rollbackNewCity = (cityName) => {
    settings.cities = settings.cities.filter((city) => city !== cityName);
    settings.regions = settings.regions.filter(
      (region) => region.city !== cityName,
    );
  };
  const populateDropdowns = () => {
    sortLocations();
    const citySelect = document.getElementById("contact-city-select");
    const cityOptions = document.getElementById("contact-city-options");
    const meCityInput = document.getElementById("me-city");
    const currentCityVal = citySelect.value;
    cityOptions.innerHTML = "";
    const addCityOpt = document.createElement("option");
    addCityOpt.value = "+ Add New City...";
    cityOptions.appendChild(addCityOpt);
    settings.cities.forEach((city) => {
      const opt = document.createElement("option");
      opt.value = city;
      cityOptions.appendChild(opt);
    });
    citySelect.value = currentCityVal;
    const meCityOptions = document.getElementById("me-city-options");
    const currentMeCity = meCityInput.value;
    meCityOptions.innerHTML = "";
    const addMeCityOption = document.createElement("option");
    addMeCityOption.value = "+ Add New City...";
    meCityOptions.appendChild(addMeCityOption);
    settings.cities.forEach((city) => {
      const option = document.createElement("option");
      option.value = city;
      meCityOptions.appendChild(option);
    });
    meCityInput.value = currentMeCity;

    const filterCity = document.getElementById("filter-city");
    const currentCityFilter = filterCity.value;
    filterCity.innerHTML = '<option value="">All Cities</option>';
    settings.cities.forEach((city) => {
      const opt = document.createElement("option");
      opt.value = city;
      opt.textContent = city;
      filterCity.appendChild(opt);
    });
    filterCity.value = currentCityFilter;

    const contactRegion = document.getElementById("contact-region-select");
    const contactArea = document.getElementById("contact-area-select");
    const meRegion = document.getElementById("me-region");
    const meArea = document.getElementById("me-area");
    const populateMeRegionArea = (selectedRegion = "", selectedArea = "") => {
      const city = meCityInput.value.trim();
      meRegion.innerHTML = '<option value="">Choose a region (optional)</option>';
      settings.regions
        .filter((region) => region.city === city)
        .forEach((region) => {
          const option = document.createElement("option");
          option.value = region.name;
          option.textContent = region.name;
          meRegion.appendChild(option);
        });
      const addRegion = document.createElement("option");
      addRegion.value = "__ADD_NEW__";
      addRegion.textContent = "+ Add New Region...";
      meRegion.appendChild(addRegion);
      meRegion.disabled =
        !document.getElementById("me-country").value ||
        !document.getElementById("me-state").value.trim() ||
        !city ||
        !settings.cities.includes(city);
      meRegion.value = selectedRegion;

      meArea.innerHTML = '<option value="">Choose an area (optional)</option>';
      settings.areas
        .filter((area) => area.city === city)
        .forEach((area) => {
          const option = document.createElement("option");
          option.value = area.name;
          option.textContent = area.name;
          meArea.appendChild(option);
        });
      const addArea = document.createElement("option");
      addArea.value = "__ADD_NEW__";
      addArea.textContent = "+ Add New Area...";
      meArea.appendChild(addArea);
      meArea.disabled = meRegion.disabled;
      meArea.value = selectedArea;
    };
    const populateContactRegionArea = (
      selectedRegion = "",
      selectedArea = "",
    ) => {
      const city = citySelect.value;
      contactRegion.innerHTML =
        '<option value="">Choose a region (optional)</option>';
      settings.regions
        .filter((region) => region.city === city)
        .forEach((region) => {
          const option = document.createElement("option");
          option.value = region.name;
          option.textContent = region.name;
          contactRegion.appendChild(option);
        });
      const addRegionOption = document.createElement("option");
      addRegionOption.value = "__ADD_NEW__";
      addRegionOption.textContent = "+ Add New Region...";
      contactRegion.appendChild(addRegionOption);
      contactRegion.disabled =
        !document.getElementById("contact-country").value ||
        !document.getElementById("contact-state").value.trim() ||
        !city ||
        !settings.cities.includes(city);
      contactRegion.value = selectedRegion;

      contactArea.innerHTML =
        '<option value="">Choose an area (optional)</option>';
      settings.areas
        .filter((area) => area.city === city)
        .forEach((area) => {
          const option = document.createElement("option");
          option.value = area.name;
          option.textContent = area.name;
          contactArea.appendChild(option);
        });
      const addAreaOption = document.createElement("option");
      addAreaOption.value = "__ADD_NEW__";
      addAreaOption.textContent = "+ Add New Area...";
      contactArea.appendChild(addAreaOption);
      contactArea.disabled = contactRegion.disabled;
      contactArea.value = selectedArea;
      selectedContactArea = contactArea.value;
      selectedContactRegion = contactRegion.value;
    };
    populateContactRegionArea(contactRegion.value, contactArea.value);
    populateMeRegionArea(meRegion.value, meArea.value);

    const filterRegion = document.getElementById("filter-region");
    const currentRegionFilter = filterRegion.value;
    filterRegion.innerHTML = '<option value="">All Regions</option>';
    [
      ...new Set(
        settings.regions
          .filter(
            (region) => !filterCity.value || region.city === filterCity.value,
          )
          .map((region) => region.name),
      ),
    ]
      .sort(compareNames)
      .forEach((name) => {
        const option = document.createElement("option");
        option.value = name;
        option.textContent = name;
        filterRegion.appendChild(option);
      });
    filterRegion.value = Array.from(filterRegion.options).some(
      (option) => option.value === currentRegionFilter,
    )
      ? currentRegionFilter
      : "";

    const filterArea = document.getElementById("filter-area");
    let currentAreaFilter = filterArea.value;
    filterArea.innerHTML = '<option value="">All Areas</option>';
    [
      ...new Set(
        settings.areas
          .filter((area) => !filterCity.value || area.city === filterCity.value)
          .map((area) => area.name),
      ),
    ]
      .sort(compareNames)
      .forEach((name) => {
        const opt = document.createElement("option");
        opt.value = name;
        opt.textContent = name;
        filterArea.appendChild(opt);
      });
    if (
      currentAreaFilter &&
      !Array.from(filterArea.options).some(
        (option) => option.value === currentAreaFilter,
      )
    ) {
      currentAreaFilter = "";
    }
    filterArea.value = currentAreaFilter;

    const settingRegionCity = document.getElementById("setting-region-city");
    const settingAreaCity = document.getElementById("setting-area-city");
    [settingRegionCity, settingAreaCity].forEach((select) => {
      const previousCity = select.value;
      select.innerHTML = '<option value="">Choose city</option>';
      settings.cities.forEach((city) => {
        const option = document.createElement("option");
        option.value = city;
        option.textContent = city;
        select.appendChild(option);
      });
      if (settings.cities.includes(previousCity)) select.value = previousCity;
    });

    const hierarchyList = document.getElementById("region-area-list");
    hierarchyList.innerHTML = "";
    const addHierarchyHeading = (text) => {
      const heading = document.createElement("h4");
      heading.className = "hierarchy-heading";
      heading.textContent = text;
      hierarchyList.appendChild(heading);
    };
    const addHierarchyRow = (type, name, className, usedIn) => {
      const location = { name };
      const item = document.createElement("div");
      item.className = className;
      const label = document.createElement("span");
      label.textContent = name;
      if (usedIn) {
        const cityNote = document.createElement("small");
        cityNote.className = "hierarchy-cities";
        cityNote.textContent = usedIn;
        label.append(document.createElement("br"), cityNote);
      }
      item.appendChild(label);

      const actions = document.createElement("div");
      actions.className = "hierarchy-actions";
      ["Edit", "Delete"].forEach((action) => {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = action;
        button.setAttribute(
          "aria-label",
          `${action} ${type.toLowerCase()} ${name}`,
        );
        button.addEventListener("click", () => {
          if (action === "Edit")
            startEditingLocation(type, location, item, label, actions);
          else deleteLocation(type, location);
        });
        actions.appendChild(button);
      });
      item.appendChild(actions);
      hierarchyList.appendChild(item);
    };
    const addNameRows = (type, items, className) => {
      const citiesByName = new Map();
      items.forEach((item) => {
        if (!citiesByName.has(item.name)) citiesByName.set(item.name, []);
        citiesByName.get(item.name).push(item.city);
      });
      [...citiesByName.keys()].sort(compareNames).forEach((name) =>
        addHierarchyRow(
          type,
          name,
          className,
          `Cities: ${citiesByName.get(name).sort(compareNames).join(", ")}`,
        ),
      );
    };

    if (!settings.cities.length) {
      hierarchyList.textContent =
        "Add a city, then assign regions and areas to it.";
    } else {
      addHierarchyHeading("Cities");
      settings.cities.forEach((city) =>
        addHierarchyRow("City", city, "hierarchy-city"),
      );
      if (settings.regions.length) {
        addHierarchyHeading("Regions");
        addNameRows("Region", settings.regions, "hierarchy-region");
      }
      if (settings.areas.length) {
        addHierarchyHeading("Areas");
        addNameRows("Area", settings.areas, "hierarchy-area");
      }
    }

    return {
      populateContactRegionArea,
      populateMeRegionArea,
    };
  };
  const dropdownHelpers = populateDropdowns();
  const citySelect = document.getElementById("contact-city-select");
  const contactRegionSelect = document.getElementById("contact-region-select");
  const contactAreaSelect = document.getElementById("contact-area-select");
  const contactCountrySelect = document.getElementById("contact-country");
  const meCountrySelect = document.getElementById("me-country");
  const updateContactLocationFields = () => {
    const hasCountry = Boolean(contactCountrySelect.value);
    const hasState = Boolean(document.getElementById("contact-state").value.trim());
    document.getElementById("contact-state").disabled = !hasCountry;
    citySelect.disabled = !hasCountry || !hasState;
    dropdownHelpers.populateContactRegionArea(
      contactRegionSelect.value,
      contactAreaSelect.value,
    );
  };
  const updateMeLocationFields = () => {
    const hasCountry = Boolean(meCountrySelect.value);
    const hasState = Boolean(document.getElementById("me-state").value.trim());
    document.getElementById("me-state").disabled = !hasCountry;
    document.getElementById("me-city").disabled = !hasCountry || !hasState;
    dropdownHelpers.populateMeRegionArea(
      document.getElementById("me-region").value,
      document.getElementById("me-area").value,
    );
  };
  const resetDependentLocationFields = (select) => {
    if (select === contactCountrySelect) {
      document.getElementById("contact-state").value = "";
      citySelect.value = "";
      document.getElementById("new-contact-region-container").hidden = true;
      document.getElementById("new-contact-area-container").hidden = true;
      updateContactLocationFields();
    } else {
      document.getElementById("me-state").value = "";
      document.getElementById("me-city").value = "";
      document.getElementById("me-region").value = "";
      document.getElementById("me-area").value = "";
      document.getElementById("new-me-region-container").hidden = true;
      document.getElementById("new-me-area-container").hidden = true;
      updateMeLocationFields();
    }
  };
  const getCountryAddFields = (select) =>
    select === contactCountrySelect
      ? {
          container: document.getElementById("new-contact-country-container"),
          input: document.getElementById("input-new-contact-country"),
        }
      : {
          container: document.getElementById("new-me-country-container"),
          input: document.getElementById("input-new-me-country"),
        };
  const handleCountryChange = (select) => {
    const previousCountry = select.dataset.selectedCountry || settings.country;
    const country = select.value;
    if (country === "__ADD_COUNTRY__") {
      select.value = previousCountry;
      const { container, input } = getCountryAddFields(select);
      container.hidden = false;
      input.value = "";
      input.focus({ preventScroll: select === meCountrySelect });
      return;
    }
    const { container, input } = getCountryAddFields(select);
    container.hidden = true;
    input.value = "";
    select.dataset.selectedCountry = country;
    if (country !== previousCountry) resetDependentLocationFields(select);
  };
  const saveNewCountry = async (select) => {
    const { container, input } = getCountryAddFields(select);
    const enteredCountry = normalizeCountry(input.value);
    if (!enteredCountry) {
      alert("Enter a country name.");
      input.focus({ preventScroll: select === meCountrySelect });
      return;
    }
    const country =
      settings.countries.find(
        (existing) => existing.toLowerCase() === enteredCountry.toLowerCase(),
      ) || enteredCountry;
    const isNew = !settings.countries.includes(country);
    if (isNew) settings.countries.push(country);
    try {
      if (isNew) await saveSettings();
    } catch (error) {
      settings.countries = settings.countries.filter(
        (existing) => existing !== country,
      );
      showStorageError("save country", error);
      return;
    }
    const previousCountry = select.dataset.selectedCountry || settings.country;
    populateCountryOptions();
    select.value = country;
    select.dataset.selectedCountry = country;
    container.hidden = true;
    input.value = "";
    if (country !== previousCountry) resetDependentLocationFields(select);
  };
  countrySelects.forEach((select) =>
    select.addEventListener("change", () => handleCountryChange(select)),
  );
  document
    .getElementById("btn-save-new-contact-country")
    .addEventListener("click", () => saveNewCountry(contactCountrySelect));
  document
    .getElementById("btn-save-new-me-country")
    .addEventListener("click", () => saveNewCountry(meCountrySelect));
  [
    ["contact-country", contactCountrySelect],
    ["me-country", meCountrySelect],
  ].forEach(([prefix, select]) => {
    document
      .getElementById(`btn-cancel-new-${prefix}`)
      .addEventListener("click", () => {
        const { container, input } = getCountryAddFields(select);
        container.hidden = true;
        input.value = "";
      });
  });
  document.getElementById("contact-state").addEventListener("input", () => {
    updateContactLocationFields();
  });
  document.getElementById("contact-state").addEventListener("change", () => {
    citySelect.value = "";
    dropdownHelpers.populateContactRegionArea("", "");
  });
  document.getElementById("me-state").addEventListener("input", () => {
    updateMeLocationFields();
  });
  document.getElementById("me-state").addEventListener("change", () => {
    document.getElementById("me-city").value = "";
    document.getElementById("me-region").value = "";
    document.getElementById("me-area").value = "";
    dropdownHelpers.populateMeRegionArea("", "");
  });
  citySelect.addEventListener("input", () => {
    dropdownHelpers.populateContactRegionArea("", "");
  });
  document.getElementById("me-city").addEventListener("input", () => {
    dropdownHelpers.populateMeRegionArea("", "");
  });
  document.getElementById("me-city").addEventListener("change", async () => {
    const meCity = document.getElementById("me-city");
    const entered = toTitleCase(meCity.value.trim());
    if (!entered) return;
    const existing = settings.cities.find(
      (city) => city.toLowerCase() === entered.toLowerCase(),
    );
    if (existing) {
      meCity.value = existing;
    } else {
      addCity(entered);
      try {
        await saveSettings();
      } catch (error) {
        rollbackNewCity(entered);
        showStorageError("save city", error);
        return;
      }
      populateDropdowns();
      meCity.value = entered;
    }
    dropdownHelpers.populateMeRegionArea("", "");
  });
  let pendingContactCitySave = Promise.resolve(true);
  let lastCommittedContactCity = "";
  const newContactRegionContainer = document.getElementById(
    "new-contact-region-container",
  );
  const commitContactCity = async () => {
    const enteredCity = toTitleCase(citySelect.value.trim());
    if (!enteredCity || enteredCity === "+ Add New City...") {
      citySelect.value = "";
      lastCommittedContactCity = "";
      dropdownHelpers.populateContactRegionArea("", "");
      return true;
    }

    const existingCity = settings.cities.find(
      (city) => city.toLowerCase() === enteredCity.toLowerCase(),
    );
    if (existingCity) {
      citySelect.value = existingCity;
      if (existingCity !== lastCommittedContactCity) {
        dropdownHelpers.populateContactRegionArea("", "");
      }
      lastCommittedContactCity = existingCity;
      return true;
    }

    addCity(enteredCity);
    try {
      await saveSettings();
    } catch (error) {
      rollbackNewCity(enteredCity);
      citySelect.value = lastCommittedContactCity;
      dropdownHelpers.populateContactRegionArea("", "");
      showStorageError("save city", error);
      return false;
    }
    populateDropdowns();
    citySelect.value = enteredCity;
    lastCommittedContactCity = enteredCity;
    dropdownHelpers.populateContactRegionArea("", "");
    return true;
  };
  citySelect.addEventListener("change", () => {
    newContactRegionContainer.hidden = true;
    document.getElementById("new-contact-area-container").hidden = true;
    if (citySelect.value.trim() === "+ Add New City...") {
      citySelect.value = "";
      dropdownHelpers.populateContactRegionArea("", "");
      citySelect.focus();
      return;
    }
    pendingContactCitySave = commitContactCity();
  });
  contactRegionSelect.addEventListener("change", () => {
    if (contactRegionSelect.value === "__ADD_NEW__") {
      contactRegionSelect.value = selectedContactRegion;
      newContactRegionContainer.hidden = false;
      const newRegionInput = document.getElementById(
        "input-new-contact-region",
      );
      newRegionInput.value = "";
      newRegionInput.focus();
      return;
    }
    dropdownHelpers.populateContactRegionArea(
      contactRegionSelect.value,
      contactAreaSelect.value,
    );
  });
  contactAreaSelect.addEventListener("change", () => {
    const newAreaContainer = document.getElementById(
      "new-contact-area-container",
    );
    if (contactAreaSelect.value === "__ADD_NEW__") {
      contactAreaSelect.value = selectedContactArea;
      newAreaContainer.hidden = false;
      const newAreaInput = document.getElementById("input-new-contact-area");
      newAreaInput.value = "";
      newAreaInput.focus();
      return;
    }
    selectedContactArea = contactAreaSelect.value;
    newAreaContainer.hidden = true;
  });
  document
  .getElementById("btn-save-new-contact-region")
  .addEventListener("click", async () => {
    const input = document.getElementById("input-new-contact-region");
    const name = toTitleCase(input.value);
    const city = citySelect.value;
    if (!name) {
      alert("Enter a name for the new region.");
      input.focus();
      return;
    }
    if (!city || city === "+ Add New City...") {
      alert("Choose a city before adding a region.");
      return;
    }
    const existingRegion = settings.regions.find(
      (region) =>
        region.city === city &&
        region.name.toLowerCase() === name.toLowerCase(),
    );
    if (existingRegion) {
      dropdownHelpers.populateContactRegionArea(existingRegion.name, "");
      newContactRegionContainer.hidden = true;
      input.value = "";
      alert("That region already exists in this city.");
      return;
    }

    settings.regions.push({ name, city });
    try {
      await saveSettings();
    } catch (error) {
      settings.regions.pop();
      showStorageError("save settings", error);
      return;
    }
    populateDropdowns();
    citySelect.value = city;
    dropdownHelpers.populateContactRegionArea(name, "");
    newContactRegionContainer.hidden = true;
    input.value = "";
  });
  document
  .getElementById("btn-cancel-new-contact-region")
  .addEventListener("click", () => {
    newContactRegionContainer.hidden = true;
    document.getElementById("input-new-contact-region").value = "";
    contactRegionSelect.value = selectedContactRegion;
  });
  document
  .getElementById("btn-save-new-contact-area")
    .addEventListener("click", async () => {
      const input = document.getElementById("input-new-contact-area");
      const name = toTitleCase(input.value);
      const city = citySelect.value;
      const region = contactRegionSelect.value;
      if (!name) {
        alert("Enter a name for the new area.");
        input.focus();
        return;
      }
      if (!city) {
        alert("Choose a city before adding an area.");
        return;
      }
      const existingArea = settings.areas.find(
        (area) =>
          area.city === city && area.name.toLowerCase() === name.toLowerCase(),
      );
      if (existingArea) {
        dropdownHelpers.populateContactRegionArea(region, existingArea.name);
        document.getElementById("new-contact-area-container").hidden = true;
        alert("That area already exists in this city.");
        return;
      }

      const newArea = { name, city };
      settings.areas.push(newArea);
      try {
        await saveSettings();
      } catch (error) {
        settings.areas.pop();
        showStorageError("save settings", error);
        return;
      }
      populateDropdowns();
      citySelect.value = city;
      dropdownHelpers.populateContactRegionArea(region, name);
      document.getElementById("new-contact-area-container").hidden = true;
      input.value = "";
    });
  document
    .getElementById("btn-cancel-new-contact-area")
    .addEventListener("click", () => {
      document.getElementById("new-contact-area-container").hidden = true;
      document.getElementById("input-new-contact-area").value = "";
      contactAreaSelect.value = selectedContactArea;
    });
  document
    .getElementById("setting-new-city")
    .addEventListener("blur", (event) => {
      event.currentTarget.value = toTitleCase(event.currentTarget.value);
    });

  // Settings View Buttons
  document
    .getElementById("btn-add-setting-city")
    .addEventListener("click", async () => {
      const input = document.getElementById("setting-new-city");
      const val = toTitleCase(input.value);
      const existingCity = settings.cities.find(
        (city) => city.toLowerCase() === val.toLowerCase(),
      );
      if (val && !existingCity) {
        addCity(val);
        input.value = "";
        try {
          await saveSettings();
        } catch (error) {
          rollbackNewCity(val);
          showStorageError("save settings", error);
          return;
        }
        populateDropdowns();
        alert(`City "${val}" added.`);
      } else if (val) {
        input.value = "";
        alert("That city already exists.");
      }
    });

  const updatePendingLocationButton = (input, button) => {
    button.style.backgroundColor = input.value.trim() ? "#28a745" : "#004080";
  };
  const settingRegionInput = document.getElementById("setting-new-region");
  const addSettingRegionButton = document.getElementById(
    "btn-add-setting-region",
  );
  const settingAreaInput = document.getElementById("setting-new-area");
  const addSettingAreaButton = document.getElementById("btn-add-setting-area");
  const updateAddRegionButton = () =>
    updatePendingLocationButton(settingRegionInput, addSettingRegionButton);
  const updateAddAreaButton = () =>
    updatePendingLocationButton(settingAreaInput, addSettingAreaButton);
  settingRegionInput.addEventListener("input", updateAddRegionButton);
  settingAreaInput.addEventListener("input", updateAddAreaButton);

  document
    .getElementById("btn-add-setting-area")
    .addEventListener("click", async () => {
      const input = settingAreaInput;
      const val = toTitleCase(input.value);
      const city = document.getElementById("setting-area-city").value;
      if (!city) {
        alert("Choose a city for this area first.");
        return;
      }
      if (
        val &&
        !settings.areas.some(
          (area) =>
            area.city === city &&
            area.name.toLowerCase() === val.toLowerCase(),
        )
      ) {
        settings.areas.push({ name: val, city });
        try {
          await saveSettings();
        } catch (error) {
          settings.areas.pop();
          showStorageError("save settings", error);
          return;
        }
        input.value = "";
        updateAddAreaButton();
        populateDropdowns();
        alert(`Area "${val}" added to ${city}.`);
      } else if (val) {
        input.value = "";
        alert("That area already exists in this city.");
      }
    });

  document
    .getElementById("btn-add-setting-region")
    .addEventListener("click", async () => {
      const input = settingRegionInput;
      const city = document.getElementById("setting-region-city").value;
      const region = toTitleCase(input.value);
      if (
        city &&
        region &&
        !settings.regions.some(
          (existing) =>
            existing.city === city &&
            existing.name.toLowerCase() === region.toLowerCase(),
        )
      ) {
        settings.regions.push({ name: region, city });
        try {
          await saveSettings();
        } catch (error) {
          settings.regions.pop();
          showStorageError("save settings", error);
          return;
        }
        input.value = "";
        updateAddRegionButton();
        populateDropdowns();
        alert(`Region "${region}" added to ${city}.`);
      } else if (region) {
        if (city) {
          input.value = "";
          updateAddRegionButton();
        }
        alert(
          city
            ? "That region already exists in this city."
            : "Choose a city for this region first.",
        );
      }
    });

  document
    .getElementById("settings-form")
    .addEventListener("submit", async (e) => {
      e.preventDefault();
      settings.state = normalizeLocationState(
        settings.country,
        settingStateInput.value,
      );
      settingStateInput.value = settings.state;
      settings.defaultCity = toTitleCase(settingDefaultCityInput.value);
      settingDefaultCityInput.value = settings.defaultCity;
      const existingCity = settings.cities.find(
        (city) =>
          city.toLowerCase() === settings.defaultCity.toLowerCase(),
      );
      if (existingCity) {
        settings.defaultCity = existingCity;
      } else if (settings.defaultCity) {
        addCity(settings.defaultCity);
      }
      try {
        await saveSettings();
      } catch (error) {
        showStorageError("save settings", error);
        return;
      }
      populateDropdowns();
      document.getElementById("setting-default-city").value =
        settings.defaultCity;
      alert("Defaults Saved");
      if (localStorage.getItem("return_visits_setup_pending") === "true") {
        document.getElementById("setup-next-steps-notice").hidden = false;
      }
    });

  const meFields = {
    name: document.getElementById("me-name"),
    country: document.getElementById("me-country"),
    state: document.getElementById("me-state"),
    city: document.getElementById("me-city"),
    region: document.getElementById("me-region"),
    area: document.getElementById("me-area"),
    street: document.getElementById("me-street"),
    lat: document.getElementById("me-lat"),
    lng: document.getElementById("me-lng"),
  };
  const meStatus = document.getElementById("me-status");
  let lastCommittedMeCity = "";
  meFields.name.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" || event.isComposing) return;
    event.preventDefault();
    meFields.country.focus({ preventScroll: true });
  });
  const populateMeForm = () => {
    const me = settings.me || {};
    Object.entries(meFields).forEach(([key, input]) => {
      if (key === "region" || key === "area") return;
      input.value = me[key] || "";
    });
    meFields.country.value = me.country || settings.country;
    meCountrySelect.dataset.selectedCountry = meFields.country.value;
    populateDropdowns();
    meFields.region.value = me.region || "";
    populateDropdowns();
    meFields.area.value = me.area || "";
    updateMeLocationFields();
    lastCommittedMeCity = meFields.city.value;
  };
  const readMeForm = () => {
    const me = {};
    Object.entries(meFields).forEach(([key, input]) => {
      me[key] = input.value.trim();
    });
    me.country = normalizeCountry(me.country);
    me.state = normalizeLocationState(me.country, me.state);
    me.street = me.street ? normalizeStreetName(me.street) : "";
    me.city = me.city ? toTitleCase(me.city) : "";
    return me;
  };
  populateMeForm();
  meFields.state.addEventListener("blur", () => {
    if (meFields.state.value) {
      meFields.state.value = normalizeLocationState(
        meFields.country.value,
        meFields.state.value,
      );
    }
  });
  const commitMeCity = async () => {
    const enteredCity = toTitleCase(meFields.city.value.trim());
    if (!enteredCity || enteredCity === "+ Add New City...") {
      meFields.city.value = "";
      lastCommittedMeCity = "";
      populateDropdowns();
      return true;
    }
    const existingCity = settings.cities.find(
      (city) => city.toLowerCase() === enteredCity.toLowerCase(),
    );
    if (existingCity) {
      meFields.city.value = existingCity;
      if (existingCity !== lastCommittedMeCity) {
        meFields.region.value = "";
        meFields.area.value = "";
      }
      lastCommittedMeCity = existingCity;
      populateDropdowns();
      return true;
    }
    meFields.region.value = "";
    meFields.area.value = "";
    addCityWithDefaultRegions(enteredCity);
    try {
      await saveSettings();
    } catch (error) {
      rollbackNewCity(enteredCity);
      meFields.city.value = lastCommittedMeCity;
      showStorageError("save city", error);
      return false;
    }
    populateDropdowns();
    meFields.city.value = enteredCity;
    lastCommittedMeCity = enteredCity;
    return true;
  };
  meFields.city.addEventListener("change", () => {
    if (meFields.city.value.trim() === "+ Add New City...") {
      meFields.city.value = "";
      meFields.city.focus({ preventScroll: true });
      return;
    }
    commitMeCity();
  });
  meFields.region.addEventListener("change", () => {
    if (meFields.region.value === "__ADD_NEW__") {
      meFields.region.value = "";
      document.getElementById("new-me-region-container").hidden = false;
      document
        .getElementById("input-new-me-region")
        .focus({ preventScroll: true });
    } else {
      dropdownHelpers.populateMeRegionArea(
        meFields.region.value,
        meFields.area.value,
      );
    }
  });
  meFields.area.addEventListener("change", () => {
    if (meFields.area.value === "__ADD_NEW__") {
      meFields.area.value = "";
      document.getElementById("new-me-area-container").hidden = false;
      document
        .getElementById("input-new-me-area")
        .focus({ preventScroll: true });
    }
  });
  document
    .getElementById("btn-save-new-me-region")
    .addEventListener("click", async () => {
      const input = document.getElementById("input-new-me-region");
      const name = toTitleCase(input.value);
      const city = meFields.city.value.trim();
      if (!name || !city) {
        alert("Enter a region name after choosing a city.");
        input.focus({ preventScroll: true });
        return;
      }
      const existing = settings.regions.find(
        (region) =>
          region.city === city &&
          region.name.toLowerCase() === name.toLowerCase(),
      );
      if (existing) {
        populateDropdowns();
        meFields.region.value = existing.name;
        document.getElementById("new-me-region-container").hidden = true;
        alert("That region already exists in this city.");
        return;
      }
      const region = { name, city };
      settings.regions.push(region);
      try {
        await saveSettings();
      } catch (error) {
        settings.regions.pop();
        showStorageError("save region", error);
        return;
      }
      populateDropdowns();
      meFields.region.value = name;
      dropdownHelpers.populateMeRegionArea(name, "");
      document.getElementById("new-me-region-container").hidden = true;
      input.value = "";
    });
  document
    .getElementById("btn-cancel-new-me-region")
    .addEventListener("click", () => {
      document.getElementById("new-me-region-container").hidden = true;
      document.getElementById("input-new-me-region").value = "";
      populateDropdowns();
    });
  document
    .getElementById("btn-save-new-me-area")
    .addEventListener("click", async () => {
      const input = document.getElementById("input-new-me-area");
      const name = toTitleCase(input.value);
      const city = meFields.city.value.trim();
      const region = meFields.region.value;
      if (!name || !city) {
        alert("Enter an area name after choosing a city.");
        input.focus({ preventScroll: true });
        return;
      }
      const existing = settings.areas.find(
        (area) =>
          area.city === city && area.name.toLowerCase() === name.toLowerCase(),
      );
      if (existing) {
        populateDropdowns();
        meFields.area.value = existing.name;
        document.getElementById("new-me-area-container").hidden = true;
        alert("That area already exists in this city.");
        return;
      }
      const area = { name, city };
      settings.areas.push(area);
      try {
        await saveSettings();
      } catch (error) {
        settings.areas.pop();
        showStorageError("save area", error);
        return;
      }
      populateDropdowns();
      meFields.region.value = region;
      meFields.area.value = name;
      document.getElementById("new-me-area-container").hidden = true;
      input.value = "";
    });
  document
    .getElementById("btn-cancel-new-me-area")
    .addEventListener("click", () => {
      document.getElementById("new-me-area-container").hidden = true;
      document.getElementById("input-new-me-area").value = "";
      populateDropdowns();
    });

  document.getElementById("btn-me-find").addEventListener("click", async () => {
    const me = readMeForm();
    if (!me.street && !me.city) {
      meStatus.textContent = "Enter your street address or city first.";
      return;
    }
    const button = document.getElementById("btn-me-find");
    button.disabled = true;
    meStatus.textContent = "Looking up your address...";
    try {
      const url = new URL("https://nominatim.openstreetmap.org/search");
      url.search = new URLSearchParams({
        q: [
          me.street,
          me.city,
          me.state || settings.state,
          me.country || settings.country,
        ]
          .filter(Boolean)
          .join(", "),
        format: "jsonv2",
        limit: "1",
      }).toString();
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Lookup failed (${response.status}).`);
      const results = await response.json();
      if (!results.length) {
        const defaultLocation = [
          settings.defaultCity.trim(),
          settings.state.trim(),
        ]
          .filter(Boolean)
          .join(", ");
        if (!defaultLocation) {
          meStatus.textContent =
            "Could not find this address. Set your default city and state, or use Device Location if you are at the location.";
          return;
        }
        try {
          const fallbackLocation = await lookupCityPinCoordinates(
            [
              defaultLocation,
              settings.country || DEFAULT_SETTINGS.country,
            ].join(", "),
          );
          if (!fallbackLocation) {
            meStatus.textContent = `Could not find this address or locate ${defaultLocation}. Use Device Location if you are at the location, or enter coordinates.`;
            return;
          }
          meFields.lat.value = fallbackLocation[0].toFixed(6);
          meFields.lng.value = fallbackLocation[1].toFixed(6);
          meStatus.textContent = `Could not find this address. The pin has been centered near ${defaultLocation}. Choose Save, then move the pin to the correct location, or use Device Location if you are at the location.`;
        } catch (error) {
          console.error(
            "Unable to center the home pin on the default location:",
            error,
          );
          meStatus.textContent = `Could not find this address or locate ${defaultLocation}. Check your connection, or use Device Location if you are at the location.`;
        }
      } else {
        meFields.lat.value = Number(results[0].lat).toFixed(6);
        meFields.lng.value = Number(results[0].lon).toFixed(6);
        meStatus.textContent =
          "Home pin found. Choose Save, then drag it on the Map to fine-tune.";
      }
    } catch (error) {
      console.error("Home lookup failed:", error);
      meStatus.textContent =
        "Could not look up the address. Check your connection and try again.";
    } finally {
      button.disabled = false;
    }
  });

  document.getElementById("btn-me-gps").addEventListener("click", () => {
    if (!navigator.geolocation) {
      meStatus.textContent = "Device location is not supported by this browser.";
      return;
    }
    const button = document.getElementById("btn-me-gps");
    button.disabled = true;
    meStatus.textContent = "Getting your device location...";
    navigator.geolocation.getCurrentPosition(
      (position) => {
        meFields.lat.value = position.coords.latitude.toFixed(6);
        meFields.lng.value = position.coords.longitude.toFixed(6);
        meStatus.textContent =
          "Home pin set from device location. Choose Save to keep it.";
        button.disabled = false;
      },
      () => {
        meStatus.textContent =
          "Could not get a device location. Check permission, or use the address lookup.";
        button.disabled = false;
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 },
    );
  });

  document.getElementById("me-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!(await commitMeCity())) return;
    const me = readMeForm();
    if (
      !me.country ||
      (me.region &&
        !settings.regions.some(
          (region) => region.city === me.city && region.name === me.region,
        )) ||
      (me.area &&
        !settings.areas.some(
          (area) => area.city === me.city && area.name === me.area,
        ))
    ) {
      meStatus.textContent = "Choose a valid country, city, region, and area.";
      return;
    }
    const lat = parseFloat(me.lat);
    const lng = parseFloat(me.lng);
    if (
      (me.lat || me.lng) &&
      !(Number.isFinite(lat) && Number.isFinite(lng) &&
        Math.abs(lat) <= 90 && Math.abs(lng) <= 180)
    ) {
      meStatus.textContent = "Enter valid latitude and longitude values.";
      return;
    }
    const previousMe = settings.me;
    const previousDefaults = {
      country: settings.country,
      state: settings.state,
      defaultCity: settings.defaultCity,
    };
    settings.me = me;
    settings.country = me.country;
    settings.state = me.state;
    settings.defaultCity = me.city;
    try {
      await saveSettings();
    } catch (error) {
      settings.me = previousMe;
      Object.assign(settings, previousDefaults);
      showStorageError("save your details", error);
      return;
    }
    document.getElementById("setting-state").value = settings.state;
    document.getElementById("setting-default-city").value =
      settings.defaultCity;
    populateMeForm();
    if (map) renderMapMarkers();
    meStatus.textContent = "Your details were saved.";
  });

  document.getElementById("btn-me-clear").addEventListener("click", async () => {
    if (!confirm("Clear your details and remove your home pin?")) return;
    const previousMe = settings.me;
    delete settings.me;
    try {
      await saveSettings();
    } catch (error) {
      settings.me = previousMe;
      showStorageError("clear your details", error);
      return;
    }
    populateMeForm();
    if (map) renderMapMarkers();
    meStatus.textContent = "Your details were cleared.";
  });

  let contacts = savedContacts;
  let visibleContacts = [];

  // Stamp updatedAt only on contacts whose content actually changed.
  const getContactSignature = (contact) =>
    JSON.stringify({ ...contact, updatedAt: undefined });
  let contactSignatures = new Map();
  const resetContactSignatures = () => {
    contactSignatures = new Map(
      contacts.map((contact) => [
        String(contact.id),
        getContactSignature(contact),
      ]),
    );
  };
  const stampChangedContacts = () => {
    const now = new Date().toISOString();
    const nextSignatures = new Map();
    contacts.forEach((contact) => {
      const key = String(contact.id);
      const signature = getContactSignature(contact);
      if (contactSignatures.get(key) !== signature) contact.updatedAt = now;
      nextSignatures.set(key, signature);
    });
    return nextSignatures;
  };
  resetContactSignatures();

  const cloneLocationState = () => ({
    settings: JSON.parse(JSON.stringify(settings)),
    contacts: JSON.parse(JSON.stringify(contacts)),
  });

  const renameFilterValue = (filterId, oldValue, newValue) => {
    const filter = document.getElementById(filterId);
    if (filter.value !== oldValue) return;
    const selectedOption = Array.from(filter.options).find(
      (option) => option.value === oldValue,
    );
    if (selectedOption) selectedOption.value = newValue;
    filter.value = newValue;
  };

  const startEditingLocation = (type, location, row, label, actions) => {
    if (row.querySelector("input")) return;
    const input = document.createElement("input");
    input.type = "text";
    input.value = location.name;
    input.setAttribute("aria-label", `New ${type.toLowerCase()} name`);
    actions.innerHTML = "";

    let getSelectedCities = null;
    if (type === "City") {
      label.replaceWith(input);
    } else {
      const listKey = type === "Region" ? "regions" : "areas";
      const assigned = new Set(
        settings[listKey]
          .filter((item) => item.name === location.name)
          .map((item) => item.city),
      );
      const editor = document.createElement("div");
      editor.className = "hierarchy-editor";
      const cityGroup = document.createElement("fieldset");
      const legend = document.createElement("legend");
      legend.textContent = "Assigned to cities";
      cityGroup.appendChild(legend);
      const checkboxes = settings.cities.map((city) => {
        const cityLabel = document.createElement("label");
        cityLabel.className = "checkbox-row";
        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.value = city;
        checkbox.checked = assigned.has(city);
        cityLabel.append(checkbox, ` ${city}`);
        cityGroup.appendChild(cityLabel);
        return checkbox;
      });
      editor.append(input, cityGroup);
      label.replaceWith(editor);
      getSelectedCities = () =>
        checkboxes.filter((box) => box.checked).map((box) => box.value);
    }

    const saveButton = document.createElement("button");
    saveButton.type = "button";
    saveButton.textContent = "Save";
    saveButton.addEventListener("click", async () => {
      if (type === "City") await renameLocation(type, location, input.value);
      else
        await saveLocationAssignments(
          type,
          location.name,
          input.value,
          getSelectedCities(),
        );
    });
    const cancelButton = document.createElement("button");
    cancelButton.type = "button";
    cancelButton.textContent = "Cancel";
    cancelButton.addEventListener("click", () => populateDropdowns());
    actions.append(saveButton, cancelButton);
    input.focus();
    input.select();
  };

  const persistLocationChanges = async (
    previousState,
    action = "save location changes",
  ) => {
    try {
      const nextSignatures = stampChangedContacts();
      await writeStoredValues(database, [
        ["settings", await encryptValue(settings, encryptionKey)],
        ["contacts", await encryptValue(contacts, encryptionKey)],
      ]);
      contactSignatures = nextSignatures;
    } catch (error) {
      settings = previousState.settings;
      contacts = previousState.contacts;
      showStorageError(action, error);
      populateDropdowns();
      renderContacts();
      return false;
    }
    cloudBackupHook();
    populateDropdowns();
    renderContacts();
    return true;
  };

  const renameLocation = async (type, location, proposedName) => {
    const name = toTitleCase(proposedName);
    if (!name) {
      alert("A location name cannot be blank.");
      return false;
    }
    if (name === location.name) return true;

    const duplicate = settings.cities.some(
      (city) => city.toLowerCase() === name.toLowerCase(),
    );
    if (duplicate) {
      alert("A city with that name already exists.");
      return false;
    }

    const previousState = cloneLocationState();
    if (type === "City") {
      settings.cities = settings.cities.map((city) =>
        city === location.name ? name : city,
      );
      settings.regions = settings.regions.map((region) =>
        region.city === location.name ? { ...region, city: name } : region,
      );
      settings.areas = settings.areas.map((area) =>
        area.city === location.name ? { ...area, city: name } : area,
      );
      settings.defaultCity =
        settings.defaultCity === location.name ? name : settings.defaultCity;
      contacts = contacts.map((contact) => {
        if (contact.city !== location.name) return contact;
        const streetAddress = getStreetAddress(contact);
        return {
          ...contact,
          city: name,
          streetAddress,
          address: [
            streetAddress,
            name,
            contact.state,
            contact.country,
          ]
            .filter(Boolean)
            .join(", "),
        };
      });

      if (citySelect.value === location.name) citySelect.value = name;
      ["setting-region-city", "setting-area-city"].forEach((id) => {
        const select = document.getElementById(id);
        if (select.value === location.name) select.value = name;
      });
      if (
        document.getElementById("filter-city").value === location.name
      ) {
        const cityFilter = document.getElementById("filter-city");
        const selectedOption = Array.from(cityFilter.options).find(
          (option) => option.value === location.name,
        );
        if (selectedOption) selectedOption.value = name;
        cityFilter.value = name;
      }
      if (settings.defaultCity === name) {
        document.getElementById("setting-default-city").value = name;
      }
    }
    return persistLocationChanges(previousState);
  };

  // Renames a region or area everywhere it is used and updates the cities it
  // is assigned to.
  const saveLocationAssignments = async (
    type,
    oldName,
    proposedName,
    selectedCities,
  ) => {
    const name = toTitleCase(proposedName);
    const typeLabel = type.toLowerCase();
    if (!name) {
      alert(`A ${typeLabel} name cannot be blank.`);
      return false;
    }
    if (!selectedCities.length) {
      alert(
        `Choose at least one city for this ${typeLabel}, or use Delete to remove it.`,
      );
      return false;
    }
    const listKey = type === "Region" ? "regions" : "areas";
    const contactField = type === "Region" ? "region" : "area";
    const currentCities = settings[listKey]
      .filter((item) => item.name === oldName)
      .map((item) => item.city);

    const clashCity = selectedCities.find((city) =>
      settings[listKey].some(
        (item) =>
          item.city === city &&
          item.name !== oldName &&
          item.name.toLowerCase() === name.toLowerCase(),
      ),
    );
    if (clashCity) {
      alert(`${clashCity} already has a ${typeLabel} named "${name}".`);
      return false;
    }
    const blockedCity = currentCities.find(
      (city) =>
        !selectedCities.includes(city) &&
        contacts.some(
          (contact) =>
            contact.city === city && contact[contactField] === oldName,
        ),
    );
    if (blockedCity) {
      alert(
        `Cannot remove "${oldName}" from ${blockedCity} while contacts there use it. Reassign those contacts first.`,
      );
      return false;
    }

    const previousState = cloneLocationState();
    settings[listKey] = settings[listKey]
      .filter((item) => item.name !== oldName || selectedCities.includes(item.city))
      .map((item) => (item.name === oldName ? { ...item, name } : item));
    selectedCities
      .filter((city) => !currentCities.includes(city))
      .forEach((city) => settings[listKey].push({ name, city }));
    if (name !== oldName) {
      contacts = contacts.map((contact) =>
        contact[contactField] === oldName
          ? { ...contact, [contactField]: name }
          : contact,
      );
      renameFilterValue(`filter-${contactField}`, oldName, name);
    }
    return persistLocationChanges(previousState);
  };

  const deleteLocation = async (type, location) => {
    const contactField = type === "Region" ? "region" : "area";
    const assignedContacts =
      type === "City"
        ? contacts.filter((contact) => contact.city === location.name)
        : contacts.filter((contact) => contact[contactField] === location.name);
    const childLocations =
      type === "City"
        ? settings.regions.filter((region) => region.city === location.name)
            .length +
          settings.areas.filter((area) => area.city === location.name).length
        : 0;
    if (assignedContacts.length) {
      alert(
        `Cannot delete this ${type.toLowerCase()} while it has ${assignedContacts.length} assigned contact${assignedContacts.length === 1 ? "" : "s"}. Reassign those contacts first.`,
      );
      return;
    }
    const childDescription = `${settings.regions.filter((region) => region.city === location.name).length} region(s) and ${settings.areas.filter((area) => area.city === location.name).length} area(s)`;
    if (
      !confirm(
        childLocations
          ? `Delete ${type.toLowerCase()} "${location.name}" and its ${childDescription}? No contacts are assigned to them.`
          : type === "City"
            ? `Delete ${type.toLowerCase()} "${location.name}"?`
            : `Delete ${type.toLowerCase()} "${location.name}" from every city?`,
      )
    ) {
      return;
    }

    const previousState = cloneLocationState();
    if (type === "City") {
      settings.cities = settings.cities.filter(
        (city) => city !== location.name,
      );
      settings.regions = settings.regions.filter(
        (region) => region.city !== location.name,
      );
      settings.areas = settings.areas.filter(
        (area) => area.city !== location.name,
      );
      if (settings.defaultCity === location.name) {
        settings.defaultCity = settings.cities[0] || "";
        document.getElementById("setting-default-city").value =
          settings.defaultCity;
      }
    } else {
      const listKey = type === "Region" ? "regions" : "areas";
      settings[listKey] = settings[listKey].filter(
        (item) => item.name !== location.name,
      );
    }
    await persistLocationChanges(previousState);
  };

  // Passphrase panel: "menu" shows the Change / Turn Off choices; the other
  // modes show one flow at a time.
  let passphraseMode = "menu";
  const setPassphraseMode = (mode) => {
    passphraseMode = mode;
    const protectedNow = Boolean(cryptoMetadata);
    const show = (id, visible) => {
      document.getElementById(id).hidden = !visible;
    };
    const menu = mode === "menu";
    show("btn-start-turn-on", !protectedNow && menu);
    show("passphrase-choices", protectedNow && menu);
    show("change-passphrase-form", mode === "change" || mode === "turn-on");
    show("turn-off-explain", protectedNow && mode === "turn-off-explain");
    show("turn-off-passphrase-section", protectedNow && mode === "turn-off-confirm");
    show("recovery-code-section", protectedNow && menu);
    show("passphrase-section-description", menu);
    const title = document.getElementById("passphrase-section-title");
    title.textContent = protectedNow
      ? "Passphrase is on"
      : mode === "turn-on"
        ? "Turn On Passphrase"
        : "Passphrase is off";
    document.getElementById("change-passphrase-status").textContent = "";
    document.getElementById("turn-off-passphrase-status").textContent = "";
  };

  const updatePassphraseSection = () => {
    const protectedNow = Boolean(cryptoMetadata);
    document.getElementById("passphrase-section-description").textContent =
      protectedNow
        ? "A passphrase is on for this app copy. You may change it or turn it off."
        : `A passphrase is optional. It locks the app so only you can open it; it does not back anything up. A passphrase is currently off. Turn it on to encrypt the data on this device; you will be asked for it each time you open the app. Use at least ${MIN_PASSPHRASE_LENGTH} characters. You will be given a recovery code to keep; without the passphrase or that code, the data cannot be opened.`;
    document.getElementById("current-passphrase-fields").hidden =
      !protectedNow;
    document.getElementById("current-passphrase").required = protectedNow;
    document.getElementById("btn-change-passphrase").textContent =
      protectedNow ? "Change Passphrase" : "Save Passphrase";
    document.getElementById("recovery-code-state").textContent =
      cryptoMetadata?.recovery
        ? "A recovery code is set for this app copy. It is stored, locked, inside your backups too. If you lost the code, make a new one below."
        : "No recovery code is set yet. Make one now so a forgotten passphrase does not lock you out.";
    const keepStatus = [
      document.getElementById("change-passphrase-status").textContent,
      document.getElementById("turn-off-passphrase-status").textContent,
    ];
    setPassphraseMode("menu");
    // Keep a result message that was just written by a successful flow.
    document.getElementById("change-passphrase-status").textContent =
      keepStatus[0];
    document.getElementById("turn-off-passphrase-status").textContent =
      keepStatus[1];
  };
  updatePassphraseSection();
  // Clear old result messages once a settings section is closed.
  document.querySelectorAll(".settings-section").forEach((section) => {
    section.addEventListener("toggle", () => {
      if (section.open) {
        Array.from(section.parentElement.children).forEach((other) => {
          if (
            other !== section &&
            other.matches(".settings-section[open]")
          ) {
            other.open = false;
          }
        });
        return;
      }
      section.querySelectorAll('[role="status"]').forEach((el) => {
        if (el.id.endsWith("-status")) el.textContent = "";
      });
    });
  });
  document
    .getElementById("btn-start-turn-on")
    .addEventListener("click", () => {
      setPassphraseMode("turn-on");
      document.getElementById("new-passphrase").focus();
    });
  document.getElementById("btn-show-change").addEventListener("click", () => {
    setPassphraseMode("change");
    document.getElementById("current-passphrase").focus();
  });
  document
    .getElementById("btn-show-turn-off")
    .addEventListener("click", () => setPassphraseMode("turn-off-explain"));
  document
    .getElementById("btn-turn-off-continue")
    .addEventListener("click", () => {
      setPassphraseMode("turn-off-confirm");
      document.getElementById("turn-off-current-passphrase").focus();
    });
  const backToPassphraseMenu = () => {
    document.getElementById("change-passphrase-form").reset();
    document.getElementById("turn-off-passphrase-form").reset();
    setPassphraseMode("menu");
  };
  [
    "btn-cancel-change-passphrase",
    "btn-turn-off-cancel",
    "btn-turn-off-confirm-cancel",
  ].forEach((id) =>
    document.getElementById(id).addEventListener("click", backToPassphraseMenu),
  );

  document
    .getElementById("recovery-code-form")
    .addEventListener("submit", async (event) => {
      event.preventDefault();
      const currentInput = document.getElementById("recovery-current-passphrase");
      const submitButton = document.getElementById("btn-make-recovery-code");
      const status = document.getElementById("recovery-code-status");
      const appContainer = document.getElementById("app-container");
      let statusMessage = "";
      let newRecoveryCode = null;
      status.textContent = "";
      submitButton.disabled = true;
      appContainer.inert = true;

      try {
        const passphrase = await resolvePassphrase(
          currentInput.value,
          cryptoMetadata,
        );
        try {
          const key = await deriveEncryptionKey(passphrase, cryptoMetadata);
          await decryptValue(await readStoredValue(database, "settings"), key);
        } catch (error) {
          console.error("Unable to verify current passphrase:", error);
          throw new Error(
            "The passphrase is incorrect. No recovery code was made.",
          );
        }
        const { metadata: newMetadata, recoveryCode } = await withRecoveryCode(
          cryptoMetadata,
          passphrase,
        );
        await writeStoredValues(database, [[ENCRYPTION_META_KEY, newMetadata]]);
        cryptoMetadata = newMetadata;
        newRecoveryCode = recoveryCode;
        document.getElementById("recovery-code-form").reset();
        statusMessage =
          "New recovery code made. Any older recovery code no longer works.";
        updatePassphraseSection();
      } catch (error) {
        console.error("Unable to make a recovery code:", error);
        statusMessage =
          error.message || "Could not make a recovery code. Nothing was changed.";
      } finally {
        appContainer.inert = false;
        submitButton.disabled = false;
        status.textContent = statusMessage;
      }
      if (newRecoveryCode) await showRecoveryCodeDialog(newRecoveryCode);
    });

  document
    .getElementById("turn-off-passphrase-form")
    .addEventListener("submit", async (event) => {
      event.preventDefault();
      const currentInput = document.getElementById("turn-off-current-passphrase");
      const submitButton = document.getElementById("btn-turn-off-passphrase");
      const status = document.getElementById("turn-off-passphrase-status");
      const appContainer = document.getElementById("app-container");
      let statusMessage = "";
      status.textContent = "";
      submitButton.disabled = true;
      appContainer.inert = true;

      try {
        if (
          !confirm(
            "Turn off the passphrase? Your data on this device will be stored without encryption, and the app will open without asking for a passphrase. You can turn it on again later.",
          )
        ) {
          return;
        }
        let currentSettings;
        let currentContacts;
        let storedEncryptedSettings;
        let storedEncryptedContacts;
        try {
          const currentKey = await deriveEncryptionKey(
            await resolvePassphrase(currentInput.value, cryptoMetadata),
            cryptoMetadata,
          );
          [storedEncryptedSettings, storedEncryptedContacts] = await Promise.all([
            readStoredValue(database, "settings"),
            readStoredValue(database, "contacts"),
          ]);
          [currentSettings, currentContacts] = await Promise.all([
            decryptValue(storedEncryptedSettings, currentKey),
            decryptValue(storedEncryptedContacts, currentKey),
          ]);
        } catch (error) {
          console.error("Unable to verify current passphrase:", error);
          throw new Error(
            "The passphrase is incorrect, or the saved data could not be decrypted. Your data was not changed.",
          );
        }

        await replaceStoredValuesIfUnchanged(
          database,
          [
            ["settings", storedEncryptedSettings],
            ["contacts", storedEncryptedContacts],
            [ENCRYPTION_META_KEY, cryptoMetadata],
          ],
          [
            ["settings", currentSettings],
            ["contacts", currentContacts],
          ],
          [ENCRYPTION_META_KEY],
        );
        encryptionKey = null;
        cryptoMetadata = null;
        statusMessage =
          "Passphrase turned off. The app will open without asking for one. Backups you export now will not be encrypted.";
        document.getElementById("turn-off-passphrase-form").reset();
        updatePassphraseSection();
      } catch (error) {
        console.error("Unable to turn off passphrase:", error);
        statusMessage =
          error.message === "Saved data changed during the passphrase update."
            ? "Your data changed during the update. No changes were made; please try again."
            : error.message ||
              "Could not turn off the passphrase. Your saved data was not changed.";
      } finally {
        appContainer.inert = false;
        submitButton.disabled = false;
        status.textContent = statusMessage;
      }
    });

  document
    .getElementById("change-passphrase-form")
    .addEventListener("submit", async (event) => {
      event.preventDefault();
      const currentPassphrase = document.getElementById(
        "current-passphrase",
      );
      const newPassphrase = document.getElementById("new-passphrase");
      const confirmNewPassphrase = document.getElementById(
        "confirm-new-passphrase",
      );
      const submitButton = document.getElementById("btn-change-passphrase");
      const status = document.getElementById("change-passphrase-status");
      const appContainer = document.getElementById("app-container");
      const wasProtected = Boolean(cryptoMetadata);
      let statusMessage = "";
      status.textContent = "";
      submitButton.disabled = true;
      appContainer.inert = true;

      try {
        if (newPassphrase.value.length < MIN_PASSPHRASE_LENGTH) {
          throw new Error(
            `Use a new passphrase with at least ${MIN_PASSPHRASE_LENGTH} characters.`,
          );
        }
        if (newPassphrase.value !== confirmNewPassphrase.value) {
          throw new Error("The new passphrases do not match.");
        }
        if (cryptoMetadata && newPassphrase.value === currentPassphrase.value) {
          throw new Error(
            "Choose a new passphrase that differs from the current one.",
          );
        }

        let currentSettings;
        let currentContacts;
        let storedEncryptedSettings;
        let storedEncryptedContacts;
        try {
          const currentKey = cryptoMetadata
            ? await deriveEncryptionKey(
                await resolvePassphrase(
                  currentPassphrase.value,
                  cryptoMetadata,
                ),
                cryptoMetadata,
              )
            : null;
          [storedEncryptedSettings, storedEncryptedContacts] = await Promise.all([
            readStoredValue(database, "settings"),
            readStoredValue(database, "contacts"),
          ]);
          [currentSettings, currentContacts] = await Promise.all([
            decryptValue(storedEncryptedSettings, currentKey),
            decryptValue(storedEncryptedContacts, currentKey),
          ]);
        } catch (error) {
          console.error("Unable to verify current passphrase:", error);
          throw new Error(
            "The current passphrase is incorrect, or the saved data could not be decrypted. Your data was not changed.",
          );
        }

        const baseMetadata = createCryptoMetadata();
        const newKey = await deriveEncryptionKey(
          newPassphrase.value,
          baseMetadata,
        );
        const { metadata: newMetadata, recoveryCode: newRecoveryCode } =
          await withRecoveryCode(baseMetadata, newPassphrase.value);
        const [newEncryptedSettings, newEncryptedContacts] = await Promise.all([
          encryptValue(currentSettings, newKey),
          encryptValue(currentContacts, newKey),
        ]);
        const [verifiedSettings, verifiedContacts] = await Promise.all([
          decryptValue(newEncryptedSettings, newKey),
          decryptValue(newEncryptedContacts, newKey),
        ]);
        if (
          JSON.stringify(verifiedSettings) !== JSON.stringify(currentSettings) ||
          JSON.stringify(verifiedContacts) !== JSON.stringify(currentContacts)
        ) {
          throw new Error("Encrypted data verification did not match.");
        }

        await replaceStoredValuesIfUnchanged(
          database,
          [
            ["settings", storedEncryptedSettings],
            ["contacts", storedEncryptedContacts],
            [ENCRYPTION_META_KEY, cryptoMetadata],
          ],
          [
            ["settings", newEncryptedSettings],
            ["contacts", newEncryptedContacts],
            [ENCRYPTION_META_KEY, newMetadata],
          ],
        );
        encryptionKey = newKey;
        cryptoMetadata = newMetadata;
        statusMessage = wasProtected
          ? "Passphrase changed. Use the new passphrase next time you open this app copy. Your old recovery code no longer works; keep the new one."
          : "Passphrase turned on. You will be asked for it each time you open this app. Keep your recovery code safe; it is the only way back in if you forget the passphrase.";
        document.getElementById("change-passphrase-form").reset();
        updatePassphraseSection();
        await showRecoveryCodeDialog(newRecoveryCode);
      } catch (error) {
        console.error("Unable to change passphrase:", error);
        statusMessage =
          error.message === "Saved data changed during the passphrase update."
            ? "Your data changed while the passphrase was being updated. No changes were made; please try again."
            : error.message ||
              "Could not change the passphrase. Your existing passphrase remains active and your saved data was not changed.";
      } finally {
        appContainer.inert = false;
        submitButton.disabled = false;
        status.textContent = statusMessage;
      }
    });

  // Helper: Calculate days between a timestamp and now
  const calculateDaysSince = (dateInput) => {
    if (!dateInput) return 0;
    const targetDate = new Date(dateInput);
    const now = new Date();
    const diffTime = now - targetDate;
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    return Math.max(0, diffDays);
  };

  // Helper: Determine Color & Status based on Days Since Newest Visit
  const getContactStatus = (contact) => {
    let latestDate = contact.createdAt;
    if (contact.notesHistory && contact.notesHistory.length > 0) {
      const sortedNotes = [...contact.notesHistory].sort(
        (a, b) => new Date(b.rawDate || b.date) - new Date(a.rawDate || a.date),
      );
      latestDate = sortedNotes[0].rawDate || sortedNotes[0].date;
    }
    const days = calculateDaysSince(latestDate);
    if (days >= 15)
      return { label: "Immediate", color: "#dc3545", class: "immediate", days };
    if (days >= 8)
      return { label: "Urgent", color: "#ffc107", class: "urgent", days };
    return { label: "Normal", color: "#28a745", class: "normal", days };
  };

  const getContactAreas = (contact) => (contact.area ? [contact.area] : []);

  const getContactLocationSummary = (contact) =>
    [contact.city, contact.region, contact.area].filter(Boolean).join(" → ") ||
    "No location hierarchy assigned";

  const updatePrintVisibleButton = () => {
    const count = visibleContacts.length;
    const printButton = document.getElementById("btn-print-visible");
    if (printButton) printButton.disabled = count === 0;
    const exportButton = document.getElementById("btn-export-visible");
    if (exportButton) exportButton.disabled = count === 0;
    const badge = document.querySelector("#btn-print-visible .nav-action-count");
    if (badge) {
      badge.textContent = count;
      badge.hidden = count === 0;
    }
  };

  const toLocalDateTimeString = (dateObj) => {
    const pad = (n) => String(n).padStart(2, "0");
    return `${dateObj.getFullYear()}-${pad(dateObj.getMonth() + 1)}-${pad(dateObj.getDate())}T${pad(dateObj.getHours())}:${pad(dateObj.getMinutes())}`;
  };

  // Initialize Main Leaflet Map
  let map = null;
  let mapMarkers = [];
  let homeMarker = null;
  let userLocationMarker = null;
  let userLocationAccuracy = null;
  let userLocationWatchId = null;
  let mapContactPoints = [];
  let cityPinRenderGeneration = 0;
  let lastCityPinLookupAt = 0;
  const cityPinCoordinates = new Map();
  const pendingCityPinLookups = new Map();
  const getHomePoint = () => {
    const lat = parseFloat(settings.me?.lat);
    const lng = parseFloat(settings.me?.lng);
    return Number.isFinite(lat) && Number.isFinite(lng) ? [lat, lng] : null;
  };
  const fitMapToContactPoints = () => {
    if (!map || !map.getContainer().offsetWidth) return;
    const points = [...mapContactPoints];
    const home = getHomePoint();
    if (home) points.push(home);
    if (userLocationMarker) {
      const location = userLocationMarker.getLatLng();
      points.push([location.lat, location.lng]);
    }
    if (points.length === 1) {
      map.setView(points[0], 16);
    } else if (points.length > 1) {
      map.fitBounds(L.latLngBounds(points), {
        padding: [50, 50],
        animate: false,
      });
    }
  };
  let lastDefaultCityCenterQuery = null;
  const defaultCityCoordinates = new Map();
  const pendingDefaultCityLookups = new Map();
  const getCityPinQuery = (contact) =>
    [
      contact.city.trim(),
      normalizeLocationState(
        contact.country || settings.country,
        contact.state || settings.state,
      ),
      contact.country || settings.country,
    ]
      .filter(Boolean)
      .join(", ");
  const getDefaultCityQuery = () =>
    [
      settings.defaultCity.trim(),
      settings.state.trim(),
      settings.country || DEFAULT_SETTINGS.country,
    ]
      .filter(Boolean)
      .join(", ");

  const lookupCityPinCoordinates = async (query) => {
    if (cityPinCoordinates.has(query)) {
      return cityPinCoordinates.get(query);
    }
    let lookup = pendingCityPinLookups.get(query);
    if (!lookup) {
      lookup = (async () => {
        const delay = 1100 - (Date.now() - lastCityPinLookupAt);
        if (delay > 0) {
          await new Promise((resolve) => window.setTimeout(resolve, delay));
        }
        lastCityPinLookupAt = Date.now();
        const url = new URL("https://nominatim.openstreetmap.org/search");
        url.search = new URLSearchParams({
          q: query,
          format: "jsonv2",
          limit: "1",
        }).toString();
        const response = await fetch(url);
        if (!response.ok) {
          throw new Error(`City lookup failed with status ${response.status}.`);
        }
        const results = await response.json();
        const latitude = Number(results[0]?.lat);
        const longitude = Number(results[0]?.lon);
        const location =
          Number.isFinite(latitude) &&
          Number.isFinite(longitude) &&
          latitude >= -90 &&
          latitude <= 90 &&
          longitude >= -180 &&
          longitude <= 180
            ? [latitude, longitude]
            : null;
        cityPinCoordinates.set(query, location);
        return location;
      })();
      pendingCityPinLookups.set(query, lookup);
    }
    try {
      return await lookup;
    } finally {
      pendingCityPinLookups.delete(query);
    }
  };

  const centerMapOnDefaultCity = async () => {
    if (!map || mapMarkers.length > 0 || userLocationMarker) return;
    const city = settings.defaultCity.trim();
    const state = settings.state.trim();
    if (!city) return;

    const query = getDefaultCityQuery();
    if (query === lastDefaultCityCenterQuery) return;
    const status = document.getElementById("map-location-status");
    const cachedLocation = defaultCityCoordinates.get(query);
    if (cachedLocation) {
      map.setView(cachedLocation, 13);
      lastDefaultCityCenterQuery = query;
      status.textContent = `No contact pins to show. The map is centered near ${city}${state ? `, ${state}` : ""}.`;
      return;
    }

    status.textContent = `Locating the default city, ${city}${state ? `, ${state}` : ""}...`;
    try {
      let lookup = pendingDefaultCityLookups.get(query);
      if (!lookup) {
        lookup = (async () => {
          const url = new URL("https://nominatim.openstreetmap.org/search");
          url.search = new URLSearchParams({
            q: query,
            format: "jsonv2",
            limit: "1",
          }).toString();
          const response = await fetch(url);
          if (!response.ok) {
            throw new Error(
              `Default city lookup failed with status ${response.status}.`,
            );
          }
          const results = await response.json();
          const latitude = Number(results[0]?.lat);
          const longitude = Number(results[0]?.lon);
          if (
            !Number.isFinite(latitude) ||
            !Number.isFinite(longitude) ||
            latitude < -90 ||
            latitude > 90 ||
            longitude < -180 ||
            longitude > 180
          ) {
            return null;
          }
          const location = [latitude, longitude];
          defaultCityCoordinates.set(query, location);
          return location;
        })();
        pendingDefaultCityLookups.set(query, lookup);
      }
      const location = await lookup;
      if (
        mapMarkers.length > 0 ||
        userLocationMarker ||
        query !== getDefaultCityQuery()
      )
        return;
      if (!location) {
        status.textContent = `Couldn't locate ${city}${state ? `, ${state}` : ""}. Choose Find Address or City Pin on a contact to locate an address.`;
        return;
      }

      map.setView(location, 13);
      lastDefaultCityCenterQuery = query;
      status.textContent = `No contact pins to show. The map is centered near ${city}${state ? `, ${state}` : ""}.`;
    } catch (error) {
      if (
        mapMarkers.length > 0 ||
        userLocationMarker ||
        query !== getDefaultCityQuery()
      )
        return;
      console.error("Unable to locate the default city on the map:", error);
      status.textContent = `Couldn't locate ${city}${state ? `, ${state}` : ""}. Check your connection or use Find Address or City Pin on a contact.`;
    } finally {
      pendingDefaultCityLookups.delete(query);
    }
  };

  const initMap = () => {
    if (map) return;
    map = L.map("map", { doubleClickZoom: false }).setView(
      [39.8283, -98.5795],
      4,
    );
    map.createPane("userLocationPane");
    map.getPane("userLocationPane").style.zIndex = "650";
    window.mapInstance = map;

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "&copy; OpenStreetMap contributors",
    }).addTo(map);
    // Wait a tick so the map knows its real size before fitting every pin.
    setTimeout(() => {
      map.invalidateSize();
      renderMapMarkers();
    }, 50);
  };

  const stopMapLocationWatch = () => {
    cityPinRenderGeneration += 1;
    if (userLocationWatchId !== null) {
      navigator.geolocation.clearWatch(userLocationWatchId);
      userLocationWatchId = null;
    }
    if (userLocationMarker) {
      map.removeLayer(userLocationMarker);
      userLocationMarker = null;
    }
    if (userLocationAccuracy) {
      map.removeLayer(userLocationAccuracy);
      userLocationAccuracy = null;
    }
    document.getElementById("map-user-location-status").textContent = "";
  };

  const startMapLocationWatch = () => {
    const status = document.getElementById("map-user-location-status");
    if (!navigator.geolocation) {
      status.textContent = "This browser does not support device location.";
      return;
    }
    if (userLocationWatchId !== null) return;
    status.textContent = "Requesting device location for the blue dot...";
    userLocationWatchId = navigator.geolocation.watchPosition(
      (position) => {
        if (currentViewId !== "map-view" || !map) return;
        const latitude = position.coords.latitude;
        const longitude = position.coords.longitude;
        if (
          !Number.isFinite(latitude) ||
          !Number.isFinite(longitude) ||
          Math.abs(latitude) > 90 ||
          Math.abs(longitude) > 180
        ) {
          status.textContent = "The device returned an invalid location.";
          return;
        }
        const firstFix = !userLocationMarker;
        const location = [latitude, longitude];
        const reportedAccuracy = Number(position.coords.accuracy);
        const accuracyRadius = Number.isFinite(reportedAccuracy)
          ? Math.max(0, reportedAccuracy)
          : 0;
        if (!userLocationMarker) {
          userLocationAccuracy = L.circle(location, {
            pane: "userLocationPane",
            radius: accuracyRadius,
            color: "#1683ff",
            weight: 1,
            fillColor: "#1683ff",
            fillOpacity: 0.12,
            interactive: false,
          }).addTo(map);
          userLocationMarker = L.circleMarker(location, {
            pane: "userLocationPane",
            radius: 8,
            color: "#ffffff",
            weight: 3,
            fillColor: "#1683ff",
            fillOpacity: 1,
            className: "user-location-dot",
            interactive: false,
          }).addTo(map);
        } else {
          userLocationMarker.setLatLng(location);
          userLocationAccuracy.setLatLng(location);
          userLocationAccuracy.setRadius(accuracyRadius);
        }
        if (firstFix) fitMapToContactPoints();
        status.textContent = "Your live location is shown by the blue dot.";
      },
      (error) => {
        if (currentViewId !== "map-view") return;
        console.error("Unable to get the live map location:", error);
        status.textContent =
          error.code === error.PERMISSION_DENIED
            ? "Location permission was denied. Allow location access to show your blue dot."
            : "Could not get your location. Check location services and try again.";
        if (error.code === error.PERMISSION_DENIED) {
          navigator.geolocation.clearWatch(userLocationWatchId);
          userLocationWatchId = null;
        }
      },
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 20000 },
    );
  };

  // Navigation & Dynamic Footer
  let currentViewId = "contacts-view";
  const navButtonsConfig = [
    { id: "contacts-view", icon: "👥" },
    { id: "map-view", icon: "📍", pinLabel: "Map" },
    { id: "time-view", icon: "⏱️" },
    { id: "settings-view", icon: "⚙️" },
  ];

  const getPageActions = () => {
    if (currentViewId === "contacts-view") {
      return [
        {
          id: "btn-print-visible",
          icon: "print",
          title: "Print the contacts shown",
          onClick: () => printVisibleContacts(),
        },
      ];
    }
    if (currentViewId === "map-view") {
      return [
        {
          id: "btn-print-map",
          icon: "print",
          title: "Print the map contacts",
          onClick: () => requestMapPrint(),
        },
      ];
    }
    if (currentViewId === "settings-view") {
      return [
        {
          id: "btn-print-settings",
          icon: "print",
          title: "Print all settings",
          onClick: () => printSettings(),
        },
      ];
    }
    return [];
  };

  const updateHeaderTitle = () => {
    const names = {
      "contacts-view": "Contacts",
      "map-view": "Map",
      "time-view": "Time",
      "settings-view": "Settings",
    };
    const contactModal = document.getElementById("contact-modal");
    const modalOpen =
      contactModal && contactModal.style.display === "flex";
    const name = document.body.classList.contains("install-setup-in-progress")
      ? "Install"
      : modalOpen
        ? document.getElementById("modal-title").textContent
        : names[currentViewId] || "Contacts";
    const h1 = document.getElementById("app-title");
    if (h1) h1.textContent = `NRV - ${name}`;
  };

  const setupNextStepsDialog = document.getElementById(
    "setup-next-steps-dialog",
  );
  const setupNextStepsNotice = document.getElementById(
    "setup-next-steps-notice",
  );
  const notifySetupSaveFailure = () =>
    alert(
      "We could not save your setup progress on this device. Check device storage and try again.",
    );
  const showSetupNextStepsIfReady = () => {
    try {
      if (
        localStorage.getItem("return_visits_setup_pending") === "true" &&
        !setupNextStepsNotice.hidden
      ) {
        setupNextStepsDialog.showModal();
      }
    } catch (error) {
      console.error("Unable to read the first-use setup status:", error);
    }
  };
  document
    .getElementById("btn-setup-add-first-contact")
    .addEventListener("click", () => {
      if (!markInstalledSetupComplete()) {
        notifySetupSaveFailure();
        return;
      }
      setupNextStepsDialog.close();
      setupNextStepsNotice.hidden = true;
      try {
        localStorage.removeItem("return_visits_setup_pending");
      } catch (error) {
        console.error("Unable to save the setup status:", error);
      }
      document.body.classList.remove("install-setup-in-progress");
      document.getElementById("btn-open-modal").click();
    });
  document
    .getElementById("btn-setup-add-more-details")
    .addEventListener("click", () => {
      setupNextStepsDialog.close();
      document
        .querySelector('#bottom-nav .nav-btn[title^="settings"]')
        ?.click();
      const detailsHeading = document.getElementById("your-details-heading");
      if (detailsHeading) {
        document.getElementById("defaults-your-details-section").open = true;
        detailsHeading.scrollIntoView({ block: "start" });
      }
    });
  document
    .getElementById("btn-setup-continue-later")
    .addEventListener("click", () => {
      if (!markInstalledSetupComplete()) {
        notifySetupSaveFailure();
        return;
      }
      setupNextStepsNotice.hidden = true;
      try {
        localStorage.removeItem("return_visits_setup_pending");
      } catch (error) {
        console.error("Unable to save the setup status:", error);
      }
      document.body.classList.remove("install-setup-in-progress");
    });

  const renderBottomNav = () => {
    const pageNames = {
      "contacts-view": "Contacts",
      "map-view": "Map",
      "time-view": "Time",
      "settings-view": "Settings",
    };
    document.title = `NRV - ${pageNames[currentViewId] || "Contacts"}`;
    if (document.body.classList.contains("install-setup-in-progress")) {
      document.title = "NRV-Install";
    }
    updateHeaderTitle();
    document.body.classList.toggle(
      "settings-open",
      currentViewId === "settings-view",
    );
    const navContainer = document.getElementById("bottom-nav");
    navContainer.innerHTML = "";
    getPageActions().forEach((action) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.id = action.id;
      btn.className = "nav-btn nav-action";
      btn.title = action.title;
      btn.setAttribute("aria-label", action.title);
      btn.innerHTML = `<span class="nav-btn-icon" aria-hidden="true">${iconSvg(action.icon)}</span><span class="nav-action-count" hidden></span>`;
      btn.addEventListener("click", action.onClick);
      navContainer.appendChild(btn);
    });
    updatePrintVisibleButton();
    const timeTracking = settings.timeTracking;
    navButtonsConfig.forEach((btnConfig) => {
      if (btnConfig.id === "time-view" && !timeTracking.enabled) return;
      if (btnConfig.id !== currentViewId) {
        const btn = document.createElement("button");
        btn.className = "nav-btn";
        const icon = document.createElement("span");
        icon.className = "nav-btn-icon";
        icon.setAttribute("aria-hidden", "true");
        if (btnConfig.pinLabel) {
          const pin = document.createElement("span");
          pin.className = "nav-map-pin";
          pin.textContent = btnConfig.pinLabel;
          icon.appendChild(pin);
        } else {
          icon.textContent = btnConfig.icon;
          if (btnConfig.id === "settings-view") {
            icon.classList.add("nav-settings-icon");
          }
        }
        btn.appendChild(icon);
        btn.title = btnConfig.id.replace("-view", "");
        if (btnConfig.id === "time-view" && timeTracking.runningSince) {
          btn.title = "Time — timer running";
          btn.setAttribute("aria-label", "Time, timer running");
          const dot = document.createElement("span");
          dot.className = "nav-timer-dot";
          dot.setAttribute("aria-hidden", "true");
          icon.appendChild(dot);
        }
        if (btnConfig.id === "settings-view" && appUpdateAvailable) {
          btn.title = "Settings — app update available";
          btn.setAttribute("aria-label", "Settings, app update available");
          const badge = document.createElement("span");
          badge.className = "nav-update-badge";
          badge.setAttribute("aria-hidden", "true");
          badge.textContent = "!";
          icon.appendChild(badge);
        }
        btn.addEventListener("click", () => {
          if (currentViewId === "settings-view" && !confirmLeaveSettings()) {
            return;
          }
          if (currentViewId === "map-view") stopMapLocationWatch();
          if (currentViewId === "settings-view") {
            document
              .querySelectorAll("#settings-view details[open]")
              .forEach((section) => {
                section.open = false;
              });
          }
          currentViewId = btnConfig.id;
          document
            .querySelectorAll(".view")
            .forEach((v) => v.classList.remove("active"));
          document.getElementById(currentViewId).classList.add("active");
          renderBottomNav();
          if (currentViewId === "settings-view" && appUpdateAvailable) {
            document
              .getElementById("app-update-notice")
              .closest("details").open = true;
            appUpdatePromptDismissed = false;
            appUpdatePromptHandler?.();
          }

          if (currentViewId === "time-view") renderTimeView();

          if (currentViewId === "contacts-view") {
            showSetupNextStepsIfReady();
          }

          if (currentViewId === "map-view") {
            if (!map) {
              initMap();
            } else {
              setTimeout(() => {
                map.invalidateSize();
                renderMapMarkers();
              }, 50);
            }
            startMapLocationWatch();
          }
        });
        navContainer.appendChild(btn);
      }
    });
  };
  renderBottomNav();

  // ---- Time in Service ----
  const MONTHLY_GOAL_SECONDS = 50 * 3600;
  const YEARLY_GOAL_SECONDS = 600 * 3600;
  const pad2 = (number) => String(number).padStart(2, "0");
  const toDateKey = (date) =>
    `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
  const formatHours = (seconds) => {
    const whole = Math.max(0, Math.floor(seconds));
    return `${Math.floor(whole / 3600)}:${pad2(Math.floor((whole % 3600) / 60))}`;
  };
  const formatClock = (seconds) => {
    const whole = Math.max(0, Math.floor(seconds));
    return `${formatHours(whole)}:${pad2(whole % 60)}`;
  };
  const splitByDay = (startMs, endMs) => {
    const parts = [];
    let cursor = startMs;
    while (cursor < endMs) {
      const day = new Date(cursor);
      const nextMidnight = new Date(
        day.getFullYear(),
        day.getMonth(),
        day.getDate() + 1,
      ).getTime();
      const stop = Math.min(nextMidnight, endMs);
      parts.push({ date: toDateKey(day), seconds: (stop - cursor) / 1000 });
      cursor = stop;
    }
    return parts;
  };
  const getTimeTotals = () => {
    const tracking = settings.timeTracking;
    const now = new Date();
    const todayKey = toDateKey(now);
    const monthPrefix = todayKey.slice(0, 7);
    const serviceYearStart =
      now.getMonth() >= 8 ? now.getFullYear() : now.getFullYear() - 1;
    const yearFrom = `${serviceYearStart}-09-01`;
    const yearTo = `${serviceYearStart + 1}-09-01`;
    const running = tracking.runningSince
      ? splitByDay(Date.parse(tracking.runningSince), now.getTime())
      : [];
    const totals = { today: 0, month: 0, year: 0, serviceYearStart, now };
    [...tracking.entries, ...running].forEach((entry) => {
      if (entry.date === todayKey) totals.today += entry.seconds;
      if (entry.date.startsWith(monthPrefix)) totals.month += entry.seconds;
      if (entry.date >= yearFrom && entry.date < yearTo) {
        totals.year += entry.seconds;
      }
    });
    return totals;
  };
  const timeToggleButton = document.getElementById("btn-time-toggle");
  const timeEntryForm = document.getElementById("time-entry-form");
  let editingTimeEntryId = null;

  const updateTimeToggle = () => {
    const tracking = settings.timeTracking;
    timeToggleButton.hidden = !tracking.enabled;
    timeToggleButton.classList.toggle("running", Boolean(tracking.runningSince));
    timeToggleButton.textContent = tracking.runningSince ? "Stop Time" : "Start Time";
    timeToggleButton.setAttribute(
      "aria-label",
      tracking.runningSince
        ? "Stop timer. Time is being counted."
        : "Start timer. Time is not being counted.",
    );
  };

  const renderTimeSummary = () => {
    const tracking = settings.timeTracking;
    const totals = getTimeTotals();
    updateTimeToggle();
    document.getElementById("time-today").textContent = formatClock(totals.today);
    const renderGoal = (prefix, shown, done, goal, label) => {
      document.getElementById(`time-${prefix}-summary`).hidden = !shown;
      document.getElementById(`time-${prefix}-label`).textContent = label;
      document.getElementById(`time-${prefix}-text`).textContent =
        `${formatHours(done)} of ${goal / 3600} hrs • ${formatHours(Math.max(0, goal - done))} to go`;
      document.getElementById(`time-${prefix}-bar`).value = Math.min(
        100,
        (done / goal) * 100,
      );
    };
    renderGoal(
      "month",
      tracking.showMonthly,
      totals.month,
      MONTHLY_GOAL_SECONDS,
      totals.now.toLocaleString(undefined, { month: "long", year: "numeric" }),
    );
    renderGoal(
      "year",
      tracking.showYearly,
      totals.year,
      YEARLY_GOAL_SECONDS,
      `Service year ${totals.serviceYearStart}–${totals.serviceYearStart + 1}`,
    );
  };

  const renderTimeEntries = () => {
    const list = document.getElementById("time-entries");
    const entries = [...settings.timeTracking.entries]
      .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id))
      .slice(0, 60);
    list.innerHTML = "";
    if (!entries.length) {
      list.innerHTML = "<p>No time recorded yet.</p>";
      return;
    }
    entries.forEach((entry) => {
      const row = document.createElement("div");
      row.className = "time-entry";
      const [year, month, day] = entry.date.split("-").map(Number);
      const label = new Date(year, month - 1, day).toLocaleDateString(undefined, {
        weekday: "short",
        month: "short",
        day: "numeric",
        year: "numeric",
      });
      const text = document.createElement("span");
      text.textContent = `${label} — ${formatHours(entry.seconds)}${entry.note ? ` — ${entry.note}` : ""}`;
      const edit = document.createElement("button");
      edit.type = "button";
      edit.className = "btn-icon";
      edit.textContent = "✏️";
      edit.title = "Edit this time";
      edit.addEventListener("click", () => startEditingTimeEntry(entry.id));
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "btn-icon delete";
      remove.textContent = "🗑️";
      remove.title = "Delete this time";
      remove.addEventListener("click", () => deleteTimeEntry(entry.id));
      row.append(text, edit, remove);
      list.appendChild(row);
    });
  };

  const resetTimeEntryForm = () => {
    editingTimeEntryId = null;
    timeEntryForm.reset();
    const today = toDateKey(new Date());
    document.getElementById("time-entry-date").value = today;
    document.getElementById("time-entry-date").max = today;
    document.getElementById("btn-time-entry-save").textContent = "Add Time";
    document.getElementById("btn-time-entry-cancel").hidden = true;
  };

  const renderTimeView = () => {
    renderTimeSummary();
    renderTimeEntries();
  };

  const saveTimeTracking = async (previous) => {
    try {
      await saveSettings();
      return true;
    } catch (error) {
      settings.timeTracking = normalizeTimeTracking(previous);
      showStorageError("save time in service", error);
      return false;
    }
  };

  const newTimeEntryId = () =>
    `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  timeToggleButton.addEventListener("click", async () => {
    const tracking = settings.timeTracking;
    const previous = JSON.parse(JSON.stringify(tracking));
    if (tracking.runningSince) {
      splitByDay(Date.parse(tracking.runningSince), Date.now()).forEach((part) => {
        const seconds = Math.round(part.seconds);
        if (seconds > 0) {
          tracking.entries.push({
            id: newTimeEntryId(),
            date: part.date,
            seconds,
            note: "Timer",
          });
        }
      });
      tracking.runningSince = null;
    } else {
      tracking.runningSince = new Date().toISOString();
    }
    await saveTimeTracking(previous);
    renderBottomNav();
    renderTimeView();
  });

  timeEntryForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const date = document.getElementById("time-entry-date").value;
    const hours = Number(document.getElementById("time-entry-hours").value) || 0;
    const minutes = Number(document.getElementById("time-entry-minutes").value) || 0;
    const note = document.getElementById("time-entry-note").value.trim();
    const seconds = Math.round(hours * 3600 + minutes * 60);
    if (!date || date > toDateKey(new Date())) {
      alert("Choose a date that is today or earlier.");
      return;
    }
    if (hours < 0 || minutes < 0 || minutes > 59 || seconds <= 0 || hours > 24) {
      alert("Enter hours (up to 24) and minutes (0–59) greater than zero.");
      return;
    }
    const tracking = settings.timeTracking;
    const previous = JSON.parse(JSON.stringify(tracking));
    const existing = tracking.entries.find((entry) => entry.id === editingTimeEntryId);
    if (existing) {
      Object.assign(existing, { date, seconds, note });
    } else {
      tracking.entries.push({ id: newTimeEntryId(), date, seconds, note });
    }
    if (await saveTimeTracking(previous)) resetTimeEntryForm();
    renderTimeView();
  });

  document
    .getElementById("btn-time-entry-cancel")
    .addEventListener("click", resetTimeEntryForm);

  const startEditingTimeEntry = (id) => {
    const entry = settings.timeTracking.entries.find((item) => item.id === id);
    if (!entry) return;
    editingTimeEntryId = id;
    document.getElementById("time-entry-date").value = entry.date;
    document.getElementById("time-entry-hours").value = Math.floor(entry.seconds / 3600);
    document.getElementById("time-entry-minutes").value = Math.floor((entry.seconds % 3600) / 60);
    document.getElementById("time-entry-note").value = entry.note;
    document.getElementById("btn-time-entry-save").textContent = "Save Changes";
    document.getElementById("btn-time-entry-cancel").hidden = false;
    timeEntryForm.scrollIntoView({ block: "center" });
  };

  const deleteTimeEntry = async (id) => {
    if (!confirm("Delete this time entry?")) return;
    const tracking = settings.timeTracking;
    const previous = JSON.parse(JSON.stringify(tracking));
    tracking.entries = tracking.entries.filter((entry) => entry.id !== id);
    tracking.deleted.push(id);
    if (editingTimeEntryId === id) resetTimeEntryForm();
    await saveTimeTracking(previous);
    renderTimeView();
  };

  const trackTimeCheckbox = document.getElementById("setting-time-tracking");
  const timeOptions = document.getElementById("time-tracking-options");
  const monthlyCheckbox = document.getElementById("setting-time-monthly");
  const yearlyCheckbox = document.getElementById("setting-time-yearly");
  const syncTimeSettingsForm = () => {
    const tracking = settings.timeTracking;
    trackTimeCheckbox.checked = tracking.enabled;
    monthlyCheckbox.checked = tracking.showMonthly;
    yearlyCheckbox.checked = tracking.showYearly;
    timeOptions.hidden = !tracking.enabled;
    updateTimeToggle();
  };
  trackTimeCheckbox.addEventListener("change", async () => {
    const previous = JSON.parse(JSON.stringify(settings.timeTracking));
    if (trackTimeCheckbox.checked) {
      settings.timeTracking.enabled = true;
    } else {
      if (
        !confirm(
          "Turning off Track Time in Service erases all the time you have recorded, including this month's and this service year's totals. This cannot be undone unless you have a backup. Turn it off?",
        )
      ) {
        trackTimeCheckbox.checked = true;
        return;
      }
      settings.timeTracking = normalizeTimeTracking({
        showMonthly: previous.showMonthly,
        showYearly: previous.showYearly,
      });
      resetTimeEntryForm();
    }
    await saveTimeTracking(previous);
    syncTimeSettingsForm();
    renderBottomNav();
  });
  [
    [monthlyCheckbox, "showMonthly"],
    [yearlyCheckbox, "showYearly"],
  ].forEach(([checkbox, key]) => {
    checkbox.addEventListener("change", async () => {
      const previous = JSON.parse(JSON.stringify(settings.timeTracking));
      settings.timeTracking[key] = checkbox.checked;
      await saveTimeTracking(previous);
      syncTimeSettingsForm();
    });
  });
  syncTimeSettingsForm();
  resetTimeEntryForm();

  // A web app can't intercept being closed, so ask when it is reopened.
  const TIME_SEEN_KEY = "return_visits_time_last_seen";
  let checkingTimer = false;
  const markTimerSeen = () => {
    try {
      if (settings.timeTracking.runningSince) {
        localStorage.setItem(TIME_SEEN_KEY, String(Date.now()));
      }
    } catch (error) {
      console.error("Unable to save the timer heartbeat:", error);
    }
  };
  const checkRunningTimer = async () => {
    const tracking = settings.timeTracking;
    if (checkingTimer || !tracking.runningSince) return;
    let lastSeen = 0;
    try {
      lastSeen = Number(localStorage.getItem(TIME_SEEN_KEY)) || 0;
    } catch (error) {
      console.error("Unable to read the timer heartbeat:", error);
    }
    const startedAt = Date.parse(tracking.runningSince);
    if (!lastSeen || lastSeen <= startedAt || Date.now() - lastSeen < 2 * 60 * 1000) {
      markTimerSeen();
      return;
    }
    checkingTimer = true;
    const keep = confirm(
      `Your timer is still running. You were last in the app at ${new Date(lastSeen).toLocaleString()}.\n\nOK = Keep time going.\nCancel = Stop the timer at that time.`,
    );
    if (keep) {
      markTimerSeen();
    } else {
      const previous = JSON.parse(JSON.stringify(tracking));
      splitByDay(startedAt, lastSeen).forEach((part) => {
        const seconds = Math.round(part.seconds);
        if (seconds > 0) {
          tracking.entries.push({
            id: newTimeEntryId(),
            date: part.date,
            seconds,
            note: "Timer",
          });
        }
      });
      tracking.runningSince = null;
      await saveTimeTracking(previous);
      renderBottomNav();
      renderTimeView();
    }
    checkingTimer = false;
  };
  window.setInterval(markTimerSeen, 15000);
  window.addEventListener("pagehide", markTimerSeen);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") markTimerSeen();
    else checkRunningTimer();
  });
  window.setTimeout(checkRunningTimer, 800);
  window.setInterval(() => {
    if (currentViewId === "time-view" && settings.timeTracking.enabled) {
      renderTimeSummary();
    }
  }, 1000);

  const saveContacts = async () => {
    try {
      const nextSignatures = stampChangedContacts();
      await encryptStoredValue(database, "contacts", contacts, encryptionKey);
      contactSignatures = nextSignatures;
    } catch (error) {
      showStorageError("save contacts", error);
      return false;
    }
    cloudBackupHook();
    renderContacts();
    return true;
  };

  // Modal Elements & Interactive Picker Map
  const modal = document.getElementById("contact-modal");
  const btnOpenModal = document.getElementById("btn-open-modal");
  const btnFindAddress = document.getElementById("btn-find-address");
  const btnFindCrossStreet = document.getElementById("btn-find-cross-street");
  const crossStreetSearch = document.getElementById("cross-street-search");
  const closeModal = document.getElementById("close-modal");
  const contactForm = document.getElementById("contact-form");
  const contactModalBody = contactForm.querySelector(".modal-body");
  const phoneInput = document.getElementById("contact-phone");
  const streetAddressInput = document.getElementById("contact-address");
  const contactStateInput = document.getElementById("contact-state");
  const settingStateInput = document.getElementById("setting-state");
  const settingDefaultCityInput = document.getElementById(
    "setting-default-city",
  );
  const contactShareDialog = document.getElementById("contact-share-dialog");
  const contactShareTitle = document.getElementById("contact-share-title");

  // Keeps the Update Log button (or new-note box) centered in the space left
  // above the keyboard so it is not covered.
  const visitsSection = document.getElementById("contact-visits-section");
  contactModalBody.addEventListener("focusin", (event) => {
    const field = event.target;
    if (!visitsSection.contains(field) || !field.matches("input, textarea")) {
      return;
    }
    visitsSection.classList.add("visit-editing");
    const entry = field.closest(".note-entry");
    const target = entry
      ? entry.querySelector("button") || field
      : document.getElementById("contact-notes");
    setTimeout(() => {
      if (!target.isConnected) return;
      const body = contactModalBody.getBoundingClientRect();
      const viewport = window.visualViewport;
      const top = Math.max(body.top, viewport?.offsetTop ?? 0);
      const bottom = Math.min(
        body.bottom,
        viewport ? viewport.offsetTop + viewport.height : body.bottom,
      );
      const rect = target.getBoundingClientRect();
      contactModalBody.scrollTop +=
        rect.top + rect.height / 2 - (top + bottom) / 2;
    }, 300);
  });
  contactModalBody.addEventListener("focusout", (event) => {
    if (!visitsSection.contains(event.relatedTarget)) {
      visitsSection.classList.remove("visit-editing");
    }
  });

  streetAddressInput.addEventListener("blur", () => {
    streetAddressInput.value = normalizeStreetName(streetAddressInput.value);
  });
  contactStateInput.addEventListener("blur", () => {
    contactStateInput.value = normalizeLocationState(
      contactCountrySelect.value,
      contactStateInput.value,
    );
  });
  settingStateInput.addEventListener("blur", () => {
    settingStateInput.value = normalizeLocationState(
      settings.country,
      settingStateInput.value,
    );
  });
  settingDefaultCityInput.addEventListener("blur", () => {
    settingDefaultCityInput.value = toTitleCase(settingDefaultCityInput.value);
  });

  const setShareLink = (elementId, href) => {
    document.getElementById(elementId).href = href;
  };
  [
    "share-contact-sms",
    "share-contact-whatsapp",
    "share-contact-email",
  ].forEach((elementId) => {
    document
      .getElementById(elementId)
      .addEventListener("click", () => contactShareDialog.close());
  });

  let contactBeingShared = null;
  const updateContactShareLinks = () => {
    if (!contactBeingShared) return;
    const contact = contactBeingShared;
    const fullName = `${contact.firstName} ${contact.lastName || ""}`.trim();
    const notes = getSortedVisitNotes(contact).filter((note) => note.text);
    const choice =
      contactShareDialog.querySelector('input[name="share-notes"]:checked')
        ?.value || "none";
    const selectedNotes =
      choice === "all" ? notes : choice === "latest" ? notes.slice(0, 1) : [];
    const shareText = getContactShareText(
      contact,
      selectedNotes,
      settings.me?.name || "",
    );
    const encodedText = encodeURIComponent(shareText);
    const encodedSubject = encodeURIComponent(`Contact: ${fullName}`);
    setShareLink("share-contact-sms", `sms:?body=${encodedText}`);
    setShareLink(
      "share-contact-whatsapp",
      `https://wa.me/?text=${encodedText}`,
    );
    setShareLink(
      "share-contact-email",
      `mailto:?subject=${encodedSubject}&body=${encodedText}`,
    );
  };
  contactShareDialog
    .querySelectorAll('input[name="share-notes"]')
    .forEach((radio) => {
      radio.addEventListener("change", updateContactShareLinks);
    });

  const openContactShareDialog = (contact) => {
    const fullName = `${contact.firstName} ${contact.lastName || ""}`.trim();
    const noteCount = (contact.notesHistory || []).filter(
      (note) => note.text,
    ).length;
    contactBeingShared = contact;
    contactShareTitle.textContent = `Share: ${fullName}`;
    contactShareDialog.querySelector(
      'input[name="share-notes"][value="none"]',
    ).checked = true;
    document.getElementById("share-notes-options").hidden = noteCount === 0;
    document.getElementById("share-notes-latest-label").hidden = noteCount < 1;
    document.getElementById("share-notes-all-label").hidden = noteCount < 2;
    document.getElementById("share-notes-count").textContent = noteCount
      ? `This contact has ${noteCount} visit note${noteCount === 1 ? "" : "s"}.`
      : "";
    updateContactShareLinks();
    contactShareDialog.showModal();
  };
  contactShareDialog.addEventListener("close", () => {
    contactBeingShared = null;
  });

  const formatPhoneNumber = (value) => {
    let digits = value.replace(/\D/g, "");
    if (digits.length === 11 && digits.startsWith("1")) {
      digits = digits.slice(1);
    }
    if (digits.length > 10) return digits;
    if (digits.length <= 3) return digits ? `(${digits}` : "";
    if (digits.length <= 6) {
      return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
    }
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  };

  phoneInput.addEventListener("input", () => {
    const value = phoneInput.value;
    const start = phoneInput.selectionStart ?? value.length;
    const end = phoneInput.selectionEnd ?? start;
    const digitsBefore = value.slice(0, start).replace(/\D/g, "").length;
    const digitsThrough = value.slice(0, end).replace(/\D/g, "").length;
    const formatted = formatPhoneNumber(value);
    const positionAfterDigits = (digitCount) => {
      if (digitCount === 0) return 0;
      let position = 0;
      let digitsFound = 0;
      while (position < formatted.length && digitsFound < digitCount) {
        if (/\d/.test(formatted[position])) digitsFound += 1;
        position += 1;
      }
      return position;
    };
    phoneInput.value = formatted;
    phoneInput.setSelectionRange(
      positionAfterDigits(digitsBefore),
      positionAfterDigits(digitsThrough),
    );
  });

  let pickerMap = null;
  let pickerMarker = null;
  const defaultMapCenter = [38.8517, -121.1275];

  const setPickerLocation = (lat, lng, zoom = 16) => {
    const location = [Number(lat), Number(lng)];
    if (
      !Number.isFinite(location[0]) ||
      !Number.isFinite(location[1]) ||
      location[0] < -90 ||
      location[0] > 90 ||
      location[1] < -180 ||
      location[1] > 180
    ) {
      throw new Error("The pin coordinates are outside the valid range.");
    }
    if (!pickerMap) {
      throw new Error("The contact map is not ready yet.");
    }
    document.getElementById("contact-lat").value = location[0].toFixed(6);
    document.getElementById("contact-lng").value = location[1].toFixed(6);
    if (pickerMarker) {
      pickerMarker.setLatLng(location);
    } else {
      pickerMarker = L.marker(location, { draggable: true }).addTo(pickerMap);
      pickerMarker.on("dragend", () => {
        const movedTo = pickerMarker.getLatLng();
        document.getElementById("contact-lat").value =
          movedTo.lat.toFixed(6);
        document.getElementById("contact-lng").value =
          movedTo.lng.toFixed(6);
        updatePrintContactAvailability();
      });
    }
    pickerMap.setView(location, zoom);
    updatePrintContactAvailability();
    updatePinUi();
  };

  // Pin tools collapse once the pin is confirmed; they reopen on "Adjust pin"
  // or when the address changes.
  let pinPanelOpen = true;
  const updatePinUi = () => {
    const hasPin =
      Boolean(document.getElementById("contact-lat").value.trim()) &&
      Boolean(document.getElementById("contact-lng").value.trim());
    const open = pinPanelOpen || !hasPin;
    document.getElementById("pin-tools").hidden = !open;
    document.getElementById("pin-address-hint").hidden = !open;
    document.getElementById("pin-summary").hidden = open;
    document.getElementById("btn-confirm-pin").hidden = !hasPin;
  };
  const setPinPanel = (open) => {
    pinPanelOpen = open;
    updatePinUi();
    if (open && pickerMap) {
      setTimeout(() => {
        pickerMap.invalidateSize();
        if (pickerMarker) pickerMap.setView(pickerMarker.getLatLng(), 16);
      }, 50);
    }
  };

  const locationStatus = document.getElementById("location-status");
  const addressMatchResults = document.getElementById(
    "address-match-results",
  );
  const setLocationStatus = (message) => {
    locationStatus.textContent = message;
  };
  const clearAddressMatches = () => {
    addressMatchResults.replaceChildren();
    addressMatchResults.hidden = true;
  };
  const getStreetMatchLabel = (result) =>
    result.address?.road
      ? normalizeStreetName(result.address.road)
      : result.display_name;
  const getUniqueStreetMatches = (results) => {
    const streetMatches = results.filter((result) => result.address?.road);
    if (streetMatches.length === 0) return results;
    const uniqueStreets = new Map();
    streetMatches.forEach((result) => {
      const streetName = normalizeStreetName(result.address.road);
      const key = streetName.toLowerCase();
      if (!uniqueStreets.has(key)) uniqueStreets.set(key, result);
    });
    return Array.from(uniqueStreets.values());
  };
  const selectAddressMatch = (result, enteredStreet) => {
    const latitude = Number(result.lat);
    const longitude = Number(result.lon);
    setPickerLocation(latitude, longitude);
    const address = result.address || {};
    const houseNumber = enteredStreet.match(/^\d+[A-Za-z]?\b/)?.[0];
    if (address.road) {
      streetAddressInput.value = normalizeStreetName(
        [houseNumber, address.road].filter(Boolean).join(" "),
      );
    }
    updatePrintContactAvailability();
    crossStreetSearch.hidden = true;
    document.getElementById("contact-cross-street").value = "";
    clearAddressMatches();
    setLocationStatus(
      `Pin placed near ${result.display_name}. Check its position and move it on the map if needed.`,
    );
  };
  const showAddressMatches = (results, enteredStreet) => {
    addressMatchResults.replaceChildren();
    const heading = document.createElement("strong");
    heading.textContent = "Choose the matching street or location:";
    addressMatchResults.appendChild(heading);
    const list = document.createElement("div");
    list.className = "address-match-options";
    results.forEach((result) => {
      const option = document.createElement("button");
      option.type = "button";
      option.textContent = getStreetMatchLabel(result);
      option.addEventListener("click", () =>
        selectAddressMatch(result, enteredStreet),
      );
      list.appendChild(option);
    });
    addressMatchResults.appendChild(list);
    addressMatchResults.hidden = false;
  };

  const updatePickerLocationFromCoordinates = () => {
    const latitude = document.getElementById("contact-lat").value.trim();
    const longitude = document.getElementById("contact-lng").value.trim();
    if (!latitude && !longitude) {
      if (pickerMarker) {
        pickerMap.removeLayer(pickerMarker);
        pickerMarker = null;
      }
      setLocationStatus("Pin cleared. Choose a location or place it on the map.");
      updatePinUi();
      return;
    }
    if (!latitude || !longitude) {
      setLocationStatus("Enter both latitude and longitude to set the pin.");
      return;
    }
    const lat = Number(latitude);
    const lng = Number(longitude);
    if (
      !Number.isFinite(lat) ||
      !Number.isFinite(lng) ||
      lat < -90 ||
      lat > 90 ||
      lng < -180 ||
      lng > 180
    ) {
      setLocationStatus("Enter valid coordinates before setting the pin.");
      return;
    }
    setPickerLocation(lat, lng);
    setLocationStatus(
      "Pin updated from the entered coordinates. You can move it on the map.",
    );
  };

  const findAddressOnMap = async () => {
    if (!pickerMap) {
      setLocationStatus(
        "The map is still loading. Please try again in a moment.",
      );
      return;
    }
    const street = normalizeStreetName(streetAddressInput.value);
    const city = document.getElementById("contact-city-select").value.trim();
    const state = normalizeLocationState(
      contactCountrySelect.value,
      contactStateInput.value,
    );
    streetAddressInput.value = street;
    contactStateInput.value = state;
    if ((!street && !city) || city === "+ Add New City...") {
      setLocationStatus(
        "Enter a street address or choose a city before looking up its location.",
      );
      return;
    }

    clearAddressMatches();
    const country = contactCountrySelect.value || settings.country;
    const query = [street, city, state, country].filter(Boolean).join(", ");
    const cityQuery = city
      ? [city, state, country].filter(Boolean).join(", ")
      : "";
    btnFindAddress.disabled = true;
    setLocationStatus("Looking up the entered address...");
    try {
      const lookup = async (searchQuery) => {
        const url = new URL("https://nominatim.openstreetmap.org/search");
        url.search = new URLSearchParams({
          q: searchQuery,
          format: "jsonv2",
          addressdetails: "1",
          limit: "5",
        }).toString();
        const response = await fetch(url);
        if (!response.ok) {
          throw new Error(
            `Address lookup failed with status ${response.status}.`,
          );
        }
        return response.json();
      };
      if (!street) {
        const cityResults = await lookup(cityQuery);
        if (cityResults.length > 0) {
          setPickerLocation(cityResults[0].lat, cityResults[0].lon, 13);
          setLocationStatus(
            `An approximate pin was placed near ${city}${state ? `, ${state}` : ""}. Move it to the contact's exact location before saving.`,
          );
          return;
        }
        setLocationStatus(
          `Couldn't locate ${city}${state ? `, ${state}` : ""}. Try a street address or place the pin on the map.`,
        );
        return;
      }

      const addressResults = getUniqueStreetMatches(await lookup(query));
      if (addressResults.length > 1) {
        crossStreetSearch.hidden = true;
        showAddressMatches(addressResults, street);
        setLocationStatus(
          `Found ${addressResults.length} possible matches. Choose the correct street or location to place the pin.`,
        );
        return;
      }
      const streetOnly = street.replace(/^\d+[A-Za-z]?\s*/, "").trim();
      if (addressResults.length === 0 && streetOnly && streetOnly !== street) {
        setLocationStatus(
          "Couldn't match that house number. Searching for streets with a similar name...",
        );
        await new Promise((resolve) => setTimeout(resolve, 1000));
        const streetResults = getUniqueStreetMatches(
          await lookup(
            [streetOnly, city, state, country].filter(Boolean).join(", "),
          ),
        );
        if (streetResults.length > 1) {
          crossStreetSearch.hidden = true;
          showAddressMatches(streetResults, street);
          setLocationStatus(
            `Found ${streetResults.length} possible street matches. Choose the correct one to place an approximate pin.`,
          );
          return;
        }
        if (streetResults.length === 1) {
          selectAddressMatch(streetResults[0], street);
          setLocationStatus(
            `Pin placed near ${streetResults[0].display_name} based on the street name. Check and adjust its position before saving.`,
          );
          return;
        }
      }
      if (addressResults.length === 0 && cityQuery) {
        crossStreetSearch.hidden = false;
        setLocationStatus(
          "Couldn't find the street address. Looking for the city to place an approximate pin...",
        );
        await new Promise((resolve) => setTimeout(resolve, 1000));
        const cityResults = await lookup(cityQuery);
        if (cityResults.length > 0) {
          setPickerLocation(cityResults[0].lat, cityResults[0].lon, 13);
          setLocationStatus(
            `Couldn't find the street address. The map is centered near ${city}${state ? `, ${state}` : ""}. Enter a nearby cross-street below to narrow the pin, or adjust it on the map.`,
          );
          return;
        }
        setLocationStatus(
          `Couldn't find the street address or locate ${city}${state ? `, ${state}` : ""}. Enter a nearby cross-street below to try a more specific search, or place the pin on the map.`,
        );
        return;
      }
      if (addressResults.length === 0) {
        crossStreetSearch.hidden = false;
        setLocationStatus(
          "Couldn't find the street address. Choose a city, enter a nearby cross-street, or place the pin on the map.",
        );
        return;
      }
      crossStreetSearch.hidden = true;
      document.getElementById("contact-cross-street").value = "";
      selectAddressMatch(addressResults[0], street);
    } catch (error) {
      console.error("Unable to find address on map:", error);
      setLocationStatus(
        "Address lookup failed. Check your connection, then try again or place the pin manually.",
      );
    } finally {
      btnFindAddress.disabled = false;
    }
  };

  const findCrossStreetOnMap = async () => {
    if (!pickerMap) {
      setLocationStatus(
        "The map is still loading. Please try again in a moment.",
      );
      return;
    }
    const crossStreet = document
      .getElementById("contact-cross-street")
      .value.trim();
    const city = document.getElementById("contact-city-select").value.trim();
    const state = normalizeLocationState(
      contactCountrySelect.value,
      contactStateInput.value,
    );
    contactStateInput.value = state;
    if (!crossStreet) {
      setLocationStatus("Enter a nearby cross-street or intersection first.");
      return;
    }

    btnFindCrossStreet.disabled = true;
    clearAddressMatches();
    setLocationStatus("Searching near the cross-street...");
    try {
      const url = new URL("https://nominatim.openstreetmap.org/search");
      url.search = new URLSearchParams({
        q: [
          crossStreet,
          city,
          state,
          contactCountrySelect.value || settings.country,
        ]
          .filter(Boolean)
          .join(", "),
        format: "jsonv2",
        limit: "1",
      }).toString();
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(
          `Cross-street lookup failed with status ${response.status}.`,
        );
      }
      const results = await response.json();
      if (results.length === 0) {
        setLocationStatus(
          "Couldn't find that cross-street. Check the names or move the city-centered pin on the map.",
        );
        return;
      }
      setPickerLocation(results[0].lat, results[0].lon, 16);
      setLocationStatus(
        "Pin placed near the cross-street search. Check its position and adjust it if needed.",
      );
    } catch (error) {
      console.error("Unable to find cross-street on map:", error);
      setLocationStatus(
        "Cross-street lookup failed. Check your connection, then try again or adjust the pin on the map.",
      );
    } finally {
      btnFindCrossStreet.disabled = false;
    }
  };

  let initialFormState = "";
  const captureFormState = () => {
    const formEl = document.getElementById("contact-form");
    return JSON.stringify(
      Array.from(formEl.querySelectorAll("input, select, textarea")).map(
        (field) => ({
          id: field.id,
          type: field.type || field.tagName.toLowerCase(),
          value: field.value,
          checked: field.type === "checkbox" || field.type === "radio"
            ? field.checked
            : undefined,
        }),
      ),
    );
  };
  const printContactButton = document.getElementById("btn-print-contact");
  const shareContactButton = document.getElementById("btn-share-contact");
  const exportContactButton = document.getElementById("btn-export-contact");
  const directionsLink = document.getElementById("btn-directions-contact");
  const contactSecondaryActions = document.getElementById(
    "contact-secondary-actions",
  );
  const updatePrintContactAvailability = () => {
    const hasSavedContact = Boolean(
      document.getElementById("contact-id").value,
    );
    const hasUnsavedChanges = captureFormState() !== initialFormState;
    contactSecondaryActions.hidden = !hasSavedContact;
    const savedContact = hasSavedContact ? getSavedContactFromEditor() : null;
    const directionsUrl = savedContact ? getNavigationUrl(savedContact) : "";
    if (directionsUrl) {
      directionsLink.href = directionsUrl;
    } else {
      directionsLink.removeAttribute("href");
    }
    directionsLink.hidden = !directionsUrl;
    [
      [printContactButton, "printing", "Print this contact"],
      [shareContactButton, "sharing", "Share this contact"],
      [exportContactButton, "exporting", "Export this contact"],
    ].forEach(([button, verb, readyTitle]) => {
      button.disabled = !hasSavedContact || hasUnsavedChanges;
      button.title = hasUnsavedChanges
        ? `Save changes before ${verb}`
        : readyTitle;
    });
  };
  contactForm.addEventListener("input", updatePrintContactAvailability);
  contactForm.addEventListener("change", updatePrintContactAvailability);

  const appUpdateDialog = document.getElementById("app-update-dialog");
  const appUpdateStatus = document.getElementById("app-update-status");
  const describeSettingsField = (input) => {
    const label =
      (input.id &&
        document.querySelector(`label[for="${input.id}"]`)?.firstChild
          ?.textContent) ||
      input.closest("label")?.firstChild?.textContent ||
      input.getAttribute("aria-label") ||
      input.placeholder ||
      input.id;
    return String(label).replace(/:\s*$/, "").trim();
  };
  const findPendingSettingsEdit = () => {
    const inputs = Array.from(
      document.querySelectorAll("#settings-view input"),
    ).filter(
      (input) =>
        !["checkbox", "radio", "hidden", "button", "submit"].includes(
          input.type,
        ) &&
        !input.closest("[hidden]"),
    );
    for (const input of inputs) {
      let changed;
      if (input.id === "setting-state") {
        changed =
          normalizeLocationState(settings.country, input.value) !==
          settings.state;
      } else if (input.id === "setting-default-city") {
        changed = toTitleCase(input.value) !== settings.defaultCity;
      } else if (input.closest("#me-form")) {
        changed =
          input.value.trim() !==
          (settings.me?.[input.id.replace("me-", "")] || "");
      } else if (input.type === "file") {
        changed = input.files.length > 0;
      } else if (input.id === "setting-new-city") {
        const name = toTitleCase(input.value).toLowerCase();
        changed =
          input.value.trim() !== "" &&
          !settings.cities.some((city) => city.toLowerCase() === name);
      } else if (input.id === "setting-new-region") {
        const city = document.getElementById("setting-region-city").value;
        const name = toTitleCase(input.value).toLowerCase();
        changed =
          input.value.trim() !== "" &&
          !(
            city &&
            settings.regions.some(
              (region) =>
                region.city === city && region.name.toLowerCase() === name,
            )
          );
      } else if (input.id === "setting-new-area") {
        const city = document.getElementById("setting-area-city").value;
        const name = toTitleCase(input.value).toLowerCase();
        changed =
          input.value.trim() !== "" &&
          !(
            city &&
            settings.areas.some(
              (area) =>
                area.city === city && area.name.toLowerCase() === name,
            )
          );
      } else {
        changed = input.value.trim() !== "";
      }
      if (changed) {
        return {
          input,
          field: describeSettingsField(input),
          section:
            input.closest("details")?.querySelector("summary")?.textContent.trim() ||
            "Settings",
        };
      }
    }
    return null;
  };
  const revealSettingsEdit = (pending) => {
    if (!pending || currentViewId !== "settings-view") return;
    const section = pending.input.closest("details");
    if (section) section.open = true;
    pending.input.scrollIntoView({ block: "center" });
    pending.input.focus();
  };
  const discardSettingsEdits = () => {
    document.querySelectorAll("#settings-view input").forEach((input) => {
      if (["checkbox", "radio", "hidden", "button", "submit"].includes(input.type)) return;
      input.value = "";
      if (input.type === "file") input.dispatchEvent(new Event("change"));
    });
    populateMeForm();
    settingStateInput.value = settings.state;
    settingDefaultCityInput.value = settings.defaultCity;
  };
  confirmLeaveSettings = () => {
    const pending = findPendingSettingsEdit();
    if (!pending) return true;
    const pendingDescription =
      pending.input.type === "file"
        ? "A backup file is selected but has not been restored."
        : `"${pending.field}" in ${pending.section} has not been saved.`;
    if (
      confirm(
        `Discard unsaved changes?\n\n${pendingDescription}\n\nChoose OK to discard, or Cancel to go back and finish it.`,
      )
    ) {
      discardSettingsEdits();
      return true;
    }
    revealSettingsEdit(pending);
    return false;
  };
  revealAppRefreshBlock = () => revealSettingsEdit(findPendingSettingsEdit());
  getAppRefreshBlockMessage = () => {
    const contactEditorOpen = getComputedStyle(modal).display !== "none";
    const pending = findPendingSettingsEdit();
    if (contactEditorOpen) {
      return "Save or exit the open contact before refreshing the app. Your saved contacts will remain on this device.";
    }
    if (pending) {
      return `Before refreshing, finish or clear "${pending.field}" in Settings → ${pending.section}. It has changes that are not saved.`;
    }
    return "";
  };
  const showAppUpdatePrompt = () => {
    if (!appUpdateAvailable) return;
    renderBottomNav();
    document.getElementById("app-update-notice").hidden = false;
    document.getElementById("btn-check-updates").textContent = "Update Now";
    if (getAppRefreshBlockMessage()) {
      if (currentViewId === "settings-view") {
        appUpdateStatus.textContent =
          "An app update is ready. Save or finish your edits before refreshing.";
      }
      return;
    }
    appUpdateStatus.textContent = "";
    if (appUpdatePromptDismissed) return;
    if (appUpdatePromptTimer !== null) {
      window.clearTimeout(appUpdatePromptTimer);
    }
    appUpdatePromptTimer = window.setTimeout(() => {
      appUpdatePromptTimer = null;
      if (
        appUpdateAvailable &&
        !appUpdatePromptDismissed &&
        !appUpdateDialog.open &&
        !getAppRefreshBlockMessage() &&
        !document.querySelector("dialog[open]")
      ) {
        appUpdateDialog.showModal();
      }
    }, 750);
  };
  appUpdatePromptHandler = showAppUpdatePrompt;

  document
    .getElementById("btn-ok-no-update")
    .addEventListener("click", () =>
      document.getElementById("app-no-update-dialog").close(),
    );

  document
    .getElementById("btn-check-updates")
    .addEventListener("click", async (event) => {
      const button = event.currentTarget;
      const status = appUpdateStatus;
      if (!navigator.onLine) {
        status.textContent =
          "Connect to the internet before checking for app updates.";
        return;
      }
      const blockMessage = getAppRefreshBlockMessage();
      if (blockMessage) {
        status.textContent = blockMessage;
        revealAppRefreshBlock();
        return;
      }
      if (!("serviceWorker" in navigator)) {
        status.textContent =
          "This browser does not support app updates. Open the website in a supported browser while online.";
        return;
      }

      button.disabled = true;
      status.textContent = "Checking for updates...";
      try {
        const registration = await navigator.serviceWorker.getRegistration();
        if (!registration) {
          throw new Error("The app's update service is not registered.");
        }
        await registration.update();
        const incoming = registration.installing || registration.waiting;
        if (!incoming && !appUpdateAvailable) {
          status.textContent = "You have the latest version.";
          button.disabled = false;
          document.getElementById("app-no-update-dialog").showModal();
          return;
        }
        if (incoming && incoming.state !== "activated") {
          await new Promise((resolve) => {
            const timer = window.setTimeout(resolve, 15000);
            incoming.addEventListener("statechange", () => {
              if (incoming.state === "activated") {
                window.clearTimeout(timer);
                resolve();
              }
            });
          });
        }
        status.textContent =
          "Update check complete. Refreshing the app now; saved contacts are kept on this device.";
        try {
          localStorage.removeItem(APP_UPDATE_PENDING_KEY);
        } catch (error) {
          console.error("Unable to clear the pending app update status:", error);
        }
        reloadAfterUpdate();
      } catch (error) {
        console.error("Unable to check for app updates:", error);
        status.textContent =
          "Could not check for updates. Confirm you are online and try again.";
        button.disabled = false;
      }
    });

  new MutationObserver(updateHeaderTitle).observe(modal, {
    attributes: true,
    attributeFilter: ["style"],
  });

  const attemptExit = () => {
    const currentState = captureFormState();
    if (currentState !== initialFormState) {
      const confirmExit = confirm("Changes were made, exit without saving?");
      if (confirmExit) {
        modal.style.display = "none";
      }
    } else {
      modal.style.display = "none";
    }
  };

  const contactInfoSection = document.getElementById("contact-info-section");
  const contactVisitsSection = document.getElementById(
    "contact-visits-section",
  );
  contactInfoSection.addEventListener("toggle", () => {
    if (contactInfoSection.open && pickerMap) {
      setTimeout(() => pickerMap.invalidateSize(), 50);
    }
  });
  // A required field inside a closed section cannot be focused, so open it.
  contactForm.addEventListener(
    "invalid",
    () => {
      contactInfoSection.open = true;
    },
    true,
  );

  const openModalWithCoords = (lat, lng, view = "info") => {
    contactModalBody.scrollTop = 0;
    // The map is created while Contact Info is open so it gets its size.
    contactInfoSection.open = true;
    contactVisitsSection.open = false;
    modal.style.display = "flex";
    // The map must be visible while it is created or resized.
    pinPanelOpen = true;
    updatePinUi();

    return new Promise((resolve) => {
      setTimeout(() => {
        contactModalBody.scrollTop = 0;
        if (!pickerMap) {
          pickerMap = L.map("modal-picker-map").setView(
            lat !== null && lng !== null ? [lat, lng] : defaultMapCenter,
            15,
          );
          L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
            maxZoom: 19,
            attribution: "&copy; OpenStreetMap",
          }).addTo(pickerMap);

          pickerMap.on("click", (e) =>
            setPickerLocation(e.latlng.lat, e.latlng.lng),
          );
        } else {
          pickerMap.invalidateSize();
          pickerMap.setView(
            lat !== null && lng !== null ? [lat, lng] : defaultMapCenter,
            15,
          );
        }

        setTimeout(() => {
          if (pickerMap) pickerMap.invalidateSize();
        }, 100);

        if (lat !== null && lng !== null) {
          setPickerLocation(lat, lng, 15);
        } else if (pickerMarker) {
          pickerMap.removeLayer(pickerMarker);
          pickerMarker = null;
        }
        contactModalBody.scrollTop = 0;
        initialFormState = captureFormState();
        updatePrintContactAvailability();
        // An existing pin starts collapsed; no pin keeps the tools open.
        pinPanelOpen = !(lat !== null && lng !== null);
        updatePinUi();
        contactInfoSection.open = view !== "visits";
        contactVisitsSection.open = view === "visits";
        resolve();
      }, 150);
    });
  };

  btnOpenModal.addEventListener("click", async () => {
    contactForm.reset();
    lastCommittedContactCity = "";
    pendingContactCitySave = Promise.resolve(true);
    setLocationStatus("");
    clearAddressMatches();
    crossStreetSearch.hidden = true;
    document.getElementById("contact-cross-street").value = "";
    document.getElementById("contact-id").value = "";
    document.getElementById("contact-record-id").hidden = true;
    contactSecondaryActions.hidden = true;
    [printContactButton, shareContactButton, exportContactButton].forEach(
      (button) => {
        button.disabled = true;
      },
    );
    contactCountrySelect.value = settings.me?.country || settings.country;
    contactCountrySelect.dataset.selectedCountry = contactCountrySelect.value;
    contactStateInput.value = "";
    citySelect.value = "";
    lastCommittedContactCity = "";
    updateContactLocationFields();
    dropdownHelpers.populateContactRegionArea("", "");
    document.getElementById("contact-lat").value = "";
    document.getElementById("contact-lng").value = "";
    document.getElementById("new-log-timestamp").value = toLocalDateTimeString(
      new Date(),
    );
    delete document.getElementById("new-log-timestamp").dataset.touched;
    document.getElementById("modal-notes-history-container").innerHTML =
      '<span style="color: #888;">No visit logs yet.</span>';
    document.getElementById("modal-title").textContent = "Add Contact";
    await openModalWithCoords(null, null);
  });

  btnFindAddress.addEventListener("click", findAddressOnMap);

  document.getElementById("btn-confirm-pin").addEventListener("click", () => {
    clearAddressMatches();
    crossStreetSearch.hidden = true;
    setLocationStatus("");
    setPinPanel(false);
  });
  document
    .getElementById("btn-adjust-pin")
    .addEventListener("click", () => setPinPanel(true));
  const reopenPinForAddressChange = () => {
    if (pinPanelOpen || !document.getElementById("contact-lat").value.trim())
      return;
    setPinPanel(true);
    setLocationStatus(
      "The address changed. Look up the pin again, or confirm the current pin.",
    );
  };
  ["contact-address", "contact-city-select", "contact-state"].forEach((id) =>
    document
      .getElementById(id)
      .addEventListener("change", reopenPinForAddressChange),
  );
  btnFindCrossStreet.addEventListener("click", findCrossStreetOnMap);

  document
    .getElementById("contact-lat")
    .addEventListener("change", updatePickerLocationFromCoordinates);
  document
    .getElementById("contact-lng")
    .addEventListener("change", updatePickerLocationFromCoordinates);

  closeModal.addEventListener("click", attemptExit);
  document
    .getElementById("btn-add-another-contact")
    .addEventListener("click", () => {
      if (
        captureFormState() !== initialFormState &&
        !confirm("Changes were made, discard them and add a new contact?")
      ) {
        return;
      }
      btnOpenModal.click();
    });

  document.getElementById("btn-gps").addEventListener("click", () => {
    if (!pickerMap) {
      setLocationStatus(
        "The map is still loading. Please try again in a moment.",
      );
      return;
    }
    if (!navigator.geolocation) {
      setLocationStatus("Device location is not supported by this browser.");
      return;
    }
    const gpsButton = document.getElementById("btn-gps");
    gpsButton.disabled = true;
    setLocationStatus("Getting a fresh device location...");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        try {
          setPickerLocation(
            position.coords.latitude,
            position.coords.longitude,
          );
          const accuracy = Math.round(position.coords.accuracy);
          setLocationStatus(
            Number.isFinite(accuracy)
              ? `Pin placed from device location (estimated accuracy: ${accuracy} m). You can move it on the map.`
              : "Pin placed from device location. You can move it on the map.",
          );
        } catch (error) {
          console.error("Invalid device location coordinates:", error);
          setLocationStatus(
            "The device returned invalid coordinates. Try the address lookup or place the pin manually.",
          );
        } finally {
          gpsButton.disabled = false;
        }
      },
      (error) => {
        console.error("Unable to get device location:", error);
        setLocationStatus(
          error.code === error.PERMISSION_DENIED
            ? "Location permission was denied. Allow location access or set the pin from the address or map."
            : "Could not get a device location. Check location services or set the pin from the address or map.",
        );
        gpsButton.disabled = false;
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 },
    );
  });

  // Save Contact Handler
  contactForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!(await pendingContactCitySave)) return;
    if (!(await commitContactCity())) return;
    const id = document.getElementById("contact-id").value;
    const firstName = document.getElementById("contact-firstname").value.trim();
    const lastName = document.getElementById("contact-lastname").value.trim();
    const email = document.getElementById("contact-email").value.trim();
    const phone = phoneInput.value.trim();
    const street = normalizeStreetName(streetAddressInput.value);
    const city = document.getElementById("contact-city-select").value.trim();
    const region = contactRegionSelect.value;
    const area = contactAreaSelect.value;
    const country = normalizeCountry(contactCountrySelect.value);
    const state = normalizeLocationState(country, contactStateInput.value);
    if (!country) {
      alert("Choose a country before saving this contact.");
      contactCountrySelect.focus();
      return;
    }
    streetAddressInput.value = street;
    contactStateInput.value = state;
    const lat = document.getElementById("contact-lat").value.trim();
    const lng = document.getElementById("contact-lng").value.trim();
    const latitude = Number(lat);
    const longitude = Number(lng);
    if (email && !/^[^\s@]+@[^\s@]+$/.test(email)) {
      alert("Enter an email address in the format name@example.com.");
      document.getElementById("contact-email").focus();
      return;
    }
    if (phone && !/^\(\d{3}\) \d{3}-\d{4}$/.test(phone)) {
      alert("Enter a 10-digit phone number in the format (555) 123-4567.");
      phoneInput.focus();
      return;
    }
    if (city === "+ Add New City...") {
      alert("Enter a city name, choose a saved city, or leave City blank.");
      return;
    }
    if (
      (region &&
        !settings.regions.some(
          (item) => item.name === region && item.city === city,
        )) ||
      (area &&
        !settings.areas.some(
          (item) => item.name === area && item.city === city,
        ))
    ) {
      alert("Choose a region and area that belong to the selected city.");
      return;
    }
    if (
      (lat || lng) &&
      (!Number.isFinite(latitude) ||
        !Number.isFinite(longitude) ||
        latitude < -90 ||
        latitude > 90 ||
        longitude < -180 ||
        longitude > 180)
    ) {
      alert(
        "Enter valid latitude and longitude coordinates, or clear both fields.",
      );
      return;
    }

    const newNoteText = document.getElementById("contact-notes").value.trim();
    const newNoteTimestampVal =
      document.getElementById("new-log-timestamp").value;
    // A changed visit date is kept even when no note text was typed.
    const logVisit =
      Boolean(newNoteText) ||
      document.getElementById("new-log-timestamp").dataset.touched === "1";

    const fullAddress = [street, city, state, country]
      .filter(Boolean)
      .join(", ");

    let targetId = id;

    if (id) {
      const contact = contacts.find((c) => c.id == id);
      if (contact) {
        contact.firstName = firstName;
        contact.lastName = lastName;
        contact.email = email;
        contact.phone = phone;
        contact.address = fullAddress;
        contact.streetAddress = street;
        contact.country = country;
        contact.city = city;
        contact.state = state;
        contact.region = region;
        contact.area = area;
        contact.lat = lat;
        contact.lng = lng;

        if (logVisit) {
          if (!contact.notesHistory) contact.notesHistory = [];
          const logDate = newNoteTimestampVal
            ? new Date(newNoteTimestampVal)
            : new Date();
          contact.notesHistory.push({
            id: "log_" + Date.now(),
            rawDate: logDate.toISOString(),
            date: logDate.toLocaleString(),
            text: newNoteText,
          });
        }
      }
    } else {
      const logDate = newNoteTimestampVal
        ? new Date(newNoteTimestampVal)
        : new Date();
      const notesHistory = logVisit
        ? [
            {
              id: "log_" + Date.now(),
              rawDate: logDate.toISOString(),
              date: logDate.toLocaleString(),
              text: newNoteText,
            },
          ]
        : [];

      targetId = Date.now();
      while (
        contacts.some((contact) => String(contact.id) === String(targetId))
      ) {
        targetId += 1;
      }
      const newContact = {
        id: targetId,
        createdAt: new Date().toISOString(),
        firstName,
        lastName,
        email,
        phone,
        address: fullAddress,
        streetAddress: street,
        country,
        city,
        region,
        state,
        area,
        lat,
        lng,
        notesHistory,
      };
      contacts.push(newContact);
      document.getElementById("contact-id").value = targetId;
    }

    if (!(await saveContacts())) return;

    document.getElementById("contact-notes").value = "";
    document.getElementById("new-log-timestamp").value = toLocalDateTimeString(
      new Date(),
    );
    delete document.getElementById("new-log-timestamp").dataset.touched;
    initialFormState = captureFormState();

    editContact(targetId, contactVisitsSection.open ? "visits" : "info");
    // Re-baseline right after the form is repopulated so a quick close is not seen as unsaved.
    initialFormState = captureFormState();
    alert("Contact saved successfully!");
    initialFormState = captureFormState();
  });

  document
    .getElementById("new-log-timestamp")
    .addEventListener("change", (event) => {
      event.target.dataset.touched = "1";
    });

  // Render Contacts List
  // Render Contacts List
  const updateCopyNotice = () => {
    const notice = document.getElementById("copy-notice");
    const isInstalled = isInstalledApp();
    let kind = "";
    if (isInstalled && !contacts.length) kind = "empty-installed";
    else if (!isInstalled && contacts.length) kind = "browser-copy";

    try {
      if (kind && localStorage.getItem(`return_visits_copy_notice_${kind}`)) {
        kind = "";
      }
    } catch (error) {
      console.error("Unable to read the copy notice status:", error);
    }
    notice.dataset.kind = kind;
    notice.hidden = !kind;
    if (!kind) return;
    document.getElementById("copy-notice-link").href =
      kind === "empty-installed"
        ? "./help.html#backup"
        : "./help.html#install-guide";
    document.getElementById("copy-notice-text").textContent =
      kind === "empty-installed"
        ? "This installed copy is empty. If you already added contacts in your browser, open the app in that browser, go to Settings → Backup or Restore and back up, then restore here. Or connect Dropbox in both copies."
        : "Tip: for the best experience, add this app to your Home Screen or install it and use only that icon. Browser and installed copies keep separate contacts, so using one keeps all your data in one place.";
  };
  document
    .getElementById("btn-copy-notice-dismiss")
    .addEventListener("click", () => {
      const notice = document.getElementById("copy-notice");
      try {
        localStorage.setItem(
          `return_visits_copy_notice_${notice.dataset.kind}`,
          "1",
        );
      } catch (error) {
        console.error("Unable to save the copy notice status:", error);
      }
      notice.hidden = true;
    });

  const renderContacts = () => {
    updateCopyNotice();
    const listContainer = document.getElementById("contacts-list");
    const searchTerm = document
      .getElementById("search-input")
      .value.toLowerCase();
    const filterUrgency = document.getElementById("filter-urgency").value;
    const filterCity = document.getElementById("filter-city").value;
    const filterRegion = document.getElementById("filter-region").value;
    const filterArea = document.getElementById("filter-area").value;
    const sortMode = document.getElementById("sort-select").value;

    let filtered = contacts.filter((c) => {
      const fullName = `${c.firstName} ${c.lastName}`.toLowerCase();
      const addr = (c.address || "").toLowerCase();
      const areasMatch = getContactAreas(c).some((area) =>
        area.toLowerCase().includes(searchTerm),
      );
      const notesMatch =
        c.notesHistory &&
        c.notesHistory.some((n) => n.text.toLowerCase().includes(searchTerm));
      const textMatch =
        fullName.includes(searchTerm) ||
        (c.email || "").toLowerCase().includes(searchTerm) ||
        (c.phone || "").includes(searchTerm) ||
        addr.includes(searchTerm) ||
        areasMatch ||
        notesMatch;

      const status = getContactStatus(c);
      const urgencyMatch = !filterUrgency || status.label === filterUrgency;
      const cityMatch = !filterCity || c.city === filterCity;
      const regionMatch = !filterRegion || c.region === filterRegion;
      const areaMatch = !filterArea || c.area === filterArea;
      return (
        textMatch &&
        urgencyMatch &&
        cityMatch &&
        regionMatch &&
        areaMatch
      );
    });

    filtered.sort((a, b) => {
      if (sortMode === "chronological-asc")
        return new Date(a.createdAt) - new Date(b.createdAt);
      if (sortMode === "chronological-desc")
        return new Date(b.createdAt) - new Date(a.createdAt);
      if (sortMode === "alphabetical")
        return a.firstName.localeCompare(b.firstName);
    });

    listContainer.innerHTML = "";
    if (filtered.length === 0) {
      visibleContacts = [];
      updatePrintVisibleButton();
      listContainer.innerHTML = "<p>No matching contacts found.</p>";
      if (map) renderMapMarkers();
      return;
    }

    visibleContacts = [...filtered];
    updatePrintVisibleButton();
    if (map) renderMapMarkers();
    filtered.forEach((contact, cardIndex) => {
      const card = document.createElement("div");
      const status = getContactStatus(contact);
      const navigationUrl = getNavigationUrl(contact);
      let urgencyClass = "contact-card";
      if (status.class === "urgent") urgencyClass += " urgent";
      if (status.class === "immediate") urgencyClass += " immediate";
      card.className = urgencyClass;

      const sortedNotes = [...(contact.notesHistory || [])].sort(
        (a, b) =>
          new Date(b.rawDate || b.date) - new Date(a.rawDate || a.date),
      );
      const lastNote = sortedNotes[0];
      const lastVisitDate = lastNote
        ? new Date(lastNote.rawDate || lastNote.date)
        : null;
      const lastVisitHtml =
        lastVisitDate && !Number.isNaN(lastVisitDate.getTime())
          ? `<br><small>Last visit: ${escapeHtml(lastVisitDate.toLocaleDateString())} • ${sortedNotes.length} visit note${sortedNotes.length === 1 ? "" : "s"}</small>`
          : '<br><small style="color: #888;">No visit notes yet</small>';
      const lastNoteText = lastNote && (lastNote.text || "").trim();
      const lastNoteHtml = lastNoteText
        ? `<br><small class="card-last-note">${escapeHtml(lastNoteText.length > 140 ? lastNoteText.slice(0, 140) + "…" : lastNoteText)}</small>`
        : "";
      const contactFullName = `${contact.firstName} ${contact.lastName}`.toLowerCase();
      const matchedOnlyInNotes =
        searchTerm &&
        !contactFullName.includes(searchTerm) &&
        !(contact.email || "").toLowerCase().includes(searchTerm) &&
        !(contact.phone || "").includes(searchTerm) &&
        !(contact.address || "").toLowerCase().includes(searchTerm) &&
        !getContactAreas(contact).some((area) =>
          area.toLowerCase().includes(searchTerm),
        );
      const noteMatchHtml = matchedOnlyInNotes
        ? '<br><small style="color: #004080; font-weight: bold;">Matches a visit note</small>'
        : "";

      card.innerHTML = `
                <strong><span class="contact-number" title="Matches the number on the map pin">${cardIndex + 1}.</span> ${escapeHtml(contact.firstName)} ${escapeHtml(contact.lastName)}</strong><br>
                <small class="contact-record-id">Contact ID: ${escapeHtml(contact.id)}</small><br>
                <small>${escapeHtml(getFormattedContactAddress(contact) || "No address provided")} (${escapeHtml(getContactLocationSummary(contact))})</small><br>
                ${contact.phone ? `<small>Phone: ${escapeHtml(contact.phone)}</small><br>` : ""}
                ${contact.email ? `<small>Email: ${escapeHtml(contact.email)}</small><br>` : ""}
                <span>Days Since Last Contact: <strong>${status.days} days</strong> (${status.label})</span>
                ${lastVisitHtml}
                ${lastNoteHtml}
                ${noteMatchHtml}
                <div class="card-actions">
                    <button class="btn-icon" onclick="addQuickVisit(${contact.id})" title="Add a visit" aria-label="Add a visit"><span class="btn-add-visit">ADD<br>VISIT</span></button>
                    <button class="btn-icon" onclick="editContact(${contact.id})" title="Edit Details">✏️</button>
                    ${navigationUrl ? `<a class="btn-icon navigate-contact" href="${escapeHtml(navigationUrl)}" target="_blank" rel="noopener noreferrer" aria-label="Navigate to ${escapeHtml(contact.firstName)} ${escapeHtml(contact.lastName)}" title="Navigate to ${escapeHtml(contact.firstName)} ${escapeHtml(contact.lastName)}"><svg aria-hidden="true" focusable="false" viewBox="0 0 24 24"><circle cx="6" cy="19" r="2" fill="currentColor"/><path d="M6 16V9a4 4 0 0 1 4-4h8m-4-4 4 4-4 4" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"/></svg></a>` : ""}
                    <button class="btn-icon delete" onclick="deleteContact(${contact.id})" title="Delete Contact">🗑️</button>
                </div>
            `;
      listContainer.appendChild(card);
    });
  };

  const getSortedVisitNotes = (contact) =>
    [...(contact.notesHistory || [])].sort((a, b) => {
      const dateA = new Date(a.rawDate || a.date || 0).getTime();
      const dateB = new Date(b.rawDate || b.date || 0).getTime();
      return (Number.isFinite(dateB) ? dateB : 0) -
        (Number.isFinite(dateA) ? dateA : 0);
    });

  const getPrintableNoteDate = (note) => {
    const parsedDate = new Date(note.rawDate || note.date || "");
    return Number.isNaN(parsedDate.getTime())
      ? note.date || "Date not recorded"
      : parsedDate.toLocaleString();
  };

  const getPrintGroup = (contact) => {
    if (contact.area || contact.region) {
      return {
        key: JSON.stringify([
          "location",
          contact.city,
          contact.region,
          contact.area,
        ]),
        title:
          [contact.city, contact.region, contact.area]
            .filter(Boolean)
            .join(" → ") + (contact.area ? "" : " (No area assigned)"),
      };
    }
    if (contact.city) {
      return {
        key: JSON.stringify(["city", contact.city]),
        title: `${contact.city} (No region or area assigned)`,
      };
    }
    return {
      key: JSON.stringify(["unassigned"]),
      title: "No location assigned",
    };
  };

  const printContactEntry = (contact) => {
    const latestNote = getSortedVisitNotes(contact)[0];
    const streetAddress =
      normalizeStreetName(getStreetAddress(contact)) ||
      "No street address recorded";
    const fullName = `${contact.firstName} ${contact.lastName}`.trim();
    return `
      <article class="print-contact-entry">
        <h3>${escapeHtml(fullName)}</h3>
        <p class="print-contact-id">Contact ID: ${escapeHtml(contact.id)}</p>
        <p class="print-contact-address">${escapeHtml(streetAddress)}</p>
        ${contact.phone ? `<p>Phone: ${escapeHtml(contact.phone)}</p>` : ""}
        ${contact.email ? `<p>Email: ${escapeHtml(contact.email)}</p>` : ""}
        <div class="print-latest-note">
          <strong>Most recent note:</strong>
          ${
            latestNote
              ? `<p class="print-note-date">${escapeHtml(getPrintableNoteDate(latestNote))}</p><p class="print-note">${escapeHtml(latestNote.text)}</p>`
              : '<p class="print-note">No visit notes recorded.</p>'
          }
        </div>
      </article>
    `;
  };

  const printContainer = document.getElementById("print-container");
  const printContent = (title, subtitle, content) => {
    printContainer.innerHTML = `
      <header class="print-header">
        <h1>${escapeHtml(title)}</h1>
        <p class="print-subtitle">${escapeHtml(subtitle)}</p>
      </header>
      ${content}
    `;
    printContainer.hidden = false;
    printContainer.setAttribute("aria-hidden", "false");
    try {
      window.print();
    } catch (error) {
      printContainer.hidden = true;
      printContainer.setAttribute("aria-hidden", "true");
      console.error("Unable to open the print dialog:", error);
      alert("Could not open the print dialog. Please try again.");
    }
  };

  window.addEventListener("afterprint", () => {
    printContainer.hidden = true;
    printContainer.setAttribute("aria-hidden", "true");
    printContainer.replaceChildren();
  });

  const printSettings = () => {
    const rows = settings.cities
      .map((city) => {
        const regions = settings.regions
          .filter((r) => r.city === city)
          .map((r) => escapeHtml(r.name))
          .join(", ");
        const areas = settings.areas
          .filter((a) => a.city === city)
          .map((a) => escapeHtml(a.name))
          .join(", ");
        return `<h3>${escapeHtml(city)}</h3><ul>${
          regions ? `<li>Regions: ${regions}</li>` : ""
        }${areas ? `<li>Areas: ${areas}</li>` : ""}</ul>`;
      })
      .join("");
    printContent(
      "Settings",
      new Date().toLocaleDateString(),
      `<section class="print-location-group">
        <p>Default country: ${escapeHtml(settings.country || "Not set")}</p>
        <p>Default state / province: ${escapeHtml(settings.state || "Not set")}</p>
        <p>Default city: ${escapeHtml(settings.defaultCity || "Not set")}</p>
        ${
          settings.me && (settings.me.name || settings.me.street || settings.me.city)
            ? `<p>Your details: ${escapeHtml(
                [settings.me.name, settings.me.street, settings.me.city, settings.me.state, settings.me.country]
                  .filter(Boolean)
                  .join(", "),
              )}</p>`
            : ""
        }
        <p>Passphrase: ${encryptionKey ? "On" : "Off"}</p>
        <h2>Cities, regions and areas</h2>
        ${rows || "<p>None.</p>"}
      </section>`,
    );
  };

  const printVisibleContacts = () => {
      if (!visibleContacts.length) return;
      const count = visibleContacts.length;
      if (
        !confirm(
          `Print ${count} visible contact${count === 1 ? "" : "s"}? The printout will include only the most recent note for each contact.`,
        )
      ) {
        return;
      }

      const groups = new Map();
      visibleContacts.forEach((contact) => {
        const group = getPrintGroup(contact);
        if (!groups.has(group.key)) {
          groups.set(group.key, { title: group.title, contacts: [] });
        }
        groups.get(group.key).contacts.push(contact);
      });
      const content = [...groups.values()]
        .sort((a, b) => a.title.localeCompare(b.title))
        .map(
          (group) => `
            <section class="print-location-group">
              <h2>${escapeHtml(group.title)}</h2>
              ${group.contacts
                .sort((a, b) => {
                  const nameA = `${a.lastName} ${a.firstName}`.trim();
                  const nameB = `${b.lastName} ${b.firstName}`.trim();
                  return (
                    nameA.localeCompare(nameB) ||
                    String(a.id).localeCompare(String(b.id))
                  );
                })
                .map(printContactEntry)
                .join("")}
            </section>
          `,
        )
        .join("");
      printContent(
        "Visible Contacts",
        `${count} contact${count === 1 ? "" : "s"} • most recent note per contact • ${new Date().toLocaleDateString()}`,
        content,
      );
    };

  // Prints the same numbered list the map pins use, then any contacts
  // that have no pin.
  const printMapList = (detail) => {
    const precisePins = visibleContacts.filter(hasContactCoordinates);
    const approximateCityPins = new Map();
    visibleContacts.forEach((contact) => {
      if (hasContactCoordinates(contact) || !contact.city) return;
      const query = getCityPinQuery(contact);
      if (!cityPinCoordinates.get(query)) return;
      if (!approximateCityPins.has(query)) {
        approximateCityPins.set(query, {
          city: contact.city,
          state: normalizeLocationState(
            contact.country || settings.country,
            contact.state || settings.state,
          ),
          country: contact.country || settings.country,
          contacts: [],
        });
      }
      approximateCityPins.get(query).contacts.push(contact);
    });
    const approximateContacts = new Set(
      [...approximateCityPins.values()].flatMap((group) => group.contacts),
    );
    const unpinned = visibleContacts.filter(
      (contact) =>
        !hasContactCoordinates(contact) && !approximateContacts.has(contact),
    );
    const entry = (contact, number, approximateCity = "") => {
      const name = `${contact.firstName} ${contact.lastName}`.trim();
      const address =
        normalizeStreetName(getStreetAddress(contact)) ||
        (approximateCity
          ? `Approximate city location: ${approximateCity}`
          : "") ||
        "No street address recorded";
      const latestNote = getSortedVisitNotes(contact)[0];
      return `
        <article class="print-contact-entry">
          <h3>${number ? `${number}. ` : ""}${escapeHtml(name)}</h3>
          <p class="print-contact-address">${escapeHtml(address)}</p>
          ${
            detail === "details"
              ? `${contact.phone ? `<p>Phone: ${escapeHtml(contact.phone)}</p>` : ""}
                 ${contact.email ? `<p>Email: ${escapeHtml(contact.email)}</p>` : ""}
                 <p>Location: ${escapeHtml(getContactLocationSummary(contact))}</p>
                 <p>${latestNote ? `Last visit ${escapeHtml(getPrintableNoteDate(latestNote))}: ${escapeHtml(latestNote.text)}` : "No visit notes recorded."}</p>`
              : ""
          }
        </article>`;
    };
    let nextCityPinNumber = precisePins.length + 1;
    const cityPinContent = [...approximateCityPins.values()]
      .map((group) => {
        const number = nextCityPinNumber++;
        const cityLabel = [group.city, group.state, group.country]
          .filter(Boolean)
          .join(", ");
        return group.contacts
        .map((contact) => entry(contact, number, cityLabel))
        .join("");
      })
      .join("");
    const pinCount = precisePins.length + approximateCityPins.size;
    const content = `
      <section class="print-location-group">
        <h2>Map pins</h2>
        ${precisePins.map((contact, index) => entry(contact, index + 1)).join("")}
        ${cityPinContent}
        ${pinCount ? "" : "<p>No pins.</p>"}
      </section>
      ${
        unpinned.length
          ? `<section class="print-location-group"><h2>No map pin</h2>${unpinned.map((c) => entry(c, 0)).join("")}</section>`
          : ""
      }`;
    printContent(
      "Map Contacts",
      `${pinCount} map location${pinCount === 1 ? "" : "s"} • ${new Date().toLocaleDateString()}`,
      content,
    );
  };

  const mapPrintDialog = document.getElementById("map-print-dialog");
  const requestMapPrint = () => {
    if (!visibleContacts.length) {
      alert("There are no contacts to print.");
      return;
    }
    mapPrintDialog.showModal();
  };
  document.getElementById("map-print-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const detail = new FormData(e.target).get("map-print-detail");
    mapPrintDialog.close();
    printMapList(detail);
  });
  document
    .getElementById("cancel-map-print")
    .addEventListener("click", () => mapPrintDialog.close());

  const contactPrintDialog = document.getElementById("contact-print-dialog");
  const contactPrintForm = document.getElementById("contact-print-form");
  const printContactDescription = document.getElementById(
    "contact-print-description",
  );
  let selectedContactToPrint = null;

  const getSavedContactFromEditor = () => {
    const contactId = document.getElementById("contact-id").value;
    return contacts.find((contact) => String(contact.id) === String(contactId));
  };

  shareContactButton.addEventListener("click", () => {
    if (shareContactButton.disabled) return;
    const contact = getSavedContactFromEditor();
    if (!contact) {
      alert("Save this contact before sharing.");
      return;
    }
    openContactShareDialog(contact);
  });

  exportContactButton.addEventListener("click", () => {
    if (exportContactButton.disabled) return;
    const contact = getSavedContactFromEditor();
    if (!contact) {
      alert("Save this contact before exporting.");
      return;
    }
    exportContact(contact);
  });

  printContactButton.addEventListener("click", () => {
    if (printContactButton.disabled) return;
    const contactId = document.getElementById("contact-id").value;
    selectedContactToPrint = contacts.find(
      (contact) => String(contact.id) === String(contactId),
    );
    if (!selectedContactToPrint) {
      alert("Save this contact before printing.");
      return;
    }
    const fullName =
      `${selectedContactToPrint.firstName} ${selectedContactToPrint.lastName}`.trim();
    printContactDescription.textContent = `Choose which visit notes to print for ${fullName} (ID ${selectedContactToPrint.id}).`;
    contactPrintForm.elements.namedItem("print-notes").value = "latest";
    contactPrintDialog.showModal();
  });

  document
    .getElementById("cancel-contact-print")
    .addEventListener("click", () => {
      contactPrintDialog.close();
      selectedContactToPrint = null;
    });

  contactPrintDialog.addEventListener("cancel", () => {
    selectedContactToPrint = null;
  });

  contactPrintForm.addEventListener("submit", (event) => {
    event.preventDefault();
    if (!selectedContactToPrint) return;
    const contact = selectedContactToPrint;
    const includeAllNotes =
      contactPrintForm.elements.namedItem("print-notes").value === "all";
    const notes = getSortedVisitNotes(contact);
    const selectedNotes = includeAllNotes ? notes : notes.slice(0, 1);
    const fullName = `${contact.firstName} ${contact.lastName}`.trim();
    const streetAddress =
      normalizeStreetName(getStreetAddress(contact)) ||
      "No street address recorded";
    const cityState = [contact.city, contact.state, contact.country]
      .filter(Boolean)
      .join(", ");
    const location = getContactLocationSummary(contact);
    const notesMarkup = selectedNotes.length
      ? selectedNotes
          .map(
            (note) => `
              <article class="print-note-entry">
                <p class="print-note-date">${escapeHtml(getPrintableNoteDate(note))}</p>
                <p class="print-note-text">${escapeHtml(note.text)}</p>
              </article>
            `,
          )
          .join("")
      : '<p>No visit notes recorded.</p>';

    contactPrintDialog.close();
    selectedContactToPrint = null;
    printContent(
      fullName,
      `Contact ID: ${contact.id} • ${includeAllNotes ? "all visit notes" : "most recent note only"} • ${new Date().toLocaleDateString()}`,
      `
        <article class="print-single-contact">
          <h2>${escapeHtml(fullName)}</h2>
          <p>${escapeHtml(streetAddress)}</p>
          ${cityState ? `<p>${escapeHtml(cityState)}</p>` : ""}
          ${contact.phone ? `<p>Phone: ${escapeHtml(contact.phone)}</p>` : ""}
          ${contact.email ? `<p>Email: ${escapeHtml(contact.email)}</p>` : ""}
          <p class="print-single-location">${escapeHtml(location)}</p>
          <p class="print-contact-id">Contact ID: ${escapeHtml(contact.id)}</p>
          <section class="print-notes">
            <h3>${includeAllNotes ? "Visit history" : "Most recent note"}</h3>
            ${notesMarkup}
          </section>
        </article>
      `,
    );
  });

  // Render Leaflet Map Markers with Dynamic Color-Coded Pins
  const renderMapMarkers = () => {
    if (!map) return;
    const renderGeneration = ++cityPinRenderGeneration;
    mapMarkers.forEach((marker) => map.removeLayer(marker));
    mapMarkers = [];
    mapContactPoints = [];
    if (homeMarker) {
      map.removeLayer(homeMarker);
      homeMarker = null;
    }

    const exactPoints = [];
    const cityGroups = new Map();
    const mapStatus = document.getElementById("map-location-status");
    const contactActions = (contact) => {
      const navigationUrl = getNavigationUrl(contact);
      return `
        <div class="map-popup-actions">
          <button type="button" onclick="editContact(${contact.id})">Edit Contact</button>
          ${
            navigationUrl
              ? `<a class="map-popup-directions" href="${escapeHtml(navigationUrl)}" target="_blank" rel="noopener noreferrer">Get Directions</a>`
              : '<span aria-hidden="true"></span>'
          }
        </div>`;
    };
    const contactDetails = (contact, number, approximate = false) => {
      const status = getContactStatus(contact);
      return `
        <section class="map-popup-contact">
          <strong>${number}. ${escapeHtml(contact.firstName)} ${escapeHtml(contact.lastName)}</strong><br>
          ${escapeHtml(getFormattedContactAddress(contact))}<br>
          ${contact.phone ? `Phone: ${escapeHtml(contact.phone)}<br>` : ""}
          ${contact.email ? `Email: ${escapeHtml(contact.email)}<br>` : ""}
          Location: ${escapeHtml(getContactLocationSummary(contact))}<br>
          Days Since Contact: ${status.days} (${status.label})<br>
          ${approximate ? "<em>Approximate city location</em><br>" : ""}
          ${contactActions(contact)}
          ${approximate ? "" : "<small>Drag this pin to move it. The new location saves automatically.</small>"}
        </section>`;
    };

    visibleContacts.forEach((contact, contactIndex) => {
      const lat = Number(contact.lat);
      const lng = Number(contact.lng);
      const contactNumber = contactIndex + 1;
      if (hasContactCoordinates(contact)) {
        const latNum = lat;
        const lngNum = lng;
        const status = getContactStatus(contact);

        const svgIcon = L.divIcon({
          className: "custom-map-pin",
          html: `<div style="background-color: ${status.color};">${contactNumber}</div>`,
          iconSize: [28, 28],
          iconAnchor: [14, 14],
        });

        const marker = L.marker([latNum, lngNum], {
          icon: svgIcon,
          draggable: true,
        }).addTo(map);
        marker.bindPopup(contactDetails(contact, contactNumber));
        marker.on("dragend", async () => {
          const previousCoordinates = { lat: contact.lat, lng: contact.lng };
          const previousCenter = map.getCenter();
          const previousZoom = map.getZoom();
          const movedTo = marker.getLatLng();
          contact.lat = movedTo.lat.toFixed(6);
          contact.lng = movedTo.lng.toFixed(6);
          const pointIndex = mapContactPoints.findIndex(
            (point) => point[0] === latNum && point[1] === lngNum,
          );
          if (pointIndex !== -1) {
            mapContactPoints[pointIndex] = [movedTo.lat, movedTo.lng];
          }
          const status = document.getElementById("map-location-status");
          status.textContent = "Saving moved pin...";
          if (await saveContacts()) {
            map.setView(previousCenter, previousZoom);
            status.textContent = "Pin moved and saved.";
          } else {
            contact.lat = previousCoordinates.lat;
            contact.lng = previousCoordinates.lng;
            if (pointIndex !== -1) mapContactPoints[pointIndex] = [latNum, lngNum];
            renderMapMarkers();
            map.setView(previousCenter, previousZoom);
            status.textContent =
              "Could not save the moved pin. The previous location was restored.";
          }
        });

        mapMarkers.push(marker);
        exactPoints.push([latNum, lngNum]);
      } else if (contact.city && contact.city.trim()) {
        const query = getCityPinQuery(contact);
        if (!cityGroups.has(query)) {
          cityGroups.set(query, {
            city: contact.city.trim(),
            state: normalizeLocationState(
              contact.country || settings.country,
              contact.state || settings.state,
            ),
            country: contact.country || settings.country,
            contacts: [],
          });
        }
        cityGroups.get(query).contacts.push({ contact, number: contactNumber });
      }
    });

    mapContactPoints = [...exactPoints];
    const home = getHomePoint();
    if (home) {
      const me = settings.me;
      homeMarker = L.marker(home, {
        icon: L.divIcon({
          className: "custom-map-pin custom-home-pin",
          html: `<div>${iconSvg("home")}</div>`,
          iconSize: [34, 34],
          iconAnchor: [17, 17],
        }),
        draggable: true,
        zIndexOffset: 1000,
      }).addTo(map);
      homeMarker.bindPopup(
        `<b>${escapeHtml(me.name || "My home")}</b><br>${escapeHtml(
          [me.street, me.city, me.state, me.country]
            .filter(Boolean)
            .join(", "),
        )}<br><br>Drag this pin to move it. The new location saves automatically.`,
      );
      homeMarker.on("dragend", async () => {
        const movedTo = homeMarker.getLatLng();
        settings.me.lat = movedTo.lat.toFixed(6);
        settings.me.lng = movedTo.lng.toFixed(6);
        populateMeForm();
        try {
          await saveSettings();
        } catch (error) {
          showStorageError("save your home pin", error);
        }
      });
    }

    fitMapToContactPoints();
    if (exactPoints.length > 0) {
      lastDefaultCityCenterQuery = null;
      mapStatus.textContent = `Showing ${exactPoints.length} contact pin${exactPoints.length === 1 ? "" : "s"} with saved coordinates. Drag a pin to move it; changes save automatically.`;
    }

    if (cityGroups.size > 0) {
      const cityContactsCount = [...cityGroups.values()].reduce(
        (count, group) => count + group.contacts.length,
        0,
      );
      mapStatus.textContent = `Locating ${cityGroups.size} approximate city location${cityGroups.size === 1 ? "" : "s"} for ${cityContactsCount} contact${cityContactsCount === 1 ? "" : "s"}...`;
      const locatedCityPoints = [];
      let locatedCityContacts = 0;
      let failedCityContacts = 0;
      const renderCityPins = async () => {
        for (const [query, group] of cityGroups) {
          if (renderGeneration !== cityPinRenderGeneration) return;
          let location;
          try {
            location = await lookupCityPinCoordinates(query);
          } catch (error) {
            console.error(`Unable to locate contact city "${query}":`, error);
            failedCityContacts += group.contacts.length;
            continue;
          }
          if (!location) continue;

          locatedCityContacts += group.contacts.length;
          locatedCityPoints.push(location);
          const firstStatus = getContactStatus(group.contacts[0].contact);
          const pinLabel = `${group.contacts[0].number}${group.contacts.length > 1 ? "+" : ""}`;
          const cityIcon = L.divIcon({
            className: "custom-map-pin",
            html: `<div style="background-color: ${firstStatus.color};">${pinLabel}</div>`,
            iconSize: [28, 28],
            iconAnchor: [14, 14],
          });
          const marker = L.marker(location, { icon: cityIcon }).addTo(map);
          const cityLabel = [group.city, group.state, group.country]
            .filter(Boolean)
            .join(", ");
          marker.bindPopup(`
            <div>
              <strong>Approximate city location: ${escapeHtml(cityLabel)}</strong>
              ${group.contacts
                .map(({ contact, number }) => contactDetails(contact, number, true))
                .join("")}
            </div>
          `);
          mapMarkers.push(marker);
        }
        if (renderGeneration !== cityPinRenderGeneration) return;

        mapContactPoints = [...exactPoints, ...locatedCityPoints];
        fitMapToContactPoints();
        const locatedCityPins = locatedCityPoints.length;
        const unlocatedContacts =
          visibleContacts.length - exactPoints.length - locatedCityContacts;
        const pinCount = exactPoints.length + locatedCityPins;
        if (pinCount > 0) {
          lastDefaultCityCenterQuery = null;
          mapStatus.textContent =
            `${exactPoints.length} contact pin${exactPoints.length === 1 ? "" : "s"} with saved coordinates and ${locatedCityPins} approximate city pin${locatedCityPins === 1 ? "" : "s"} shown for ${locatedCityContacts} city-only contact${locatedCityContacts === 1 ? "" : "s"}.` +
            (unlocatedContacts > 0
              ? ` ${unlocatedContacts} contact${unlocatedContacts === 1 ? " has" : "s have"} no mappable city.`
              : "");
        } else {
          mapStatus.textContent =
            `No city-only contacts could be located.${failedCityContacts ? " Check your connection and try opening the Map again." : ""}`;
        }
        if (mapMarkers.length === 0 && !homeMarker) {
          centerMapOnDefaultCity();
        }
      };
      if (currentViewId === "map-view") renderCityPins();
    } else if (visibleContacts.length > 0 && exactPoints.length === 0) {
      mapStatus.textContent =
        `${visibleContacts.length} matching contact${visibleContacts.length === 1 ? " has" : "s have"} no saved coordinates or city. Add a city or use Find Address or City Pin to locate a contact.`;
    } else if (visibleContacts.length === 0) {
      mapStatus.textContent =
        "No matching contacts to show. Change the search or filters, or add map coordinates to a contact.";
    }

    if (currentViewId === "map-view" && mapMarkers.length === 0 && !homeMarker) {
      if (cityGroups.size === 0) centerMapOnDefaultCity();
    }
  };

  // Global Action Handlers
  window.addQuickVisit = async (contactId) => {
    await editContact(contactId, "visits");
    const noteBox = document.getElementById("contact-notes");
    setTimeout(() => {
      noteBox.scrollIntoView({ block: "center" });
      noteBox.focus();
    }, 150);
  };

  // Inline Visit Log Editor Functions
  window.deleteVisitLog = async (contactId, logId) => {
    if (confirm("Are you sure you want to delete this visit log?")) {
      const contact = contacts.find((c) => c.id == contactId);
      if (contact && contact.notesHistory) {
        contact.notesHistory = contact.notesHistory.filter(
          (n) => n.id != logId,
        );
        // Remembered so syncing another device does not bring the visit back.
        contact.deletedNotes = [
          ...(contact.deletedNotes || []).filter((entry) => entry.id != logId),
          { id: logId, deletedAt: new Date().toISOString() },
        ];
        if (!(await saveContacts())) return;
        editContact(contactId, "visits");
      }
    }
  };

  window.editContact = async (id, view = "info") => {
    const contact = contacts.find((c) => c.id == id);
    if (!contact) return;
    clearAddressMatches();
    crossStreetSearch.hidden = true;
    document.getElementById("contact-cross-street").value = "";
    setLocationStatus("");
    document.getElementById("contact-id").value = contact.id;
    contactSecondaryActions.hidden = false;
    [printContactButton, shareContactButton, exportContactButton].forEach(
      (button) => {
        button.disabled = true;
      },
    );
    const recordIdLabel = document.getElementById("contact-record-id");
    recordIdLabel.textContent = `Permanent contact ID: ${contact.id}`;
    recordIdLabel.hidden = false;
    document.getElementById("contact-firstname").value = contact.firstName;
    document.getElementById("contact-lastname").value = contact.lastName;
    document.getElementById("contact-email").value = contact.email || "";
    phoneInput.value = contact.phone || "";
    document.getElementById("contact-address").value = normalizeStreetName(
      getStreetAddress(contact),
    );
    contactCountrySelect.value =
      contact.country || settings.me?.country || settings.country;
    contactCountrySelect.dataset.selectedCountry = contactCountrySelect.value;
    document.getElementById("contact-state").value = normalizeLocationState(
      contactCountrySelect.value,
      contact.state || settings.me?.state || settings.state,
    );
    document.getElementById("contact-city-select").value = contact.city || "";
    lastCommittedContactCity = contact.city || "";
    pendingContactCitySave = Promise.resolve(true);
    updateContactLocationFields();
    dropdownHelpers.populateContactRegionArea(
      contact.region || "",
      contact.area || "",
    );
    document.getElementById("contact-lat").value = contact.lat || "";
    document.getElementById("contact-lng").value = contact.lng || "";
    document.getElementById("contact-notes").value = "";
    document.getElementById("new-log-timestamp").value = toLocalDateTimeString(
      new Date(),
    );
    delete document.getElementById("new-log-timestamp").dataset.touched;

    const historyContainer = document.getElementById(
      "modal-notes-history-container",
    );
    historyContainer.innerHTML = "";
    if (contact.notesHistory && contact.notesHistory.length > 0) {
      const sortedNotes = [...contact.notesHistory].sort(
        (a, b) => new Date(b.rawDate || b.date) - new Date(a.rawDate || a.date),
      );
      sortedNotes.forEach((note) => {
        if (!note.id)
          note.id =
            "log_" + Date.now() + "_" + Math.floor(Math.random() * 1000);

        const entry = document.createElement("div");
        entry.className = "note-entry";
        entry.style.padding = "6px 0";
        entry.style.borderBottom = "1px solid #ddd";

        // Default View Mode for Log Entry
        const renderViewMode = () => {
          entry.innerHTML = "";

          const infoDiv = document.createElement("div");
          infoDiv.style.marginBottom = "4px";
          infoDiv.innerHTML = `<small style="color: #6c757d; font-weight: bold;">${escapeHtml(note.date)}</small><br><span>${escapeHtml(note.text)}</span>`;

          const btnRow = document.createElement("div");
          btnRow.style.display = "flex";
          btnRow.style.gap = "6px";
          btnRow.style.marginTop = "4px";

          const editBtn = document.createElement("button");
          editBtn.type = "button";
          editBtn.className = "btn-icon";
          editBtn.title = "Edit Log";
          editBtn.textContent = "✏️ Edit";
          editBtn.style.fontSize = "12px";
          editBtn.style.padding = "4px 8px";
          editBtn.addEventListener("click", (ev) => {
            ev.preventDefault();
            ev.stopPropagation();
            renderEditMode();
          });

          const delBtn = document.createElement("button");
          delBtn.type = "button";
          delBtn.className = "btn-icon delete";
          delBtn.title = "Delete Log";
          delBtn.textContent = "🗑️ Delete";
          delBtn.style.fontSize = "12px";
          delBtn.style.padding = "4px 8px";
          delBtn.addEventListener("click", (ev) => {
            ev.preventDefault();
            ev.stopPropagation();
            window.deleteVisitLog(contact.id, note.id);
          });

          btnRow.appendChild(editBtn);
          btnRow.appendChild(delBtn);

          entry.appendChild(infoDiv);
          entry.appendChild(btnRow);
        };

        // Inline Edit Mode for Log Entry
        const renderEditMode = () => {
          entry.innerHTML = "";

          const editContainer = document.createElement("div");
          editContainer.style.display = "flex";
          editContainer.style.flexDirection = "column";
          editContainer.style.gap = "6px";

          const dateInput = document.createElement("input");
          dateInput.type = "datetime-local";
          const existingDate = note.rawDate
            ? new Date(note.rawDate)
            : new Date(note.date);
          dateInput.value = toLocalDateTimeString(
            isNaN(existingDate) ? new Date() : existingDate,
          );
          dateInput.style.padding = "6px";

          const textArea = document.createElement("textarea");
          textArea.rows = 2;
          textArea.value = note.text;
          textArea.style.padding = "6px";

          const actionRow = document.createElement("div");
          actionRow.style.display = "flex";
          actionRow.style.gap = "6px";

          const saveLogBtn = document.createElement("button");
          saveLogBtn.type = "button";
          saveLogBtn.textContent = "💾 Update Log";
          saveLogBtn.style.background = "#28a745";
          saveLogBtn.style.color = "white";
          saveLogBtn.style.border = "none";
          saveLogBtn.style.padding = "6px 12px";
          saveLogBtn.style.borderRadius = "4px";
          saveLogBtn.style.cursor = "pointer";

          saveLogBtn.addEventListener("click", async (ev) => {
            ev.preventDefault();
            ev.stopPropagation();
            const updatedText = textArea.value.trim();
            if (!updatedText) {
              alert("Note text cannot be empty.");
              return;
            }
            const updatedDate = new Date(dateInput.value);
            note.text = updatedText;
            if (!isNaN(updatedDate)) {
              note.rawDate = updatedDate.toISOString();
              note.date = updatedDate.toLocaleString();
            }
            if (await saveContacts()) editContact(contact.id, "visits");
          });

          const cancelLogBtn = document.createElement("button");
          cancelLogBtn.type = "button";
          cancelLogBtn.textContent = "❌ Cancel";
          cancelLogBtn.style.background = "#6c757d";
          cancelLogBtn.style.color = "white";
          cancelLogBtn.style.border = "none";
          cancelLogBtn.style.padding = "6px 12px";
          cancelLogBtn.style.borderRadius = "4px";
          cancelLogBtn.style.cursor = "pointer";

          cancelLogBtn.addEventListener("click", (ev) => {
            ev.preventDefault();
            ev.stopPropagation();
            renderViewMode();
          });

          actionRow.appendChild(saveLogBtn);
          actionRow.appendChild(cancelLogBtn);

          editContainer.appendChild(dateInput);
          editContainer.appendChild(textArea);
          editContainer.appendChild(actionRow);

          entry.appendChild(editContainer);
        };

        renderViewMode();
        historyContainer.appendChild(entry);
      });
    } else {
      historyContainer.innerHTML =
        '<span style="color: #888;">No visit logs recorded yet.</span>';
    }

    document.getElementById("modal-title").textContent =
      view === "visits" ? "Add/Edit Visit" : "Edit Contact";
    const lat = Number.parseFloat(contact.lat);
    const lng = Number.parseFloat(contact.lng);
    await openModalWithCoords(
      Number.isFinite(lat) && Number.isFinite(lng) ? lat : null,
      Number.isFinite(lat) && Number.isFinite(lng) ? lng : null,
      view,
    );
  };

  window.deleteContact = async (id) => {
    if (confirm("Delete this contact and all of its data?")) {
      const previousState = cloneLocationState();
      contacts = contacts.filter((c) => c.id != id);
      settings.deletedContacts = [
        ...(settings.deletedContacts || []).filter((entry) => entry.id != id),
        { id, deletedAt: new Date().toISOString() },
      ];
      await persistLocationChanges(previousState, "delete the contact");
    }
  };

  document
    .getElementById("search-input")
    .addEventListener("input", renderContacts);
  document
    .getElementById("filter-urgency")
    .addEventListener("change", renderContacts);
  document
    .getElementById("filter-city")
    .addEventListener("change", () => {
      populateDropdowns();
      renderContacts();
    });
  document
    .getElementById("filter-region")
    .addEventListener("change", () => {
      populateDropdowns();
      renderContacts();
    });
  document
    .getElementById("filter-area")
    .addEventListener("change", renderContacts);
  document
    .getElementById("sort-select")
    .addEventListener("change", renderContacts);

  const buildBackup = async (encrypt = Boolean(encryptionKey)) => {
    const useKey = encrypt && encryptionKey;
    return {
      format: useKey
        ? "return-visits-encrypted-backup"
        : "return-visits-backup",
      version: 1,
      exportedAt: new Date().toISOString(),
      ...(useKey
        ? {
            encryption: cryptoMetadata,
            data: {
              settings: await encryptValue(settings, encryptionKey),
              contacts: await encryptValue(contacts, encryptionKey),
            },
          }
        : { settings, contacts }),
    };
  };

  const downloadEncryptedBackup = async (encrypt = Boolean(encryptionKey)) => {
    try {
      const backup = await buildBackup(encrypt);
      const file = new Blob([JSON.stringify(backup, null, 2)], {
        type: "application/json",
      });
      const downloadUrl = URL.createObjectURL(file);
      const link = document.createElement("a");
      link.href = downloadUrl;
      link.download = `return-visits-backup-${new Date()
        .toISOString()
        .slice(0, 10)}.json`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000);
      markBackupDone();
    } catch (error) {
      showStorageError("export encrypted backup", error);
    }
  };

  const downloadContactsSubset = async (list, encrypt) => {
    try {
      const useKey = encrypt && encryptionKey;
      const data = { contacts: list };
      const transfer = {
        format: useKey ? ENCRYPTED_CONTACTS_FORMAT : PLAIN_CONTACTS_FORMAT,
        version: 1,
        exportedAt: new Date().toISOString(),
        ...(useKey
          ? {
              encryption: cryptoMetadata,
              data: await encryptValue(data, encryptionKey),
            }
          : { data }),
      };
      const downloadUrl = URL.createObjectURL(
        new Blob([JSON.stringify(transfer, null, 2)], {
          type: "application/json",
        }),
      );
      const link = document.createElement("a");
      link.href = downloadUrl;
      link.download = `return-visits-contacts-${new Date()
        .toISOString()
        .slice(0, 10)}.json`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000);
    } catch (error) {
      showStorageError("export contacts", error);
    }
  };

  const exportEncryptDialog = document.getElementById("export-encrypt-dialog");
  const exportEncryptForm = document.getElementById("export-encrypt-form");
  const exportEncryptCheckbox = document.getElementById("export-encrypt-check");
  const exportEncryptWarning = document.getElementById("export-encrypt-warning");

  exportEncryptCheckbox.addEventListener("change", () => {
    exportEncryptWarning.hidden = exportEncryptCheckbox.checked;
  });

  // Resolves true (encrypt), false (plain) or null (cancelled).
  const requestExportEncryption = () =>
    new Promise((resolve) => {
      exportEncryptCheckbox.checked = true;
      exportEncryptWarning.hidden = true;
      const finish = (value) => {
        exportEncryptDialog.close();
        exportEncryptForm.removeEventListener("submit", onSubmit);
        exportEncryptDialog.removeEventListener("cancel", onCancel);
        document
          .getElementById("cancel-export-encrypt")
          .removeEventListener("click", onCancel);
        resolve(value);
      };
      const onSubmit = (event) => {
        event.preventDefault();
        finish(exportEncryptCheckbox.checked);
      };
      const onCancel = () => finish(null);
      exportEncryptForm.addEventListener("submit", onSubmit);
      exportEncryptDialog.addEventListener("cancel", onCancel);
      document
        .getElementById("cancel-export-encrypt")
        .addEventListener("click", onCancel);
      exportEncryptDialog.showModal();
    });

  const exportSelectionDialog = document.getElementById(
    "export-selection-dialog",
  );
  const exportSelectionAll = document.getElementById("export-selection-all");
  const exportSelectionSome = document.getElementById("export-selection-some");
  const exportSelectionNumbers = document.getElementById(
    "export-selection-numbers",
  );
  const exportSelectionStatus = document.getElementById(
    "export-selection-status",
  );
  const exportSelectionFileButton = document.getElementById(
    "export-selection-file",
  );
  const exportShareLinks = [
    document.getElementById("export-selection-sms"),
    document.getElementById("export-selection-whatsapp"),
    document.getElementById("export-selection-email"),
  ];
  const maxShareLinkLength = 5000;
  let exportContactsInView = [];

  const getExportSelection = () => {
    if (exportSelectionAll.checked) {
      return { contacts: exportContactsInView, error: "" };
    }

    if (!exportSelectionNumbers.value.trim()) {
      return { contacts: [], error: "Choose at least one contact number." };
    }
    const entries = exportSelectionNumbers.value.split(",");
    const selectedNumbers = new Set();
    for (const rawEntry of entries) {
      const entry = rawEntry.trim();
      const match = entry.match(/^(\d+)(?:\s*-\s*(\d+))?$/);
      if (!match) {
        return {
          contacts: [],
          error: "Enter numbers like 3, 4-7, 9.",
        };
      }
      const start = Number(match[1]);
      const end = match[2] ? Number(match[2]) : start;
      if (
        !Number.isSafeInteger(start) ||
        !Number.isSafeInteger(end) ||
        start < 1 ||
        end < start ||
        end > exportContactsInView.length
      ) {
        return {
          contacts: [],
          error: `Use contact numbers from 1 to ${exportContactsInView.length}.`,
        };
      }
      for (let number = start; number <= end; number += 1) {
        selectedNumbers.add(number);
      }
    }

    if (!selectedNumbers.size) {
      return { contacts: [], error: "Choose at least one contact number." };
    }
    return {
      contacts: [...selectedNumbers]
        .sort((a, b) => a - b)
        .map((number) => exportContactsInView[number - 1]),
      error: "",
    };
  };

  const updateExportSelection = () => {
    const useAll = exportSelectionAll.checked;
    exportSelectionNumbers.disabled = useAll;
    if (useAll) exportSelectionNumbers.value = "";
    document.getElementById("export-selection-all-label").textContent =
      `All contacts shown (${exportContactsInView.length})`;

    const selection = getExportSelection();
    exportSelectionStatus.textContent = selection.error
      ? selection.error
      : `${selection.contacts.length} contact${
          selection.contacts.length === 1 ? "" : "s"
        } selected.`;
    exportSelectionFileButton.disabled =
      Boolean(selection.error) || selection.contacts.length === 0;

    const senderName = settings.me?.name?.trim();
    const messageParts = [];
    let encodedLength = 0;
    for (const contact of selection.contacts) {
      const part = getContactShareText(contact);
      encodedLength += encodeURIComponent(part).length + 18;
      if (encodedLength > maxShareLinkLength) break;
      messageParts.push(part);
    }
    if (senderName) {
      encodedLength += encodeURIComponent(senderName).length + 18;
    }
    const shareTooLong = encodedLength > maxShareLinkLength;
    const shareText = [
      ...messageParts,
      ...(senderName ? [`Shared by ${senderName}`] : []),
    ].join("\n\n---\n\n");
    const encodedText = shareTooLong ? "" : encodeURIComponent(shareText);
    exportShareLinks.forEach((link) => {
      const disabled =
        Boolean(selection.error) ||
        selection.contacts.length === 0 ||
        shareTooLong;
      link.setAttribute("aria-disabled", String(disabled));
      link.href = disabled ? "" : `#`;
    });
    if (!selection.error && selection.contacts.length > 0 && !shareTooLong) {
      const subject = encodeURIComponent(
        `Contacts (${selection.contacts.length})`,
      );
      document.getElementById("export-selection-sms").href =
        `sms:?body=${encodedText}`;
      document.getElementById("export-selection-whatsapp").href =
        `https://wa.me/?text=${encodedText}`;
      document.getElementById("export-selection-email").href =
        `mailto:?subject=${subject}&body=${encodedText}`;
    } else if (
      !selection.error &&
      selection.contacts.length > 0 &&
      shareTooLong
    ) {
      exportSelectionStatus.textContent =
        "That selection is too long to share as a message. Export a file instead.";
      exportSelectionFileButton.disabled = false;
    }
  };

  const openExportSelection = () => {
    if (!visibleContacts.length) return;
    exportContactsInView = [...visibleContacts];
    exportSelectionAll.checked = true;
    exportSelectionSome.checked = false;
    exportSelectionNumbers.value = "";
    updateExportSelection();
    exportSelectionDialog.showModal();
  };

  document
    .getElementById("export-selection-form")
    .addEventListener("submit", (event) => event.preventDefault());
  exportSelectionAll.addEventListener("change", updateExportSelection);
  exportSelectionSome.addEventListener("change", updateExportSelection);
  exportSelectionNumbers.addEventListener("input", () => {
    if (exportSelectionNumbers.value) exportSelectionSome.checked = true;
    updateExportSelection();
  });
  exportShareLinks.forEach((link) => {
    link.addEventListener("click", (event) => {
      if (link.getAttribute("aria-disabled") === "true") {
        event.preventDefault();
        return;
      }
      exportSelectionDialog.close();
    });
  });
  document
    .getElementById("cancel-export-selection")
    .addEventListener("click", () => exportSelectionDialog.close());
  exportSelectionFileButton.addEventListener("click", async () => {
    const selection = getExportSelection();
    if (selection.error || !selection.contacts.length) {
      updateExportSelection();
      return;
    }
    exportSelectionDialog.close();
    let encrypt = Boolean(encryptionKey);
    if (encryptionKey) {
      encrypt = await requestExportEncryption();
      if (encrypt === null) return;
    }
    await downloadContactsSubset(selection.contacts, encrypt);
  });

  document
    .getElementById("btn-export-backup")
    .addEventListener("click", () => downloadEncryptedBackup());
  document
    .getElementById("btn-export-visible")
    .addEventListener("click", openExportSelection);

  const contactTransferDialog = document.getElementById(
    "contact-transfer-dialog",
  );
  const contactTransferForm = document.getElementById(
    "contact-transfer-form",
  );
  const contactTransferPassphrase = document.getElementById(
    "contact-transfer-passphrase",
  );
  const contactTransferConfirmContainer = document.getElementById(
    "contact-transfer-confirm-container",
  );
  const contactTransferConfirm = document.getElementById(
    "contact-transfer-confirm",
  );
  let contactTransferMode = "export";
  let contactTransferDialogResolve;

  const requestContactTransferPassphrase = (mode) =>
    new Promise((resolve) => {
      contactTransferMode = mode;
      contactTransferDialogResolve = resolve;
      document.getElementById("contact-transfer-title").textContent =
        mode === "export" ? "Protect Contact File" : "Unlock Contact File";
      document.getElementById("contact-transfer-description").textContent =
        mode === "export"
          ? "Create a passphrase of at least 8 characters. Give it to the recipient separately from the contact file."
          : "Enter the passphrase that was used to protect this contact file.";
      document.getElementById("contact-transfer-submit").textContent =
        mode === "export" ? "Export Contact" : "Import Contact";
      contactTransferConfirmContainer.hidden = mode !== "export";
      contactTransferPassphrase.value = "";
      contactTransferConfirm.value = "";
      contactTransferPassphrase.autocomplete =
        mode === "export" ? "new-password" : "current-password";
      contactTransferConfirm.required = mode === "export";
      contactTransferForm.addEventListener(
        "submit",
        onContactTransferSubmit,
      );
      document
        .getElementById("cancel-contact-transfer")
        .addEventListener("click", cancelContactTransfer);
      contactTransferDialog.addEventListener("cancel", cancelContactTransfer);
      contactTransferDialog.showModal();
      contactTransferPassphrase.focus();
    });

  const finishContactTransferDialog = (passphrase) => {
    contactTransferDialog.close();
    contactTransferForm.removeEventListener(
      "submit",
      onContactTransferSubmit,
    );
    document
      .getElementById("cancel-contact-transfer")
      .removeEventListener("click", cancelContactTransfer);
    contactTransferDialog.removeEventListener("cancel", cancelContactTransfer);
    contactTransferPassphrase.value = "";
    contactTransferConfirm.value = "";
    contactTransferDialogResolve(passphrase);
    contactTransferDialogResolve = null;
  };

  function onContactTransferSubmit(event) {
    event.preventDefault();
    const passphrase = contactTransferPassphrase.value;
    if (passphrase.length < 8) {
      alert("Use a passphrase with at least 8 characters.");
      return;
    }
    if (
      contactTransferMode === "export" &&
      passphrase !== contactTransferConfirm.value
    ) {
      alert("The passphrases do not match.");
      contactTransferConfirm.select();
      return;
    }
    finishContactTransferDialog(passphrase);
  }

  function cancelContactTransfer() {
    finishContactTransferDialog(null);
  }

  const exportContact = async (contact) => {
    // With no passphrase on this device, export a plain file with no prompts.
    const passphrase = encryptionKey
      ? await requestContactTransferPassphrase("export")
      : null;
    if (encryptionKey && passphrase === null) return;
    try {
      const contactData = {
        ...contact,
        areas: getContactAreas(contact),
        areaAssignments: contact.area
          ? [
              {
                name: contact.area,
                region: contact.region,
                city: contact.city,
              },
            ]
          : [],
        notesHistory: contact.notesHistory || [],
      };
      let transfer;
      if (passphrase === null) {
        transfer = {
          format: PLAIN_CONTACT_FORMAT,
          version: 1,
          exportedAt: new Date().toISOString(),
          data: contactData,
        };
      } else {
        const metadata = createCryptoMetadata();
        const transferKey = await deriveEncryptionKey(passphrase, metadata);
        transfer = {
          format: "return-visits-encrypted-contact",
          version: 1,
          exportedAt: new Date().toISOString(),
          encryption: metadata,
          data: await encryptValue(contactData, transferKey),
        };
      }
      const downloadUrl = URL.createObjectURL(
        new Blob([JSON.stringify(transfer, null, 2)], {
          type: "application/json",
        }),
      );
      const link = document.createElement("a");
      link.href = downloadUrl;
      link.download = `return-visits-contact-${contact.firstName
        .trim()
        .replace(/[^a-z0-9_-]+/gi, "-")
        .replace(/^-|-$/g, "")
        .toLowerCase() || "export"}.json`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000);
    } catch (error) {
      console.error("Unable to export contact:", error);
      alert("Could not export this contact. No contact data was changed.");
    }
  };

  const backupFileInput = document.getElementById("backup-file-input");
  const contactFileInput = document.getElementById("contact-file-input");
  document
    .getElementById("btn-import-contact")
    .addEventListener("click", () => contactFileInput.click());
  contactFileInput.addEventListener("change", async () => {
      const files = [...contactFileInput.files];
      if (!files.length) return;

      try {
        const importedList = [];
        let passphrase;
        for (const file of files) {
          const transfer = JSON.parse(await file.text());
          const isPlain =
            transfer.format === PLAIN_CONTACT_FORMAT ||
            transfer.format === PLAIN_CONTACTS_FORMAT;
          if (!isPlain && passphrase === undefined) {
            passphrase = await requestContactTransferPassphrase("import");
            if (passphrase === null) {
              contactFileInput.value = "";
              return;
            }
          }
          importedList.push(
            ...(await decryptContactsTransfer(
              transfer,
              isPlain ? null : passphrase,
            )),
          );
        }
        if (
          !confirm(
            `Import ${importedList.length} contact${importedList.length === 1 ? "" : "s"} as new? Visit history is included. Existing contacts will not be changed.`,
          )
        ) {
          contactFileInput.value = "";
          return;
        }
        const updatedSettings = {
          ...settings,
          cities: [...settings.cities],
          regions: [...settings.regions],
          areas: [...settings.areas],
        };
        const updatedContacts = [...contacts];
        let nextId = Date.now();
        for (const importedContact of importedList) {
        const importedAreaName =
          importedContact.area || importedContact.areas?.[0] || "";
        const legacyAssignment =
          importedContact.areaAssignments.find(
            (assignment) => assignment.name === importedAreaName,
          ) ||
          settings.areas.find(
            (area) =>
              area.name === importedAreaName &&
              (!importedContact.city || area.city === importedContact.city),
          );
        const importedCity =
          importedContact.city || legacyAssignment?.city || "";
        const importedRegion = importedCity
          ? importedContact.region || legacyAssignment?.region || ""
          : "";
        const importedArea = importedCity
          ? importedAreaName || legacyAssignment?.name || ""
          : "";
        const updatedSettings = {
          ...settings,
          cities: [...settings.cities],
          regions: [...settings.regions],
          areas: [...settings.areas],
        };
        if (importedCity && !updatedSettings.cities.includes(importedCity)) {
          updatedSettings.cities.push(importedCity);
        }
        if (importedCity && importedRegion) {
          if (
            !updatedSettings.regions.some(
              (region) =>
                region.name === importedRegion &&
                region.city === importedCity,
            )
          ) {
            updatedSettings.regions.push({
              name: importedRegion,
              city: importedCity,
            });
          }
        }
        if (importedCity && importedArea) {
          const existingArea = updatedSettings.areas.find(
            (area) =>
              area.name.toLowerCase() === importedArea.toLowerCase() &&
              area.city === importedCity,
          );
          if (!existingArea) {
            updatedSettings.areas.push({
              name: importedArea,
              city: importedCity,
            });
          }
        }
        importedContact.city = importedCity;
        importedContact.region = importedRegion;
        importedContact.area = importedArea;
        importedContact.streetAddress = getStreetAddress(importedContact);
        delete importedContact.areas;
        delete importedContact.areaAssignments;

        while (
          updatedContacts.some((contact) => String(contact.id) === String(nextId))
        ) {
          nextId += 1;
        }
        updatedContacts.push({
          ...importedContact,
          id: nextId,
          updatedAt: new Date().toISOString(),
        });
        nextId += 1;
        }
        await writeStoredValues(database, [
          ["settings", await encryptValue(updatedSettings, encryptionKey)],
          ["contacts", await encryptValue(updatedContacts, encryptionKey)],
        ]);
        settings = updatedSettings;
        contacts = updatedContacts;
        resetContactSignatures();
        populateDropdowns();
        renderContacts();
        contactFileInput.value = "";
        alert(
          `${importedList.length} contact${importedList.length === 1 ? "" : "s"} imported.`,
        );
      } catch (error) {
        contactFileInput.value = "";
        console.error("Unable to import contacts:", error);
        alert(
          `Could not import. ${error.message || "Check that the file is valid and the passphrase is correct."} Your current contacts were not changed.`,
        );
      }
    });

  const restorePassphraseDialog = document.getElementById(
    "restore-passphrase-dialog",
  );
  const restorePassphraseForm = document.getElementById(
    "restore-passphrase-form",
  );
  const restorePassphraseInput = document.getElementById("restore-passphrase");

  const requestBackupPassphrase = () =>
    new Promise((resolve) => {
      const finish = (passphrase) => {
        restorePassphraseDialog.close();
        restorePassphraseForm.removeEventListener("submit", onSubmit);
        document
          .getElementById("cancel-restore-passphrase")
          .removeEventListener("click", onCancel);
        restorePassphraseDialog.removeEventListener("cancel", onCancel);
        restorePassphraseInput.value = "";
        resolve(passphrase);
      };
      const onSubmit = (event) => {
        event.preventDefault();
        finish(restorePassphraseInput.value);
      };
      const onCancel = () => finish(null);

      restorePassphraseForm.addEventListener("submit", onSubmit);
      document
        .getElementById("cancel-restore-passphrase")
        .addEventListener("click", onCancel);
      restorePassphraseDialog.addEventListener("cancel", onCancel);
      restorePassphraseDialog.showModal();
      restorePassphraseInput.focus();
    });

  const reportRestoreError = (error) => {
    console.error("Unable to restore encrypted backup:", error);
    alert(
      error instanceof NewerDataVersionError
        ? `${error.message} Your current data was not replaced.`
        : "Could not restore that backup. Check that the file is valid and the passphrase is correct. Your current data was not replaced.",
    );
  };

  // Returns true once the backup replaced the current data.
  const restoreBackupObject = async (backup) => {
    const plainBackup = backup.format === "return-visits-backup";
    const deviceProtected = Boolean(encryptionKey);
    // A plain backup needs no passphrase to read; an encrypted one does.
    const backupPassphrase = plainBackup ? null : await requestBackupPassphrase();
    if (!plainBackup && backupPassphrase === null) return false;
    const restored = await decryptBackup(backup, backupPassphrase);
    if (plainBackup && deviceProtected) {
      // Keep this device's own passphrase and recovery code.
      restored.encryptionKey = encryptionKey;
      restored.metadata = cryptoMetadata;
      restored.encryptedSettings = await encryptValue(
        restored.settings,
        encryptionKey,
      );
      restored.encryptedContacts = await encryptValue(
        restored.contacts,
        encryptionKey,
      );
    } else if (plainBackup) {
      restored.encryptionKey = null;
      restored.metadata = null;
      restored.encryptedSettings = restored.settings;
      restored.encryptedContacts = restored.contacts;
    }
    restored.wasLegacyPlaintext = false;
    let passphraseNote = "";
    if (!plainBackup && !deviceProtected) {
      passphraseNote =
        " This backup is protected by a passphrase, so restoring it turns the passphrase on for this device. It will be the backup's passphrase and recovery code, and you will be asked for it each time you open the app.";
    } else if (!plainBackup) {
      passphraseNote =
        " This device will switch to the passphrase and recovery code of this backup.";
    } else if (deviceProtected) {
      passphraseNote =
        " This backup is not encrypted; the restored data will be protected by this device's passphrase.";
    }
    if (
      !confirm(
        `This will replace all ${contacts.length} current contacts with ${restored.contacts.length} contacts from the backup.${passphraseNote} Continue?`,
      )
    ) {
      return false;
    }

    await writeStoredValues(database, [
      ["settings", restored.encryptedSettings],
      ["contacts", restored.encryptedContacts],
      ...(restored.metadata ? [[ENCRYPTION_META_KEY, restored.metadata]] : []),
    ]);
    encryptionKey = restored.encryptionKey;
    cryptoMetadata = restored.metadata;
    settings = restored.settings;
    contacts = restored.contacts;
    resetContactSignatures();
    settings.country = normalizeCountry(settings.country);
    settings.state = normalizeLocationState(settings.country, settings.state);
    populateCountryOptions();
    populateMeForm();
    document.getElementById("setting-state").value = settings.state;
    document.getElementById("setting-default-city").value =
      settings.defaultCity || "";
    populateDropdowns();
    renderContacts();
    updatePassphraseSection();
    markBackupDone();
    alert(
      encryptionKey && !restored.metadata?.recovery
        ? "Backup restored. It has no recovery code yet; open Settings → Data/Security → Passphrase to Open App and choose Make a New Recovery Code."
        : "Backup restored successfully.",
    );
    return true;
  };

  const restoreBackupFile = async (file) => {
    if (!file) {
      alert("Choose an encrypted backup file first.");
      return false;
    }

    try {
      const backup = JSON.parse(await file.text());
      const restored = await restoreBackupObject(backup);
      if (restored) {
        backupFileInput.value = "";
        backupFileInput.dispatchEvent(new Event("change"));
      }
      return restored;
    } catch (error) {
      reportRestoreError(error);
      return false;
    }
  };

  document
    .getElementById("btn-restore-backup")
    .addEventListener("click", () =>
      restoreBackupFile(backupFileInput.files[0]),
    );
  const clearRestoreFileButton = document.getElementById(
    "btn-clear-restore-file",
  );
  const restoreBackupButton = document.getElementById("btn-restore-backup");
  const syncRestoreFileUi = () => {
    const hasFile = backupFileInput.files.length > 0;
    restoreBackupButton.classList.toggle("has-file", hasFile);
    clearRestoreFileButton.hidden = !hasFile;
  };
  backupFileInput.addEventListener("change", syncRestoreFileUi);
  clearRestoreFileButton.addEventListener("click", () => {
    backupFileInput.value = "";
    syncRestoreFileUi();
  });
  // ---- Cloud backup (Dropbox, optional) ----
  const DAY_MS = 24 * 60 * 60 * 1000;
  const CLOUD_LAST_KEY = "return_visits_cloud_last_backup";
  const CLOUD_SNAPSHOT_KEY = "return_visits_cloud_last_snapshot";
  // Dropbox's own "modified" time of latest.json as of this device's last
  // upload or restore, and whether this device has changes not yet uploaded.
  const CLOUD_SEEN_KEY = "return_visits_cloud_seen";
  const CLOUD_DIRTY_KEY = "return_visits_cloud_dirty";
  const CLOUD_RECONNECT_DECISION_KEY =
    "return_visits_cloud_reconnect_decision_required";
  const CLOUD_SNAPSHOTS_KEPT = 10;
  const dropbox = window.RVDropbox;
  const cloudSection = document.getElementById("cloud-section");
  const cloudStatus = document.getElementById("cloud-status");
  const setCloudStatus = (message) => {
    cloudStatus.textContent = message;
    if (message) cloudStatus.scrollIntoView({ block: "nearest" });
  };
  const showCloudStep = (stepId) => {
    ["cloud-question", "cloud-signup", "cloud-connect"].forEach((id) => {
      document.getElementById(id).hidden = id !== stepId;
    });
    document.getElementById("btn-cloud-cancel-setup").hidden = !stepId;
  };

  // Small status icon in the header: synced, syncing, waiting or offline.
  const getSyncSummary = () => {
    const waiting = localStorage.getItem(CLOUD_DIRTY_KEY) === "1";
    if (cloudPaused) {
      return {
        icon: "⚠️",
        text:
          localStorage.getItem(CLOUD_RECONNECT_DECISION_KEY) === "1"
            ? "Dropbox is connected, but automatic sync is paused until you choose whether to restore its existing backup or replace it with this device's data."
            : "Dropbox sync is paused. Open Settings → Data/Security → Backup or Restore → Cloud Backup/Restore (Dropbox) for details.",
      };
    }
    if (!navigator.onLine) {
      return {
        icon: "📴",
        text: waiting
          ? "Offline. Your changes are saved on this device and will upload when the connection returns."
          : "Offline. Changes will sync when the connection returns.",
      };
    }
    if (cloudBusy) return { icon: "🔄", text: "Syncing with Dropbox…" };
    if (waiting) {
      return {
        icon: "⏳",
        text: "Changes saved on this device are waiting to upload to Dropbox.",
      };
    }
    const last = Number(localStorage.getItem(CLOUD_LAST_KEY) || 0);
    return {
      icon: "☁️",
      text: last
        ? `Synced with Dropbox (${new Date(last).toLocaleString()}).`
        : "Connected to Dropbox.",
    };
  };
  const refreshSyncIcon = () => {
    const button = document.getElementById("sync-status");
    if (!button) return;
    if (!dropbox.isConnected()) {
      button.hidden = true;
      return;
    }
    const summary = getSyncSummary();
    button.hidden = false;
    button.textContent = summary.icon;
    button.title = summary.text;
    button.setAttribute("aria-label", summary.text);
  };

  let cloudChosen = false;
  const refreshCloudUi = async () => {
    refreshSyncIcon();
    const connected = dropbox.isConnected();
    document.getElementById("cloud-off").hidden = connected;
    document.getElementById("cloud-on").hidden = !connected;
    cloudSection.hidden = !connected && !cloudChosen;
    document.getElementById("backup-mode-status").textContent = connected
      ? "You are using Dropbox cloud backup. Local backup files are still available below."
      : cloudChosen
        ? "You are using Local backup. Finish the Dropbox steps below, or go back to local only."
        : "You are using Local backup (files saved on this device).";
    document.getElementById("btn-backup-mode-switch").textContent = connected
      ? "Stop using Dropbox (use local only)"
      : cloudChosen
        ? "Cancel (use local only)"
        : "Switch to Dropbox cloud backup";
    if (!connected) return;
    const last = Number(localStorage.getItem(CLOUD_LAST_KEY) || 0);
    document.getElementById("cloud-last-backup").textContent = last
      ? `Last Dropbox backup: ${new Date(last).toLocaleString()}`
      : "No Dropbox backup yet.";
    const accountStatus = document.getElementById("cloud-account-status");
    accountStatus.textContent = "Connected to Dropbox.";
    try {
      const email = await dropbox.accountEmail();
      if (email) accountStatus.textContent = `Connected to Dropbox as ${email}.`;
    } catch (error) {
      console.error("Unable to read the Dropbox account:", error);
    }
  };

  const pruneCloudSnapshots = async () => {
    const files = (await dropbox.list())
      .filter((file) => /^backup-.*\.json$/.test(file.name))
      .sort((a, b) => b.name.localeCompare(a.name));
    for (const file of files.slice(CLOUD_SNAPSHOTS_KEPT)) {
      await dropbox.remove(file.path_lower);
    }
  };

  const getRemoteLatest = async () => {
    const file = (await dropbox.list()).find(
      (entry) => entry.name === "latest.json",
    );
    return file
      ? {
          path: file.path_lower,
          modified: Date.parse(file.server_modified),
          rev: file.rev,
        }
      : null;
  };

  // Counts local saves so a merge can tell if the user edited while it ran.
  let localChanges = 0;
  let cloudBusy = false;
  let cloudPaused =
    localStorage.getItem(CLOUD_RECONNECT_DECISION_KEY) === "1";

  // Reads the Dropbox copy for merging without asking for a passphrase.
  // Returns null when that is not possible (a different passphrase, or this
  // device has none), which sends the user through the restore prompts.
  const readRemoteForMerge = async (remote) => {
    const backup = JSON.parse(await dropbox.download(remote.path));
    if (backup.format === "return-visits-backup") {
      if (!backup.settings || !Array.isArray(backup.contacts)) return null;
      return normalizeRegionData(backup.settings, backup.contacts);
    }
    if (
      backup.format === "return-visits-encrypted-backup" &&
      encryptionKey &&
      cryptoMetadata?.salt &&
      backup.encryption?.salt === cryptoMetadata.salt &&
      backup.data
    ) {
      try {
        const [remoteSettings, remoteContacts] = await Promise.all([
          decryptValue(backup.data.settings, encryptionKey),
          decryptValue(backup.data.contacts, encryptionKey),
        ]);
        if (!remoteSettings || !Array.isArray(remoteContacts)) return null;
        return normalizeRegionData(remoteSettings, remoteContacts);
      } catch (error) {
        if (error instanceof NewerDataVersionError) throw error;
        return null;
      }
    }
    return null;
  };

  // Combines the Dropbox copy with this device's data. Returns null when it
  // cannot be done silently, or { uploadNeeded } once this device is merged.
  const mergeFromCloud = async (remote) => {
    const incoming = await readRemoteForMerge(remote);
    if (!incoming) return null;
    const startedAt = localChanges;
    const localDirty = localStorage.getItem(CLOUD_DIRTY_KEY) === "1";
    const combined = window.RVMerge.mergeData(
      { settings, contacts },
      incoming,
      { localDirty },
    );
    const merged = normalizeRegionData(combined.settings, combined.contacts);
    const encryptedSettings = await encryptValue(merged.settings, encryptionKey);
    const encryptedContacts = await encryptValue(merged.contacts, encryptionKey);
    if (localChanges !== startedAt) {
      throw new Error("Changes were made while syncing; trying again shortly.");
    }
    await writeStoredValues(database, [
      ["settings", encryptedSettings],
      ["contacts", encryptedContacts],
    ]);
    const uploadNeeded =
      JSON.stringify(merged.contacts) !== JSON.stringify(incoming.contacts) ||
      JSON.stringify(merged.settings) !== JSON.stringify(incoming.settings);
    settings = merged.settings;
    contacts = merged.contacts;
    resetContactSignatures();
    populateMeForm();
    document.getElementById("setting-state").value = settings.state || "";
    document.getElementById("setting-default-city").value =
      settings.defaultCity || "";
    populateDropdowns();
    renderContacts();
    localStorage.setItem(CLOUD_SEEN_KEY, String(remote.modified));
    if (uploadNeeded) localStorage.setItem(CLOUD_DIRTY_KEY, "1");
    else localStorage.removeItem(CLOUD_DIRTY_KEY);
    return { uploadNeeded };
  };

  // A copy that this device has not uploaded or restored is "newer". A device
  // connected before this check existed adopts the current copy silently.
  const remoteIsNewer = (remote) => {
    if (!remote) return false;
    const seen = Number(localStorage.getItem(CLOUD_SEEN_KEY) || 0);
    if (!seen) {
      if (localStorage.getItem(CLOUD_LAST_KEY)) {
        localStorage.setItem(CLOUD_SEEN_KEY, String(remote.modified));
        return false;
      }
      return true;
    }
    return remote.modified > seen + 1000;
  };

  let cloudBackupRunning = false;
  let cloudBackupQueued = false;
  // Combines with a newer Dropbox copy when possible, then uploads the live
  // copy, plus a dated copy at most once a day (or when forced). Throws on
  // failure, or with code "cloud-newer" when Dropbox holds a newer copy that
  // cannot be combined automatically (unless overwrite is set).
  const runCloudBackup = async ({
    forceSnapshot = false,
    overwrite = false,
    userInitiated = false,
  } = {}) => {
    if (
      localStorage.getItem(CLOUD_RECONNECT_DECISION_KEY) === "1" &&
      !userInitiated
    ) {
      return;
    }
    if (cloudBackupRunning) {
      cloudBackupQueued = true;
      return;
    }
    cloudBackupRunning = true;
    cloudBusy = true;
    refreshSyncIcon();
    try {
      let rev;
      let uploaded;
      let text;
      for (let attempt = 0; ; attempt += 1) {
        let remote = null;
        if (!overwrite) {
          remote = await getRemoteLatest();
          if (remoteIsNewer(remote)) {
            const result = await mergeFromCloud(remote);
            if (!result) {
              const newer = new Error("Dropbox has a newer backup.");
              newer.code = "cloud-newer";
              newer.remote = remote;
              throw newer;
            }
            if (!result.uploadNeeded && !forceSnapshot) {
              localStorage.setItem(CLOUD_LAST_KEY, String(Date.now()));
              cloudPaused = false;
              return;
            }
          }
        }
        rev = remote?.rev;
        localStorage.removeItem(CLOUD_DIRTY_KEY);
        text = JSON.stringify(await buildBackup(), null, 2);
        try {
          uploaded = await dropbox.upload("/latest.json", text, rev);
          break;
        } catch (error) {
          localStorage.setItem(CLOUD_DIRTY_KEY, "1");
          // Another device uploaded first: merge with it and try again.
          if (error.conflict && attempt < 2) continue;
          throw error;
        }
      }
      if (uploaded && uploaded.server_modified) {
        localStorage.setItem(
          CLOUD_SEEN_KEY,
          String(Date.parse(uploaded.server_modified)),
        );
      }
      const lastSnapshot = Number(
        localStorage.getItem(CLOUD_SNAPSHOT_KEY) || 0,
      );
      if (forceSnapshot || Date.now() - lastSnapshot >= DAY_MS) {
        const stamp = new Date().toISOString().replace(/[:.]/g, "-");
        await dropbox.upload(`/backup-${stamp}.json`, text);
        localStorage.setItem(CLOUD_SNAPSHOT_KEY, String(Date.now()));
        try {
          await pruneCloudSnapshots();
        } catch (error) {
          console.error("Unable to remove old Dropbox backups:", error);
        }
      }
      localStorage.setItem(CLOUD_LAST_KEY, String(Date.now()));
      cloudPaused = false;
      markBackupDone();
    } finally {
      cloudBackupRunning = false;
      cloudBusy = false;
      refreshSyncIcon();
      if (cloudBackupQueued) {
        cloudBackupQueued = false;
        cloudBackupHook();
      }
    }
  };

  // Never overwrite Dropbox with an empty app, for example a new phone that
  // has not restored yet.
  const autoCloudBackup = async () => {
    if (!installScreen.hidden) return false;
    if (!dropbox.isConnected() || !contacts.length) return false;
    if (localStorage.getItem(CLOUD_RECONNECT_DECISION_KEY) === "1") {
      cloudPaused = true;
      refreshSyncIcon();
      return false;
    }
    if (!navigator.onLine) {
      refreshSyncIcon();
      return false;
    }
    try {
      await runCloudBackup();
      await refreshCloudUi();
      return true;
    } catch (error) {
      if (error.code === "cloud-newer") {
        cloudPaused = true;
        refreshSyncIcon();
        setCloudStatus(
          "Automatic backup is paused because Dropbox has a backup from another device that uses a different passphrase, so it cannot be combined automatically. Tap Check for a Newer Backup to restore it, or Back Up to Dropbox Now to replace it with this device's data.",
        );
        return false;
      }
      console.error("Automatic Dropbox backup failed:", error);
      setCloudStatus(
        "The last automatic Dropbox sync did not finish. Your changes are saved on this device and it will try again.",
      );
      window.clearTimeout(cloudTimer);
      cloudTimer = window.setTimeout(() => {
        cloudTimer = null;
        autoCloudBackup();
      }, 60000);
      return false;
    }
  };

  let cloudTimer = null;
  cloudBackupHook = () => {
    localChanges += 1;
    if (!dropbox.isConnected()) return;
    localStorage.setItem(CLOUD_DIRTY_KEY, "1");
    refreshSyncIcon();
    window.clearTimeout(cloudTimer);
    cloudTimer = window.setTimeout(() => {
      cloudTimer = null;
      autoCloudBackup();
    }, 15000);
  };

  const restoreFromCloud = async (path, modified) => {
    try {
      const backup = JSON.parse(await dropbox.download(path));
      setCloudStatus("");
      if (await restoreBackupObject(backup)) {
        localStorage.setItem(CLOUD_SEEN_KEY, String(modified));
        localStorage.removeItem(CLOUD_DIRTY_KEY);
        localStorage.removeItem(CLOUD_RECONNECT_DECISION_KEY);
        cloudPaused = false;
        await refreshCloudUi();
        return true;
      }
    } catch (error) {
      setCloudStatus("");
      reportRestoreError(error);
    }
    return false;
  };

  let cloudChecking = false;
  let cloudCheckedAt = 0;
  let cloudDeclinedFor = 0;
  // Combines a newer Dropbox copy from another device into this one. Only
  // asks the user when the copy cannot be combined automatically (a different
  // passphrase). Quiet unless there is something to report (or manual is set).
  const checkCloudNewer = async ({ manual = false } = {}) => {
    if (!dropbox.isConnected() || cloudChecking || cloudBackupRunning) return;
    if (!installScreen.hidden && !manual) return;
    if (localStorage.getItem(CLOUD_RECONNECT_DECISION_KEY) === "1") {
      if (manual) await openCloudRestore();
      return;
    }
    if (!navigator.onLine) {
      refreshSyncIcon();
      if (manual) setCloudStatus("You are offline. Changes will sync when the connection returns.");
      return;
    }
    cloudChecking = true;
    cloudCheckedAt = Date.now();
    cloudBusy = true;
    refreshSyncIcon();
    if (manual) setCloudStatus("Checking Dropbox for changes…");
    try {
      const remote = await getRemoteLatest();
      if (!remoteIsNewer(remote)) {
        if (localStorage.getItem(CLOUD_DIRTY_KEY) === "1") {
          cloudBusy = false;
          await autoCloudBackup();
        }
        if (manual) setCloudStatus("This device is up to date with Dropbox.");
        return;
      }
      if (!manual && cloudDeclinedFor === remote.modified) return;
      let merged = null;
      try {
        merged = await mergeFromCloud(remote);
      } catch (error) {
        if (error instanceof NewerDataVersionError) {
          setCloudStatus(
            "The Dropbox copy was made by a newer version of the app. Update the app, then try again.",
          );
          return;
        }
        throw error;
      }
      if (merged) {
        cloudPaused = false;
        setCloudStatus(
          "Combined this device with the latest changes from Dropbox.",
        );
        if (merged.uploadNeeded) {
          cloudBusy = false;
          await autoCloudBackup();
        }
        return;
      }
      setCloudStatus("");
      const when = new Date(remote.modified).toLocaleString();
      const unsaved =
        localStorage.getItem(CLOUD_DIRTY_KEY) === "1"
          ? " This device also has changes that are not in Dropbox yet; restoring will replace them."
          : "";
      if (
        confirm(
          `Dropbox has a backup from another device (${when}) that uses a different passphrase, so it cannot be combined automatically.${unsaved} Restore it onto this device now?`,
        )
      ) {
        setCloudStatus("Downloading from Dropbox…");
        if (await restoreFromCloud(remote.path, remote.modified)) {
          cloudPaused = false;
          setCloudStatus("Restored the Dropbox backup.");
          return;
        }
      }
      cloudDeclinedFor = remote.modified;
      cloudPaused = true;
      setCloudStatus(
        "Not restored. Automatic backup stays paused until you restore, or tap Back Up to Dropbox Now to replace the Dropbox copy with this device's data.",
      );
    } catch (error) {
      console.error("Unable to check Dropbox:", error);
      if (manual) {
        setCloudStatus("Could not reach Dropbox. Check your connection.");
      }
    } finally {
      cloudChecking = false;
      cloudBusy = false;
      refreshSyncIcon();
    }
  };
  const syncNow = () => {
    if (localStorage.getItem(CLOUD_DIRTY_KEY) === "1" && contacts.length) {
      window.clearTimeout(cloudTimer);
      cloudTimer = null;
      return autoCloudBackup();
    }
    return checkCloudNewer();
  };
  window.addEventListener("online", () => {
    refreshSyncIcon();
    syncNow();
  });
  window.addEventListener("offline", refreshSyncIcon);
  // While the app is open, keep looking for changes from other devices.
  window.setInterval(() => {
    if (document.visibilityState === "visible") syncNow();
  }, 120000);
  document.getElementById("sync-status").addEventListener("click", async () => {
    await syncNow();
    alert(getSyncSummary().text);
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden" && cloudTimer) {
      window.clearTimeout(cloudTimer);
      cloudTimer = null;
      autoCloudBackup();
    } else if (
      document.visibilityState === "visible" &&
      Date.now() - cloudCheckedAt > 120000
    ) {
      syncNow();
    }
  });
  document
    .getElementById("btn-cloud-check")
    .addEventListener("click", () => checkCloudNewer({ manual: true }));

  document.getElementById("btn-cloud-begin").addEventListener("click", () => {
    document.getElementById("btn-cloud-begin").hidden = true;
    showCloudStep("cloud-question");
  });
  document.getElementById("btn-cloud-cancel-setup").addEventListener("click", () => {
    document.getElementById("btn-cloud-begin").hidden = false;
    showCloudStep("");
  });
  document
    .getElementById("btn-cloud-have")
    .addEventListener("click", () => showCloudStep("cloud-connect"));
  document
    .getElementById("btn-cloud-need")
    .addEventListener("click", () => showCloudStep("cloud-signup"));
  document
    .getElementById("btn-cloud-signup-done")
    .addEventListener("click", () => showCloudStep("cloud-connect"));
  document
    .getElementById("btn-cloud-connect")
    .addEventListener("click", async () => {
      const encryptionWarning = encryptionKey
        ? "Your Dropbox backups will be encrypted with this app's passphrase before they are uploaded. Keep that passphrase and your recovery code safe; anyone who obtains an unencrypted export or a copy made before encryption may still read it."
        : "No app passphrase is on, so backups in Dropbox will not be encrypted. Anyone who can access those Dropbox files may be able to read them. Turning on a passphrase first (Settings → Data/Security → Passphrase to Open App) is optional and will encrypt new backups; existing unencrypted Dropbox copies remain readable until you delete them.";
      if (
        !confirm(
          `Dropbox is optional. Connecting sends Nice Return Visits backups to the Dropbox folder named Return Visits in your account. ${encryptionWarning} You can also protect your Dropbox account with a strong password and two-step verification. Dropbox account or device security can still be compromised. Continue to Dropbox sign-in?`,
        )
      ) {
        return;
      }
      try {
        await dropbox.startConnect();
      } catch (error) {
        console.error(error);
        setCloudStatus("Could not start the Dropbox sign-in. Please try again.");
      }
    });

  document
    .getElementById("btn-cloud-backup-now")
    .addEventListener("click", async () => {
      const reconnectNeedsDecision =
        localStorage.getItem(CLOUD_RECONNECT_DECISION_KEY) === "1";
      if (
        reconnectNeedsDecision &&
        !confirm(
          "Dropbox already has NRV backup data. Backing up now will replace its latest copy with this device's data. Older dated copies stay in Dropbox. Continue?",
        )
      ) {
        return;
      }
      if (
        !contacts.length &&
        !confirm(
          "There are no contacts on this device. Backing up now could replace your latest Dropbox copy with an empty one. Continue?",
        )
      ) {
        return;
      }
      setCloudStatus("Backing up to Dropbox…");
      try {
        try {
          await runCloudBackup({
            forceSnapshot: true,
            overwrite: reconnectNeedsDecision,
            userInitiated: true,
          });
        } catch (error) {
          if (error.code !== "cloud-newer") throw error;
          if (
            !confirm(
              `Dropbox has a newer backup from another device (${new Date(error.remote.modified).toLocaleString()}). Replace it with this device's data? Older dated copies stay in Dropbox. Choose Cancel, then Check for a Newer Backup, to restore it instead.`,
            )
          ) {
            setCloudStatus("Not backed up. Dropbox still has the newer backup.");
            return;
          }
          await runCloudBackup({
            forceSnapshot: true,
            overwrite: true,
            userInitiated: true,
          });
        }
        localStorage.removeItem(CLOUD_RECONNECT_DECISION_KEY);
        cloudPaused = false;
        await refreshCloudUi();
        setCloudStatus("Backed up to Dropbox.");
      } catch (error) {
        console.error(error);
        setCloudStatus(
          "Could not back up to Dropbox. Check your connection and try again.",
        );
      }
    });

  document
    .getElementById("btn-cloud-disconnect")
    .addEventListener("click", async () => {
      if (
        !confirm(
          "Disconnect Dropbox? Your existing backups stay in your Dropbox, but the app will stop backing up there.",
        )
      ) {
        return;
      }
      await dropbox.disconnect();
      localStorage.removeItem(CLOUD_LAST_KEY);
      localStorage.removeItem(CLOUD_SNAPSHOT_KEY);
      localStorage.removeItem(CLOUD_SEEN_KEY);
      localStorage.removeItem(CLOUD_DIRTY_KEY);
      localStorage.removeItem(CLOUD_RECONNECT_DECISION_KEY);
      cloudPaused = false;
      setCloudStatus("Dropbox disconnected.");
      cloudChosen = false;
      document.getElementById("btn-cloud-begin").hidden = false;
      showCloudStep("");
      await refreshCloudUi();
    });

  document
    .getElementById("btn-backup-mode-switch")
    .addEventListener("click", async () => {
      if (dropbox.isConnected()) {
        document.getElementById("btn-cloud-disconnect").click();
        return;
      }
      cloudChosen = !cloudChosen;
      document.getElementById("btn-cloud-begin").hidden = false;
      showCloudStep("");
      await refreshCloudUi();
      if (cloudChosen) {
        cloudSection.open = true;
        cloudSection.scrollIntoView({ block: "nearest" });
      }
    });

  const cloudRestoreDialog = document.getElementById("cloud-restore-dialog");
  const cloudRestoreSelect = document.getElementById("cloud-restore-select");
  let cloudLatestModified = 0;
  const openCloudRestore = async () => {
    setCloudStatus("Looking for backups in Dropbox…");
    let files;
    try {
      files = await dropbox.list();
    } catch (error) {
      console.error(error);
      setCloudStatus("Could not reach Dropbox. Check your connection.");
      return;
    }
    const backups = files
      .filter((file) => /^(latest|backup-.*)\.json$/.test(file.name))
      .sort((a, b) => {
        if (a.name === "latest.json") return -1;
        if (b.name === "latest.json") return 1;
        return b.name.localeCompare(a.name);
      });
    if (!backups.length) {
      setCloudStatus("No backups were found in your Dropbox yet.");
      return;
    }
    setCloudStatus("");
    const latestFile = backups.find((file) => file.name === "latest.json");
    cloudLatestModified = latestFile ? Date.parse(latestFile.server_modified) : 0;
    cloudRestoreSelect.innerHTML = "";
    backups.forEach((file) => {
      const option = document.createElement("option");
      option.value = file.path_lower;
      const when = new Date(file.server_modified).toLocaleString();
      option.textContent =
        file.name === "latest.json" ? `Latest copy (${when})` : when;
      cloudRestoreSelect.appendChild(option);
    });
    cloudRestoreDialog.showModal();
  };
  document
    .getElementById("btn-cloud-restore")
    .addEventListener("click", openCloudRestore);
  document
    .getElementById("cancel-cloud-restore")
    .addEventListener("click", () => cloudRestoreDialog.close());
  document
    .getElementById("cloud-restore-form")
    .addEventListener("submit", async (event) => {
      event.preventDefault();
      const path = cloudRestoreSelect.value;
      cloudRestoreDialog.close();
      setCloudStatus("Downloading from Dropbox…");
      await restoreFromCloud(path, cloudLatestModified || Date.now());
    });

  const showSettingsView = () => {
    currentViewId = "settings-view";
    document
      .querySelectorAll(".view")
      .forEach((view) => view.classList.remove("active"));
    document.getElementById(currentViewId).classList.add("active");
    renderBottomNav();
  };

  // Dropbox just sent the user back after connecting (or declining).
  const finishDropboxReturn = async () => {
    const result = dropbox.takeConnectResult();
    if (!result) return;
    showSettingsView();
    cloudChosen = true;
    cloudSection.open = true;
    if (!result.ok) {
      await refreshCloudUi();
      setCloudStatus(result.message);
      cloudSection.scrollIntoView({ block: "start" });
      return;
    }
    localStorage.setItem(CLOUD_RECONNECT_DECISION_KEY, "1");
    cloudPaused = true;
    await refreshCloudUi();
    cloudSection.scrollIntoView({ block: "start" });
    if (!contacts.length) {
      try {
        const existing = (await dropbox.list()).filter((file) =>
          /^(latest|backup-.*)\.json$/.test(file.name),
        );
        if (existing.length) {
          if (
            confirm(
              "Dropbox already has NRV backup data. Do you want to choose a backup to restore onto this device now?",
            )
          ) {
            await openCloudRestore();
            return;
          }
          setCloudStatus(
            "Dropbox is connected, but automatic backup and restore are paused. Choose Restore from Dropbox, or Back Up to Dropbox Now to deliberately replace its latest copy.",
          );
          return;
        }
        localStorage.removeItem(CLOUD_RECONNECT_DECISION_KEY);
        cloudPaused = false;
      } catch (error) {
        console.error(error);
        setCloudStatus(
          "Dropbox is connected, but NRV could not check for existing backups. Automatic sync is paused until you choose Restore from Dropbox or Back Up to Dropbox Now.",
        );
        return;
      }
      setCloudStatus("Dropbox connected. Add contacts and they will be backed up.");
      return;
    }
    setCloudStatus("Dropbox connected. Checking for an existing backup…");
    try {
      const remote = await getRemoteLatest();
      let overwrite = false;
      if (remote) {
        const when = new Date(remote.modified).toLocaleString();
        if (
          confirm(
            `Dropbox already has a backup (${when}). Restore it onto this device? That replaces the ${contacts.length} contacts here.`,
          )
        ) {
          await openCloudRestore();
          return;
        }
        if (
          !confirm(
            "Back up this device to Dropbox instead? That replaces the latest Dropbox copy with this device's data. Older dated copies stay.",
          )
        ) {
          setCloudStatus(
            "Dropbox connected. Nothing was backed up. Use Restore from Dropbox or Back Up to Dropbox Now when you are ready.",
          );
          return;
        }
        overwrite = true;
      }
      setCloudStatus("Dropbox connected. Making your first backup…");
      await runCloudBackup({
        forceSnapshot: true,
        overwrite,
        userInitiated: true,
      });
      localStorage.removeItem(CLOUD_RECONNECT_DECISION_KEY);
      cloudPaused = false;
      await refreshCloudUi();
      setCloudStatus("Dropbox connected and your first backup is saved.");
    } catch (error) {
      console.error(error);
      setCloudStatus(
        "Dropbox connected, but the first backup did not finish. Tap Back Up to Dropbox Now.",
      );
    }
  };

  refreshCloudUi();

  renderContacts();
  const installScreen = document.getElementById("install-screen");
  // mode: "existing" (prior state found), "install" (new working copy)
  const showInstallScreen = (mode) => {
    const appContainer = document.getElementById("app-container");
    appContainer.hidden = true;
    appContainer.inert = true;
    appContainer.setAttribute("aria-hidden", "true");
    const step2 = document.getElementById("setup-wizard-step-2");
    document.getElementById("setup-existing-data").hidden = mode !== "existing";
    document.getElementById("setup-wizard-step-1").hidden =
      mode !== "install" || !step2.hidden;
    if (mode !== "install") step2.hidden = true;
    document.getElementById("setup-wizard-progress").hidden = mode !== "install";
    const name = "NRV-Install";
    document.getElementById("install-screen-title").textContent = name;
    document.title = name;
    installScreen.hidden = false;
  };
  const eraseAllData = async () => {
    try {
      database.close();
      await new Promise((resolve, reject) => {
        const request = indexedDB.deleteDatabase("return-visits-app");
        request.onsuccess = resolve;
        request.onerror = () =>
          reject(request.error || new Error("Database deletion failed."));
        request.onblocked = () =>
          reject(
            new Error(
              "The database is still open in another NRV window or browser tab.",
            ),
          );
      });
      localStorage.clear();
      sessionStorage.clear();
      if (localStorage.length !== 0 || sessionStorage.length !== 0) {
        throw new Error("Some NRV storage choices could not be cleared.");
      }
      window.location.reload();
    } catch (error) {
      console.error("Unable to erase app data:", error);
      alert(
        `NRV could not verify a complete erase. No fresh start was confirmed. ${error.message || "Close other NRV windows or tabs, reload, and try again."}`,
      );
    }
  };
  const confirmEraseAllData = () => {
    if (
      !confirm(
        "Before erasing, create or verify a current backup and keep a separate recovery copy outside NRV's normal storage and Dropbox app folder. This removes contacts, settings, passphrase/security data, setup choices, and Dropbox connection state from this app copy. Downloaded backup files and Dropbox backups are not deleted. Continue?",
      )
    ) {
      return;
    }
    if (!confirm("Last check: erase this NRV working copy and start fresh?")) return;
    void eraseAllData();
  };
  document
    .getElementById("btn-erase-all-data")
    .addEventListener("click", confirmEraseAllData);
  document
    .getElementById("btn-install-start-new")
    .addEventListener("click", confirmEraseAllData);
  document
    .getElementById("btn-install-open-existing")
    .addEventListener("click", () =>
      document.getElementById("btn-setup-wizard-skip").click(),
    );
  const installRestoreInput = document.getElementById(
    "install-backup-file-input",
  );
  document
    .getElementById("btn-install-restore")
    .addEventListener("click", () => installRestoreInput.click());
  installRestoreInput.addEventListener("change", async () => {
    const file = installRestoreInput.files[0];
    installRestoreInput.value = "";
    if (!file) return;
    if (await restoreBackupFile(file)) {
      document.getElementById("btn-setup-wizard-skip").click();
    }
  });
  let setupDoneFlag = false;
  try {
    setupDoneFlag =
      localStorage.getItem(INSTALLED_SETUP_COMPLETE_KEY) === "true";
  } catch (error) {
    console.error("Unable to read the installed-app setup status:", error);
  }
  if (restoredFromBackup) {
    markInstalledSetupComplete();
    installScreen.hidden = true;
  } else if (existingStateDetected && !setupDoneFlag) {
    showInstallScreen("existing");
  } else if (contacts.length > 0 || setupDoneFlag) {
    if (contacts.length > 0) markInstalledSetupComplete();
    installScreen.hidden = true;
  } else {
    let setupComplete = false;
    let setupPending = false;
    let previousOnboardingDismissed = false;
    try {
      setupComplete =
        localStorage.getItem(INSTALLED_SETUP_COMPLETE_KEY) === "true";
      setupPending =
        localStorage.getItem("return_visits_setup_pending") === "true";
      previousOnboardingDismissed =
        localStorage.getItem("return_visits_onboarding_v2_dismissed") ===
        "true";
    } catch (error) {
      console.error("Unable to read the installed-app setup status:", error);
    }
    if (
      isInstalledApp() &&
      !setupComplete &&
      (!previousOnboardingDismissed || setupPending)
    ) {
      showInstallScreen("install");
    } else {
      installScreen.hidden = true;
    }
  }
  // Remind after 10 days without a backup, at most once a day. Only a
  // successful backup resets the count.
  const REMIND_AFTER_DAYS = 10;
  let lastBackupAt = Number(localStorage.getItem(LAST_BACKUP_KEY) || 0);
  if (!lastBackupAt || !contacts.length) {
    lastBackupAt =
      Number(localStorage.getItem("return_visits_last_backup_reminder") || 0) ||
      Date.now();
    if (!contacts.length) lastBackupAt = Date.now();
    localStorage.setItem(LAST_BACKUP_KEY, String(lastBackupAt));
  }
  const checkBackupReminder = async () => {
    if (
      dropbox.isConnected() &&
      contacts.length &&
      Date.now() - Number(localStorage.getItem(CLOUD_LAST_KEY) || 0) >= DAY_MS
    ) {
      await autoCloudBackup();
    }
    const lastAt = Number(localStorage.getItem(LAST_BACKUP_KEY) || 0);
    const days = Math.floor((Date.now() - lastAt) / DAY_MS);
    const today = new Date().toDateString();
    if (
      days < REMIND_AFTER_DAYS ||
      localStorage.getItem(LAST_BACKUP_PROMPT_KEY) === today
    ) {
      return;
    }
    localStorage.setItem(LAST_BACKUP_PROMPT_KEY, today);
    if (
      !confirm(
        `You haven't backed up in ${days} days. Back up now?`,
      )
    ) {
      return;
    }
    if (dropbox.isConnected()) {
      if (localStorage.getItem(CLOUD_RECONNECT_DECISION_KEY) === "1") {
        showSettingsView();
        cloudSection.open = true;
        setCloudStatus(
          "Automatic Dropbox sync is paused until you choose to restore the existing backup or deliberately replace it.",
        );
        cloudSection.scrollIntoView({ block: "start" });
        return;
      }
      try {
        await runCloudBackup({
          forceSnapshot: true,
          userInitiated: true,
        });
        await refreshCloudUi();
        alert("Backed up to Dropbox.");
      } catch (error) {
        console.error(error);
        alert("Could not back up to Dropbox. Check your connection and try again.");
      }
      return;
    }
    showSettingsView();
    const backupSection = document
      .getElementById("btn-export-backup")
      .closest("details");
    backupSection.open = true;
    backupSection.scrollIntoView({ block: "start" });
  };
  window.setTimeout(async () => {
    await finishDropboxReturn();
    if (installScreen.hidden) {
      await checkCloudNewer();
      await checkBackupReminder();
    }
  }, 500);
};

document.addEventListener("DOMContentLoaded", () => {
  const installBanner = document.getElementById("install-screen");
  const installBannerKey = "return_visits_onboarding_v2_dismissed";
  const setupPendingKey = "return_visits_setup_pending";
  const wizardStepKey = "return_visits_first_run_wizard_step_v2";
  let setupPending = false;
  let wizardStep = 1;
  try {
    setupPending = localStorage.getItem(setupPendingKey) === "true";
    const savedWizardStep = Number(localStorage.getItem(wizardStepKey));
    if (savedWizardStep === 2) wizardStep = savedWizardStep;
  } catch (error) {
    console.error("Unable to read the install setup status:", error);
  }
  installBanner.hidden = true;
  document.getElementById("setup-next-steps-notice").hidden = !setupPending;

  const deviceTypeSelect = document.getElementById("setup-device-type");
  const deviceSystemSelect = document.getElementById("setup-device-system");
  const deviceBrowserSelect = document.getElementById("setup-device-browser");
  const bookmarkInstructions = document.getElementById(
    "setup-bookmark-instructions",
  );
  const deviceSystems = {
    phone: [
      { value: "ios", label: "iPhone or iPad" },
      { value: "android", label: "Android" },
      { value: "other-mobile", label: "Another phone or tablet" },
    ],
    computer: [
      { value: "windows", label: "Windows" },
      { value: "mac", label: "Mac" },
      { value: "chromeos", label: "Chromebook" },
      { value: "other-computer", label: "Another computer" },
    ],
  };
  const getDeviceHint = () => {
    const userAgent = navigator.userAgent || "";
    if (
      /iPad|iPhone|iPod/i.test(userAgent) ||
      (/Macintosh/i.test(userAgent) && navigator.maxTouchPoints > 1)
    ) {
      return { type: "phone", system: "ios" };
    }
    if (/Android/i.test(userAgent)) {
      return { type: "phone", system: "android" };
    }
    if (/CrOS/i.test(userAgent)) {
      return { type: "computer", system: "chromeos" };
    }
    if (/Windows/i.test(userAgent)) {
      return { type: "computer", system: "windows" };
    }
    if (/Macintosh|Mac OS/i.test(userAgent)) {
      return { type: "computer", system: "mac" };
    }
    return { type: "computer", system: "other-computer" };
  };
  const getBrowserHint = (system) => {
    const userAgent = navigator.userAgent || "";
    if (/SamsungBrowser/i.test(userAgent)) return "samsung";
    if (/Edg|EdgiOS|EdgA/i.test(userAgent)) return "edge";
    if (/FxiOS|Firefox/i.test(userAgent)) return "firefox";
    if (/CriOS|Chrome|Chromium/i.test(userAgent)) return "chrome";
    if (/Safari/i.test(userAgent) || system === "ios" || system === "mac") {
      return "safari";
    }
    return "other";
  };
  const getBrowserChoices = (system) => {
    if (system === "ios") {
      return [
        { value: "safari", label: "Safari" },
        { value: "chrome", label: "Chrome" },
        { value: "firefox", label: "Firefox" },
        { value: "edge", label: "Microsoft Edge" },
        { value: "other", label: "Another browser" },
      ];
    }
    if (system === "android") {
      return [
        { value: "chrome", label: "Chrome" },
        { value: "samsung", label: "Samsung Internet" },
        { value: "firefox", label: "Firefox" },
        { value: "edge", label: "Microsoft Edge" },
        { value: "other", label: "Another browser" },
      ];
    }
    if (system === "mac") {
      return [
        { value: "safari", label: "Safari" },
        { value: "chrome", label: "Chrome" },
        { value: "edge", label: "Microsoft Edge" },
        { value: "firefox", label: "Firefox" },
        { value: "other", label: "Another browser" },
      ];
    }
    return [
      { value: "chrome", label: "Chrome" },
      { value: "edge", label: "Microsoft Edge" },
      { value: "firefox", label: "Firefox" },
      { value: "other", label: "Another browser" },
    ];
  };
  const setSelectOptions = (select, options, selectedValue) => {
    select.replaceChildren(
      ...options.map((option) => {
        const element = document.createElement("option");
        element.value = option.value;
        element.textContent = option.label;
        return element;
      }),
    );
    select.value = options.some((option) => option.value === selectedValue)
      ? selectedValue
      : options[0].value;
  };
  const getBookmarkSteps = (system, browser) => {
    if (system === "ios" && browser === "safari") {
      return [
        "Tap the Share button (the square with an arrow pointing up).",
        "In the menu, tap Add Bookmark. Scroll the menu if you do not see it.",
        "Tap Save. The bookmark is now in Safari.",
      ];
    }
    if (system === "ios" && browser === "chrome") {
      return [
        "Tap the three-dot menu in Chrome.",
        "Tap Add to Bookmarks (look for the star).",
        "If asked, tap Save or Done.",
      ];
    }
    if (system === "android" && browser === "chrome") {
      return [
        "Tap the three-dot menu near the top of Chrome.",
        "Tap the star or Add to bookmarks.",
        "The bookmark is saved in Chrome.",
      ];
    }
    if (system === "android" && browser === "samsung") {
      return [
        "Tap the browser menu (usually three lines or three dots).",
        "Choose Add page to, then Bookmarks (or tap the star).",
        "If asked, tap Save or Done.",
      ];
    }
    if (system === "ios" || system === "android" || system === "other-mobile") {
      return [
        "Open this browser's menu or Share button.",
        "Choose Bookmark, Add Bookmark, or the star icon.",
        "Tap Save or Done if the browser asks.",
      ];
    }
    const shortcut = system === "mac" ? "Command + D" : "Ctrl + D";
    if (browser === "safari" && system === "mac") {
      return [
        `Press ${shortcut}, or choose Bookmarks in the menu bar.`,
        "Choose Add Bookmark.",
        "Choose where to save it, then click Add.",
      ];
    }
    return [
      `Press ${shortcut}. In most browsers, you can also select the star near the address bar.`,
      "If a small box opens, choose where to save this page.",
      "Select Done, Save, or Add.",
    ];
  };
  const updateBookmarkInstructions = () => {
    const steps = getBookmarkSteps(
      deviceSystemSelect.value,
      deviceBrowserSelect.value,
    );
    bookmarkInstructions.replaceChildren();
    const intro = document.createElement("p");
    intro.textContent = "In this browser:";
    const list = document.createElement("ol");
    steps.forEach((step) => {
      const item = document.createElement("li");
      item.textContent = step;
      list.appendChild(item);
    });
    bookmarkInstructions.append(intro, list);
  };
  const setDeviceSystem = (system) => {
    const deviceType = deviceTypeSelect.value;
    setSelectOptions(deviceSystemSelect, deviceSystems[deviceType], system);
    const browserChoices = getBrowserChoices(deviceSystemSelect.value);
    setSelectOptions(
      deviceBrowserSelect,
      browserChoices,
      getBrowserHint(deviceSystemSelect.value),
    );
    updateBookmarkInstructions();
  };
  const deviceHint = getDeviceHint();
  deviceTypeSelect.value = deviceHint.type;
  setDeviceSystem(deviceHint.system);
  deviceTypeSelect.addEventListener("change", () => {
    setDeviceSystem(deviceSystems[deviceTypeSelect.value][0].value);
  });
  deviceSystemSelect.addEventListener("change", () => {
    const browserChoices = getBrowserChoices(deviceSystemSelect.value);
    setSelectOptions(
      deviceBrowserSelect,
      browserChoices,
      getBrowserHint(deviceSystemSelect.value),
    );
    updateBookmarkInstructions();
  });
  deviceBrowserSelect.addEventListener("change", updateBookmarkInstructions);

  const showWizardStep = (step, shouldFocus = false) => {
    wizardStep = step;
    document.getElementById("setup-wizard-step-1").hidden = step !== 1;
    document.getElementById("setup-wizard-step-2").hidden = step !== 2;
    document.getElementById("setup-wizard-progress").textContent =
      `Step ${step} of 2: ${
        step === 1 ? "Welcome" : "Choose your setup"
      }`;
    if (shouldFocus && !installBanner.hidden) {
      document
        .querySelector(`#setup-wizard-step-${step} h2`)
        .focus({ preventScroll: true });
    }
  };
  showWizardStep(wizardStep);

  const goToView = (viewId) => {
    const navButton = Array.from(
      document.querySelectorAll("#bottom-nav .nav-btn"),
    ).find((button) =>
      button.title.toLowerCase().startsWith(viewId.replace("-view", "")),
    );
    navButton?.click();
  };
  const startSetup = () => {
    installBanner.hidden = true;
    try {
      localStorage.setItem(installBannerKey, "true");
      localStorage.setItem(setupPendingKey, "true");
      localStorage.removeItem(wizardStepKey);
    } catch (error) {
      console.error("Unable to save the setup status:", error);
      alert(
        "We could not save your setup progress. Please check device storage and try again.",
      );
      installBanner.hidden = false;
      return false;
    }
    const appContainer = document.getElementById("app-container");
    appContainer.hidden = false;
    appContainer.inert = false;
    appContainer.setAttribute("aria-hidden", "false");
    document.body.classList.add("install-setup-in-progress");
    document.getElementById("setup-next-steps-notice").hidden = false;
    goToView("settings-view");
    const defaults = document.getElementById("defaults-your-details-section");
    defaults.open = true;
    defaults.scrollIntoView({ block: "start" });
    return true;
  };
  document
    .getElementById("btn-setup-passphrase")
    .addEventListener("click", () => {
      if (!startSetup()) return;
      openSettingsSection("passphrase-section");
      window.setTimeout(() => {
        document.getElementById("choices-section").open = true;
        document.getElementById("passphrase-section").open = true;
      }, 0);
    });
  const skipSetup = () => {
    if (!markInstalledSetupComplete()) {
      alert(
        "We could not save your setup progress on this device. Check device storage and try again.",
      );
      return;
    }
    try {
      localStorage.setItem(installBannerKey, "true");
      localStorage.removeItem(setupPendingKey);
      localStorage.removeItem(wizardStepKey);
    } catch (error) {
      console.error("Unable to save the setup status:", error);
    }
    installBanner.hidden = true;
    const appContainer = document.getElementById("app-container");
    appContainer.hidden = false;
    appContainer.inert = false;
    appContainer.setAttribute("aria-hidden", "false");
    document.getElementById("setup-next-steps-notice").hidden = true;
    document.body.classList.remove("install-setup-in-progress");
    document.title = "NRV - Contacts";
    document.getElementById("app-title").textContent = "NRV - Contacts";
    goToView("contacts-view");
  };
  const continueWizard = () => {
    try {
      localStorage.setItem(wizardStepKey, "2");
    } catch (error) {
      console.error("Unable to save the setup walkthrough progress:", error);
    }
    showWizardStep(2, true);
  };
  const openSettingsSection = (sectionId) => {
    goToView("settings-view");
    const section = document.getElementById(sectionId);
    let ancestor = section.parentElement;
    while (ancestor) {
      if (ancestor.matches("details.settings-section")) {
        ancestor.open = true;
      }
      ancestor = ancestor.parentElement;
    }
    section.open = true;
    section.scrollIntoView({ block: "start" });
  };
  const finishSetup = () => {
    if (!markInstalledSetupComplete()) {
      alert(
        "We could not save your setup progress on this device. Check device storage and try again.",
      );
      return;
    }
    try {
      localStorage.setItem(installBannerKey, "true");
      localStorage.removeItem(setupPendingKey);
    } catch (error) {
      console.error("Unable to save the setup status:", error);
    }
    document.getElementById("setup-next-steps-notice").hidden = true;
    document.body.classList.remove("install-setup-in-progress");
    goToView("contacts-view");
  };
  document
    .getElementById("btn-setup-wizard-next")
    .addEventListener("click", continueWizard);
  document
    .getElementById("btn-setup-wizard-skip-icon")
    .addEventListener("click", continueWizard);
  document
    .getElementById("btn-setup-wizard-skip")
    .addEventListener("click", skipSetup);
  document
    .getElementById("btn-dismiss-install-banner")
    .addEventListener("click", startSetup);
  document
    .getElementById("btn-setup-locations")
    .addEventListener("click", () => openSettingsSection("locations-section"));
  document
    .getElementById("btn-setup-finish")
    .addEventListener("click", finishSetup);
});

const updateStorageProtectionStatus = async () => {
  const statusEl = document.getElementById("storage-protection-status");
  if (!statusEl) return;
  if (!navigator.storage?.persist) {
    statusEl.textContent =
      "Storage protection: not supported by this browser. Keep regular backups.";
    return;
  }
  try {
    const granted =
      (await navigator.storage.persisted()) ||
      (await navigator.storage.persist());
    statusEl.textContent = granted
      ? "Storage protection: on. Your browser will not clear your contacts to free space. Backups are still recommended."
      : "Storage protection: not granted by this browser. Your contacts could be cleared if the device runs low on space, so keep regular backups.";
  } catch (error) {
    console.error("Unable to request persistent storage:", error);
    statusEl.textContent =
      "Storage protection: could not be checked. Keep regular backups.";
  }
};

document.addEventListener("DOMContentLoaded", () => {
  initializeApp()
    .then(() => {
      updateStorageProtectionStatus();
      appReadyForUpdates = true;
      showJustUpdatedNotice();
      if (appUpdateAvailable) appUpdatePromptHandler();
    })
    .catch((error) => {
      console.error("Unable to start the app:", error);
      if (error instanceof NewerDataVersionError) {
        alert(error.message);
        appReadyForUpdates = true;
        if (appUpdateAvailable) appUpdatePromptHandler();
        return;
      }
      alert(
        "NRV could not open and verify its storage. Private Safari use is unsupported: close the Private tab and reopen NRV in normal Safari, then install and open NRV from its Home Screen icon. Nothing has been deleted.",
      );
    });
});

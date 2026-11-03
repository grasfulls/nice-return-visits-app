// Combines this device's data with a copy from Dropbox so edits made on two
// devices are both kept. Pure functions: no storage, no network.
(function (root) {
  const time = (value) => {
    const parsed = Date.parse(value || "");
    return Number.isFinite(parsed) ? parsed : 0;
  };
  const noteKey = (note) =>
    note.id ? String(note.id) : `${note.rawDate || note.date || ""}|${note.text || ""}`;

  const unionBy = (lists, keyOf) => {
    const seen = new Map();
    lists.forEach((list) =>
      (Array.isArray(list) ? list : []).forEach((item) => {
        const key = keyOf(item);
        if (!seen.has(key)) seen.set(key, item);
      }),
    );
    return Array.from(seen.values());
  };

  // Deleted ids with the latest deletion time seen on either side.
  const mergeTombstones = (a, b) => {
    const latest = new Map();
    [a, b].forEach((list) =>
      (Array.isArray(list) ? list : []).forEach((entry) => {
        if (!entry || entry.id === undefined) return;
        const key = String(entry.id);
        const current = latest.get(key);
        if (!current || time(entry.deletedAt) > time(current.deletedAt)) {
          latest.set(key, entry);
        }
      }),
    );
    return Array.from(latest.values());
  };

  const mergeContact = (local, remote) => {
    const remoteWins = time(remote.updatedAt) > time(local.updatedAt);
    const winner = remoteWins ? remote : local;
    const loser = remoteWins ? local : remote;
    const deletedNotes = mergeTombstones(
      local.deletedNotes,
      remote.deletedNotes,
    );
    const deletedKeys = new Set(deletedNotes.map((entry) => String(entry.id)));
    const notes = unionBy(
      [winner.notesHistory, loser.notesHistory],
      noteKey,
    ).filter((note) => !deletedKeys.has(noteKey(note)));
    const merged = { ...winner };
    if (notes.length || winner.notesHistory || loser.notesHistory) {
      merged.notesHistory = notes;
    }
    if (deletedNotes.length) merged.deletedNotes = deletedNotes;
    merged.updatedAt = new Date(
      Math.max(time(local.updatedAt), time(remote.updatedAt)),
    ).toISOString();
    return merged;
  };

  // settings: scalar values come from this device when it has unsent changes,
  // otherwise from Dropbox. Location lists are combined.
  const mergeData = (local, remote, { localDirty = false } = {}) => {
    const localSettings = local.settings || {};
    const remoteSettings = remote.settings || {};
    const tombstones = mergeTombstones(
      localSettings.deletedContacts,
      remoteSettings.deletedContacts,
    );
    const deletedAt = new Map(
      tombstones.map((entry) => [String(entry.id), time(entry.deletedAt)]),
    );

    const byId = new Map();
    (remote.contacts || []).forEach((contact) =>
      byId.set(String(contact.id), contact),
    );
    const contacts = [];
    const seen = new Set();
    (local.contacts || []).forEach((contact) => {
      const key = String(contact.id);
      if (seen.has(key)) return;
      seen.add(key);
      contacts.push(
        byId.has(key) ? mergeContact(contact, byId.get(key)) : contact,
      );
    });
    (remote.contacts || []).forEach((contact) => {
      const key = String(contact.id);
      if (seen.has(key)) return;
      seen.add(key);
      contacts.push(contact);
    });
    const kept = contacts.filter((contact) => {
      const removed = deletedAt.get(String(contact.id));
      return removed === undefined || time(contact.updatedAt) > removed;
    });

    const base = localDirty ? localSettings : remoteSettings;
    const settings = { ...base };
    settings.cities = unionBy(
      [localSettings.cities, remoteSettings.cities],
      (city) => String(city),
    );
    settings.countries = unionBy(
      [localSettings.countries, remoteSettings.countries],
      (country) => String(country).toLowerCase(),
    );
    settings.regions = unionBy(
      [localSettings.regions, remoteSettings.regions],
      (item) => JSON.stringify([item.city, item.name]),
    );
    settings.areas = unionBy(
      [localSettings.areas, remoteSettings.areas],
      (item) => JSON.stringify([item.city, item.name]),
    );
    settings.deletedContacts = tombstones;

    const localTime = localSettings.timeTracking || {};
    const remoteTime = remoteSettings.timeTracking || {};
    const baseTime = base.timeTracking || {};
    if (baseTime.enabled) {
      const deleted = unionBy(
        [localTime.deleted, remoteTime.deleted],
        (id) => String(id),
      );
      const gone = new Set(deleted.map(String));
      const baseIsLocal = base === localSettings;
      settings.timeTracking = {
        ...baseTime,
        entries: unionBy(
          baseIsLocal
            ? [localTime.entries, remoteTime.entries]
            : [remoteTime.entries, localTime.entries],
          (entry) => String(entry.id),
        ).filter((entry) => !gone.has(String(entry.id))),
        deleted,
      };
    }
    return { settings, contacts: kept };
  };

  const api = { mergeData, mergeContact };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.RVMerge = api;
})(typeof window !== "undefined" ? window : globalThis);

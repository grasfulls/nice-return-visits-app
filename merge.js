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

  const mergeGoal = (local, remote) => {
    const remoteWins = time(remote.updatedAt) > time(local.updatedAt);
    const winner = remoteWins ? remote : local;
    const configuration = time(remote.itemsUpdatedAt) > time(local.itemsUpdatedAt) ? remote : local;
    const selectedItems = time(configuration.itemsUpdatedAt)
      ? configuration.items || []
      : unionBy([winner.items, remoteWins ? local.items : remote.items], (item) => String(item.id));
    const items = selectedItems.map((item) => {
      const localItem = (local.items || []).find(
        (candidate) => String(candidate.id) === String(item.id),
      );
      const remoteItem = (remote.items || []).find(
        (candidate) => String(candidate.id) === String(item.id),
      );
      const localChange = time(localItem?.completionChangedAt);
      const remoteChange = time(remoteItem?.completionChangedAt);
      const explicitChange = Math.max(localChange, remoteChange);
      const completionWinner = explicitChange &&
        explicitChange >= Math.max(time(localItem?.completedAt), time(remoteItem?.completedAt))
        ? localChange >= remoteChange ? localItem : remoteItem
        : null;
      const completedItem =
        localItem?.completed && remoteItem?.completed
          ? {
              ...(time(localItem.completedAt) <= time(remoteItem.completedAt)
                ? localItem
                : remoteItem),
            }
          : localItem?.completed
            ? localItem
            : remoteItem?.completed
              ? remoteItem
              : item;
      return {
        ...completedItem,
        ...item,
        completed: completionWinner
          ? completionWinner.completed === true
          : Boolean(localItem?.completed || remoteItem?.completed),
        completedAt: completionWinner
          ? completionWinner.completedAt || null
          : completedItem.completedAt || null,
        ...(explicitChange
          ? { completionChangedAt: new Date(explicitChange).toISOString() }
          : {}),
      };
    });
    const achieved = items.length > 0 && items.every((item) => item.completed);
    const merged = {
      ...winner,
      ...(time(configuration.itemsUpdatedAt)
        ? Object.fromEntries([
            "itemsUpdatedAt", "pathName", "type", "frequency", "periodDays",
            "durationMinutes", "dayDurations",
          ].map((key) => [key, configuration[key]]))
        : {}),
      items,
      status: achieved ? "achieved" : winner.status,
      updatedAt: new Date(
        Math.max(time(local.updatedAt), time(remote.updatedAt)),
      ).toISOString(),
    };
    if (achieved) {
      const completionDates = items
        .map((item) => time(item.completedAt))
        .filter(Boolean);
      merged.achievedAt = new Date(
        Math.max(...completionDates, time(local.achievedAt), time(remote.achievedAt)),
      ).toISOString();
    } else {
      delete merged.achievedAt;
      if (merged.status === "achieved") {
        merged.status = merged.periodEndsAt && time(merged.periodEndsAt) <= Date.now()
          ? "review" : "active";
      }
    }
    return merged;
  };

  const mergeGoalsAndMilestones = (local, remote, base) => {
    const localGoals = local.goalsAndMilestones || {};
    const remoteGoals = remote.goalsAndMilestones || {};
    const baseGoals = base.goalsAndMilestones || {};
    const deletedGoalIds = unionBy(
      [localGoals.deletedGoalIds, remoteGoals.deletedGoalIds],
      (id) => String(id),
    );
    const deleted = new Set(deletedGoalIds.map(String));
    const goals = unionBy(
      [baseGoals.goals, base === local ? remoteGoals.goals : localGoals.goals],
      (goal) => String(goal.id),
    ).filter((goal) => !deleted.has(String(goal.id)))
      .map((goal) => {
        const localGoal = (localGoals.goals || []).find(
          (candidate) => String(candidate.id) === String(goal.id),
        );
        const remoteGoal = (remoteGoals.goals || []).find(
          (candidate) => String(candidate.id) === String(goal.id),
        );
        return localGoal && remoteGoal
          ? mergeGoal(localGoal, remoteGoal)
          : goal;
      });
    const acknowledgements = [
      localGoals.latestAcknowledgement,
      remoteGoals.latestAcknowledgement,
    ].filter(Boolean);
    const latestAcknowledgement = acknowledgements.sort(
      (a, b) => time(b.at) - time(a.at),
    )[0] || null;
    return {
      ...baseGoals,
      encouragementEnabled: baseGoals.encouragementEnabled !== false,
      goals,
      deletedGoalIds,
      latestAcknowledgement,
    };
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
    // Cities, regions and areas are {name, country} records; legacy strings
    // and {name, city} pairs may still arrive from old backups and are kept
    // distinct here so normalizeRegionData can migrate them afterward.
    const locationKey = (item) =>
      typeof item === "string"
        ? JSON.stringify(["", item.toLowerCase()])
        : JSON.stringify([
            String(item?.country || item?.city || "").toLowerCase(),
            String(item?.name || "").toLowerCase(),
          ]);
    settings.cities = unionBy(
      [localSettings.cities, remoteSettings.cities],
      locationKey,
    );
    settings.countries = unionBy(
      [localSettings.countries, remoteSettings.countries],
      (country) => String(country).toLowerCase(),
    );
    settings.regions = unionBy(
      [localSettings.regions, remoteSettings.regions],
      locationKey,
    );
    settings.areas = unionBy(
      [localSettings.areas, remoteSettings.areas],
      locationKey,
    );
    settings.deletedContacts = tombstones;
    settings.goalsAndMilestones = mergeGoalsAndMilestones(
      localSettings,
      remoteSettings,
      base,
    );

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

  const api = { mergeData, mergeContact, mergeGoal, mergeGoalsAndMilestones };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.RVMerge = api;
})(typeof window !== "undefined" ? window : globalThis);

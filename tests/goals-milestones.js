// Run with: node tests/goals-milestones.js
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const merge = require("../merge.js");

const root = path.join(__dirname, "..");
const source = fs.readFileSync(path.join(root, "app.js"), "utf8");
const declaration = (name) => {
  const start = source.indexOf(`const ${name} =`);
  assert.notStrictEqual(start, -1, `${name} exists`);
  const nextConst = source.indexOf("\nconst ", start + 1);
  const nextClass = source.indexOf("\nclass ", start + 1);
  const endings = [nextConst, nextClass].filter((index) => index !== -1);
  return source.slice(start, endings.length ? Math.min(...endings) : source.length).trim();
};

const context = { EPOCH_TIMESTAMP: "1970-01-01T00:00:00.000Z" };
const declarations = [
  "GOAL_PATHS",
  "GOAL_METHODS",
  "GOAL_ITEM_KEYS",
  "goalItemKey",
  "normalizeGoalsAndMilestones",
  "getGoalProgress",
].map(declaration).join("\n");
vm.runInNewContext(
  `${declarations}\nthis.goalHelpers = { GOAL_PATHS, GOAL_METHODS, GOAL_ITEM_KEYS, normalizeGoalsAndMilestones, getGoalProgress };`,
  context,
);
const { GOAL_PATHS, normalizeGoalsAndMilestones, getGoalProgress } =
  context.goalHelpers;

assert.deepStrictEqual(
  JSON.parse(
    JSON.stringify(
      Object.entries(GOAL_PATHS)
        .filter(([_id, path]) => path.selectable !== false)
        .map(([id]) => id),
    ),
  ),
  [
    "beginMinistry",
    "participate",
    "auxiliary",
    "regular",
    "returnVisits",
    "informal",
    "skills",
    "needGreater",
    "unassigned",
  ],
  "all users receive the same nine ordered standard paths",
);
assert.strictEqual(GOAL_PATHS.seldomWorked.selectable, false);
assert.deepStrictEqual(
  JSON.parse(JSON.stringify(context.goalHelpers.GOAL_PATHS.beginMinistry.items)),
  [
    "participateAspect",
    "startConversationDoor",
    "shareThought",
    "participateAgain",
    "chooseRegularGoal",
  ],
);
assert.deepStrictEqual(
  JSON.parse(JSON.stringify(Object.keys(context.goalHelpers.GOAL_METHODS))),
  [
    "doorToDoor",
    "letterWriting",
    "telephone",
    "public",
    "smpw",
    "informal",
    "other",
  ],
);

const normalized = normalizeGoalsAndMilestones({
  encouragementEnabled: false,
  goals: [
    {
      id: "partial",
      pathId: "returnVisits",
      type: "target",
      status: "active",
      items: [
        { id: "one", key: "planFollowUp", completed: true, completedAt: "2026-02-01T10:00:00.000Z" },
        { id: "two", key: "prepareQuestion", completed: false },
        { id: "three", key: "recordOutcome", completed: false },
        { id: "four", key: "reviewStudy", completed: false },
      ],
      createdAt: "2026-02-01T00:00:00.000Z",
      updatedAt: "2026-02-01T10:00:00.000Z",
    },
    {
      id: "paused",
      pathId: "custom",
      pathName: "My plan",
      type: "custom",
      status: "paused",
      pausedFromStatus: "review",
      pausedRemainingMs: 1200,
      periodEndedAt: "2026-02-02T00:00:00.000Z",
      dayDurations: { mon: 60 },
      items: [
        { id: "step", customText: "Review", completed: true, completedAt: "2026-02-01T00:00:00.000Z" },
        { id: "duration-mon", key: "durationDay", durationDay: "mon", durationMinutes: 60 },
      ],
    },
    {
      id: "beginner",
      pathId: "beginMinistry",
      type: "target",
      items: [{
        id: "participateAspect",
        key: "participateAspect",
        selectedMethods: ["doorToDoor", "smpw", "invalid"],
        methodOtherText: "A local option",
      }],
    },
    {
      id: "achieved",
      pathId: "unassigned",
      type: "repeatable",
      status: "active",
      items: [{ id: "one", key: "chooseTerritory", completed: true, completedAt: "2026-02-03T00:00:00.000Z" }],
    },
  ],
  deletedGoalIds: ["removed", "removed"],
  latestAcknowledgement: {
    id: "ack-1",
    goalId: "partial",
    kind: "milestone",
    pathId: "returnVisits",
    itemKey: "planFollowUp",
    count: 1,
    total: 4,
    dismissed: false,
    at: "2026-02-01T10:00:00.000Z",
  },
});
const data = JSON.parse(JSON.stringify(normalized));
assert.strictEqual(data.encouragementEnabled, false);
assert.deepStrictEqual(data.deletedGoalIds, ["removed"]);
assert.strictEqual(data.goals[0].status, "active");
assert.strictEqual(
  getGoalProgress(data.goals[0]).percent,
  25,
  "partial progress uses the factual completed-item count",
);
assert.strictEqual(getGoalProgress(data.goals[0]).count, 1);
assert.strictEqual(data.goals[1].status, "paused");
assert.strictEqual(data.goals[1].pausedFromStatus, "review");
assert.strictEqual(data.goals[1].pausedRemainingMs, 1200);
assert.strictEqual(data.goals[1].items[1].durationDay, "mon");
assert.strictEqual(
  data.goals.find((goal) => goal.id === "achieved").status,
  "achieved",
);
assert.deepStrictEqual(
  JSON.parse(
    JSON.stringify(data.goals.find((goal) => goal.id === "beginner").items[0].selectedMethods),
  ),
  ["doorToDoor", "smpw"],
);
assert.strictEqual(
  data.goals.find((goal) => goal.id === "beginner").items[0].methodOtherText,
  "A local option",
);
assert.strictEqual(data.latestAcknowledgement.total, 4);
console.log("PASS  normalization preserves active, paused, timed, acknowledged, and achieved goals");

const local = {
  settings: {
    goalsAndMilestones: {
      encouragementEnabled: false,
      deletedGoalIds: ["deleted-occurrence"],
      goals: [
        {
          id: "shared",
          pathId: "participate",
          type: "recurring",
          status: "active",
          updatedAt: "2026-02-01T00:00:00.000Z",
          items: [
            { id: "a", completed: true, completedAt: "2026-02-01T01:00:00.000Z" },
            { id: "b", completed: false },
          ],
        },
        { id: "deleted-occurrence", pathId: "unassigned", items: [] },
      ],
      latestAcknowledgement: { id: "local", at: "2026-02-01T00:00:00.000Z" },
    },
  },
  contacts: [],
};
const remote = {
  settings: {
    goalsAndMilestones: {
      encouragementEnabled: true,
      deletedGoalIds: [],
      goals: [
        {
          id: "shared",
          pathId: "participate",
          type: "recurring",
          status: "active",
          updatedAt: "2026-02-02T00:00:00.000Z",
          items: [
            { id: "a", completed: false },
            { id: "b", completed: true, completedAt: "2026-02-02T01:00:00.000Z" },
          ],
        },
        { id: "new-occurrence", pathId: "unassigned", items: [] },
      ],
      latestAcknowledgement: { id: "remote", at: "2026-02-02T00:00:00.000Z" },
    },
  },
  contacts: [],
};
const merged = merge.mergeData(local, remote, { localDirty: true });
assert.deepStrictEqual(
  merged.settings.goalsAndMilestones.goals.map((goal) => goal.id).sort(),
  ["new-occurrence", "shared"],
);
const mergedAchievement = merged.settings.goalsAndMilestones.goals.find(
  (goal) => goal.id === "shared",
);
assert.strictEqual(mergedAchievement.status, "achieved");
assert.deepStrictEqual(
  mergedAchievement.items.map((item) => item.completed),
  [true, true],
);
assert.strictEqual(
  merged.settings.goalsAndMilestones.latestAcknowledgement.id,
  "remote",
);
assert.deepStrictEqual(
  merged.settings.goalsAndMilestones.deletedGoalIds,
  ["deleted-occurrence"],
);
console.log("PASS  Dropbox-style merge combines progress and acknowledgements without restoring removed goals");

const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const styles = fs.readFileSync(path.join(root, "styles.css"), "utf8");
assert(html.includes('id="goals-view"'));
assert(html.includes('id="app-version-badge"'));
assert(source.includes('versionLabel.textContent = `v${APP_VERSION}`'));
assert(html.includes('id="settings-goals-encouragement"'));
assert(html.includes('aria-live="polite"'));
assert(html.includes("Start where you are: use personal ministry goals or Time in"));
assert(html.includes("You may change, pause, or remove a goal at any time."));
assert(styles.includes("@media (max-width: 600px)"));
assert(source.includes('action === "try-again" || action === "set-again"'));
assert(source.includes('action === "adjust-save"'));
assert(source.includes('action === "pause"'));
assert(source.includes('renderGoalAcknowledgement();'));
console.log("PASS  goals, accessible progress notices, lifecycle actions, and responsive styles are wired");

const nestedDeclaration = (name) => {
  const start = source.indexOf(`  const ${name} =`);
  assert(start >= 0, name);
  const end = source.indexOf("\n  const ", start + 1);
  return source.slice(start, end).trim();
};
let state = normalizeGoalsAndMilestones(data);
const i18n = require("../i18n.js");
const helperContext = vm.createContext({
  ...context,
  ...context.goalHelpers,
  Date, Math,
  settings: { timeTracking: { enabled: false } },
  goalsData: () => state,
  appText: (key, fallback, vars) => i18n.t(key, vars, fallback),
  escapeHtml: (text) => String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;"),
  document: { documentElement: { lang: "en" } },
});
vm.runInContext([
  "goalId", "getGoalPathName", "getGoalItemTitle", "getGoalPeriodEnd",
  "newGoalOccurrence", "getGoalEncouragement", "getGoalRecordedMinutes",
  "renderGoalEditor", "renderGoalCard", "getGoalEditorDraft", "applyGoalEdits", "undoGoalItem",
].map(nestedDeclaration).join("\n") +
  "\nthis.api = { newGoalOccurrence, renderGoalEditor, renderGoalCard, getGoalEditorDraft, applyGoalEdits, undoGoalItem, getGoalEncouragement };",
helperContext);
const api = helperContext.api;
const copy = (value) => JSON.parse(JSON.stringify(value));
const now = "2026-11-11T12:00:00.000Z";
const partial = copy(data.goals[0]);
partial.periodEndsAt = null;
const draft = { ...copy(partial), periodDays: 14, items: copy(partial.items) };
draft.items.forEach((item) => { item.completed = false; item.completedAt = null; });
const edited = api.applyGoalEdits(partial, draft, now).goal;
assert.strictEqual(edited.id, partial.id);
assert.strictEqual(edited.createdAt, partial.createdAt);
assert.strictEqual(edited.items[0].completed, true);
assert.strictEqual(edited.items[0].completedAt, partial.items[0].completedAt);
assert.strictEqual(edited.periodEndsAt, "2026-02-15T00:00:00.000Z", "period edits retain the occurrence's start");
assert.strictEqual(api.applyGoalEdits(partial, { ...draft, items: draft.items.slice(1) }, now).error, "goals.editConflict");
const changed = copy(draft);
changed.items[0].customText = "Different work";
assert.strictEqual(api.applyGoalEdits(partial, changed, now).error, "goals.editConflict");
assert.strictEqual(api.applyGoalEdits(partial, { ...draft, items: [] }, now).error, "goals.selectStep");

const accomplished = { ...copy(partial), status: "achieved", achievedAt: now };
accomplished.items.forEach((item) => { item.completed = true; item.completedAt = now; });
state = { ...state, latestAcknowledgement: { goalId: accomplished.id, kind: "goal" } };
api.undoGoalItem(accomplished, accomplished.items[0], now);
assert.strictEqual(accomplished.id, partial.id);
assert.strictEqual(accomplished.items[0].completed, false);
assert.strictEqual(accomplished.items[0].completedAt, null);
assert.strictEqual(accomplished.achievedAt, undefined);
assert.strictEqual(accomplished.status, "active");
assert.strictEqual(getGoalProgress(accomplished).completed, 3);
assert.strictEqual(getGoalProgress(accomplished).percent, 75);
assert.strictEqual(state.latestAcknowledgement, null);
const persisted = normalizeGoalsAndMilestones(JSON.parse(JSON.stringify({ goals: [accomplished] }))).goals[0];
assert.strictEqual(persisted.items[0].completed, false);
assert.strictEqual(persisted.items[1].completed, true);
const expired = { ...copy(accomplished), status: "achieved", periodEndsAt: "2026-01-01T00:00:00.000Z" };
api.undoGoalItem(expired, expired.items[1], now);
assert.strictEqual(expired.status, "review");

const legacyTimed = normalizeGoalsAndMilestones({ goals: [{
  ...copy(partial), durationMinutes: 45, dayDurations: { mon: 20 },
  items: [
    { id: "duration-target", durationMinutes: 45, completed: true, completedAt: now },
    { id: "duration-mon", durationDay: "mon", durationMinutes: 20 },
    { id: "unrelated", durationMinutes: 10 },
  ],
}] }).goals[0];
assert.strictEqual(legacyTimed.items[0].key, "durationTarget");
assert.strictEqual(legacyTimed.items[1].key, "durationDay");
assert.strictEqual(legacyTimed.items[2].key, undefined, "do not invent meanings for unrelated saved steps");
assert.strictEqual(legacyTimed.items[0].completedAt, now);
assert.strictEqual(legacyTimed.durationMinutes, 45);
const roundTrip = normalizeGoalsAndMilestones(copy({ goals: [legacyTimed] })).goals[0];
assert.deepStrictEqual(copy(roundTrip), copy(legacyTimed));
assert.strictEqual(data.goals[1].items[1].key, "durationDay");
const repeat = api.newGoalOccurrence(accomplished);
assert.notStrictEqual(repeat.id, accomplished.id);
assert(repeat.items.every((item) => !item.completed && !item.completedAt && !item.completionChangedAt));
assert.strictEqual(accomplished.items[1].completed, true);

const mergeGoals = (a, b) => merge.mergeData(
  { settings: { goalsAndMilestones: { goals: [a] } } },
  { settings: { goalsAndMilestones: { goals: [b] } } },
).settings.goalsAndMilestones.goals[0];
const stale = { ...copy(accomplished), status: "achieved", updatedAt: "2026-11-10T00:00:00.000Z" };
stale.items[0].completed = true;
stale.items[0].completedAt = stale.updatedAt;
delete stale.items[0].completionChangedAt;
for (const [a, b] of [[stale, accomplished], [accomplished, stale]]) {
  const synced = mergeGoals(a, b);
  assert.strictEqual(synced.items[0].completed, false, "sync must not resurrect undone completion");
  assert.strictEqual(synced.items[0].completedAt, null);
  assert.strictEqual(synced.items[1].completed, true);
  assert.notStrictEqual(synced.status, "achieved");
}
const reduced = api.applyGoalEdits(partial, { ...draft, items: draft.items.slice(0, 2) }, now).goal;
for (const [a, b] of [[reduced, partial], [partial, reduced]]) {
  assert.strictEqual(mergeGoals(a, b).items.length, 2, "sync preserves intentionally edited step selection");
}
console.log("PASS same-occurrence editing, conflict prevention, undo, legacy duration recovery, repeat attempts, and sync");

assert(html.indexOf('data-i18n="goals.manualProgress"') < html.indexOf('id="btn-create-goals"'));
for (const language of ["en", "es"]) {
  const catalog = JSON.parse(fs.readFileSync(path.join(root, "locales", `${language}.json`), "utf8"));
  i18n._setCatalog(language, catalog);
  i18n._setCurrent(language);
  for (const key of ["goals.howProgress", "goals.manualProgress", "goals.edit", "goals.undo", "goals.durationDefinition", "goals.durationManual"]) {
    assert(catalog[key], `${language}: ${key}`);
  }
  const markup = api.renderGoalEditor("returnVisits", api.getGoalEditorDraft(partial), true);
  const titleAt = markup.indexOf(catalog["goals.duration"]);
  const definitionAt = markup.indexOf(catalog["goals.durationDefinition"]);
  const manualAt = markup.indexOf(catalog["goals.durationManual"]);
  const inputAt = markup.indexOf("data-goal-duration");
  assert(titleAt < definitionAt && definitionAt < manualAt && manualAt < inputAt);
  assert(markup.includes(`<small>${catalog["goals.durationDefinition"]}</small>`), "explanations keep small-text markup");
  const card = api.renderGoalCard(partial, "active");
  assert(card.includes('data-goal-action="edit"'));
  assert(card.includes('data-goal-action="undo"'));
  assert(card.includes(language === "en" ? "1 of 4 steps completed" : "1 de 4 pasos completados"));
  assert(api.renderGoalCard({ ...partial, status: "achieved" }, "history").includes('data-goal-action="undo"'));
  state.encouragementEnabled = true;
  for (const [completed, total, range] of [
    [1, 8, "start"], [1, 4, "progress"], [2, 4, "great"],
    [3, 4, "almost"], [4, 4, "done"], [1, 2, "start"],
  ]) {
    const text = api.getGoalEncouragement(partial, { completed, total, percent: Math.floor(completed / total * 100) });
    assert([catalog[`goals.encourage.${range}1`], catalog[`goals.encourage.${range}2`]].includes(text));
  }
  assert.strictEqual(api.getGoalEncouragement(partial, { completed: 0, total: 4, percent: 0 }), "");
}
for (const [label, explanation, control] of [
  ['for="settings-address-country"', 'data-i18n="addressing.explanation"', 'id="settings-address-country"'],
  ['for="me-country"', 'data-i18n="defaults.countryExplanation"', 'id="me-country"'],
  ['id="setting-city-label"', 'data-i18n="settings.mapDefault"', 'id="setting-default-city"'],
  ['for="setup-address-country"', 'data-i18n="addressing.explanation"', 'id="setup-address-country"'],
  ['id="contact-city-label"', 'data-i18n="location.contactCityNote"', 'id="contact-city-select"'],
]) {
  const start = html.indexOf(label);
  const definition = html.indexOf(explanation, start);
  const input = html.indexOf(control, start + label.length);
  assert(start >= 0 && start < definition && definition < input, control);
}
console.log("PASS English/Spanish setup guidance, time-goal layout, visible edit/undo/progress, encouragement thresholds, and field order");

// Run with: node tests/goals-simplified.js
// Covers the simplified Goals experience: the 11-goal picker, configuration-free
// adding, Completed/Clear controls, the Auxiliary Pioneer sign-up month table,
// and the dormancy of the postponed advanced Goals interface.
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const merge = require("../merge.js");

const root = path.join(__dirname, "..");
const source = fs.readFileSync(path.join(root, "app.js"), "utf8");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const declaration = (name) => {
  const start = source.indexOf(`const ${name} =`);
  assert.notStrictEqual(start, -1, `${name} exists`);
  const nextConst = source.indexOf("\nconst ", start + 1);
  const nextClass = source.indexOf("\nclass ", start + 1);
  const endings = [nextConst, nextClass].filter((index) => index !== -1);
  return source.slice(start, endings.length ? Math.min(...endings) : source.length).trim();
};

const context = { EPOCH_TIMESTAMP: "1970-01-01T00:00:00.000Z" };
vm.runInNewContext(
  [
    "GOALS_SIMPLIFIED",
    "GOAL_PATHS",
    "GOAL_ITEM_KEYS",
    "GOAL_METHODS",
    "AUX_PIONEER_PATH_ID",
    "getAuxMonthKeys",
    "applyAuxMonthChange",
    "goalItemKey",
    "normalizeGoalsAndMilestones",
    "getGoalProgress",
  ].map(declaration).join("\n") +
    "\nthis.api = { GOALS_SIMPLIFIED, GOAL_PATHS, AUX_PIONEER_PATH_ID, getAuxMonthKeys, applyAuxMonthChange, normalizeGoalsAndMilestones };",
  context,
);
const {
  GOALS_SIMPLIFIED,
  GOAL_PATHS,
  AUX_PIONEER_PATH_ID,
  getAuxMonthKeys,
  applyAuxMonthChange,
  normalizeGoalsAndMilestones,
} = context.api;
const copy = (value) => JSON.parse(JSON.stringify(value));

// --- Picker contents ---
assert.strictEqual(GOALS_SIMPLIFIED, true, "simplified experience is active");
assert.deepStrictEqual(
  copy(
    Object.entries(GOAL_PATHS)
      .filter(([_id, definition]) => definition.selectable !== false)
      .map(([id]) => id),
  ),
  [
    "beginMinistry",
    "participate",
    "auxiliary",
    "regular",
    "signUpAuxiliary",
    "signUpRegular",
    "returnVisits",
    "informal",
    "skills",
    "needGreater",
    "unassigned",
  ],
  "exactly the intended eleven goals are selectable",
);
assert.strictEqual(AUX_PIONEER_PATH_ID, "signUpAuxiliary");
assert.deepStrictEqual(copy(GOAL_PATHS.signUpAuxiliary.items), []);
assert.deepStrictEqual(copy(GOAL_PATHS.signUpRegular.items), []);
assert.strictEqual(
  GOAL_PATHS.seldomWorked.selectable,
  false,
  "legacy Work Seldom-Worked Territory stays unavailable for new selection",
);
assert(
  /Legacy compatibility definition[\s\S]{0,400}seldomWorked: \{/.test(source),
  "legacy definition carries its retention comment",
);
// Create My Own Path is hidden from the simplified picker but preserved.
assert(
  /GOALS_SIMPLIFIED\s*\?\s*""\s*:\s*`<label class="goals-path-option">\s*<input type="checkbox" data-goal-path-choice="custom">/.test(
    source,
  ),
  "Create My Own Path is gated out of the simplified picker, not deleted",
);
assert(source.includes('"goals.path.custom", "Create My Own Path"'));
console.log("PASS  simplified picker offers the eleven goals and hides custom/legacy paths");

// --- Rolling 12-month window ---
const november = getAuxMonthKeys(new Date(2026, 10, 25));
assert.strictEqual(november.length, 12);
assert.strictEqual(november[0], "2026-11", "window starts at the current month");
assert.strictEqual(november[1], "2026-12");
assert.strictEqual(november[2], "2027-01", "window crosses the year boundary");
assert.strictEqual(november[11], "2027-10");
assert.strictEqual(new Set(november).size, 12);
const december = getAuxMonthKeys(new Date(2026, 11, 1));
assert(!december.includes("2026-11"), "a past month leaves the window");
assert.strictEqual(december[11], "2027-11", "the new future month is appended");
assert.deepStrictEqual(
  copy(getAuxMonthKeys(new Date(2026, 0, 31))),
  ["2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06",
    "2026-07", "2026-08", "2026-09", "2026-10", "2026-11", "2026-12"],
  "month arithmetic is safe on the 31st",
);
console.log("PASS  rolling window is the current month plus the next eleven");

// --- Month checkbox rules ---
let months = {};
months = applyAuxMonthChange(months, "2026-11", "try", true);
assert.deepStrictEqual(copy(months["2026-11"]), { try: true, completed: false });
months = applyAuxMonthChange(months, "2026-12", "completed", true);
assert.deepStrictEqual(
  copy(months["2026-12"]),
  { try: true, completed: true },
  "checking Completed automatically checks Try",
);
months = applyAuxMonthChange(months, "2026-12", "try", false);
assert.deepStrictEqual(
  copy(months["2026-12"]),
  { try: false, completed: true },
  "unchecking Try leaves Completed checked (valid state)",
);
months = applyAuxMonthChange(months, "2026-12", "completed", false);
assert.deepStrictEqual(
  copy(months["2026-12"]),
  { try: false, completed: false },
  "unchecking Completed automatically unchecks Try",
);
months = applyAuxMonthChange(months, "2027-01", "completed", true);
months = applyAuxMonthChange(months, "2027-01", "try", true);
assert.deepStrictEqual(copy(months["2027-01"]), { try: true, completed: true });
assert.deepStrictEqual(
  copy(applyAuxMonthChange(undefined, "2027-02", "try", true)["2027-02"]),
  { try: true, completed: false },
  "a newly displayed month starts unchecked until the user acts",
);
console.log("PASS  Try/Completed month rules behave as specified");

// --- Normalization of simplified goals ---
const normalized = normalizeGoalsAndMilestones({
  goals: [
    {
      id: "aux",
      pathId: "signUpAuxiliary",
      type: "target",
      status: "active",
      items: [],
      months: {
        "2026-11": { try: true, completed: false },
        "2026-12": { try: "yes", completed: true },
        "bad-key": { try: true, completed: true },
        "2026-13": { try: true, completed: true },
      },
      createdAt: "2026-11-01T00:00:00.000Z",
      updatedAt: "2026-11-01T00:00:00.000Z",
    },
    {
      id: "regular-signup",
      pathId: "signUpRegular",
      type: "target",
      status: "achieved",
      achievedAt: "2026-11-02T00:00:00.000Z",
      items: [],
      months: { "2026-11": { try: true, completed: true } },
      createdAt: "2026-11-01T00:00:00.000Z",
      updatedAt: "2026-11-02T00:00:00.000Z",
    },
  ],
});
const saved = copy(normalized);
assert.deepStrictEqual(
  saved.goals[0].months,
  {
    "2026-11": { try: true, completed: false },
    "2026-12": { try: false, completed: true },
  },
  "auxiliary months are preserved and sanitized; invalid keys are dropped",
);
assert.strictEqual(
  saved.goals[1].months,
  undefined,
  "months are only stored for the Auxiliary Pioneer sign-up goal",
);
assert.strictEqual(
  saved.goals[1].status,
  "achieved",
  "a step-less goal marked Completed keeps its achieved status",
);
assert.strictEqual(saved.goals[1].achievedAt, "2026-11-02T00:00:00.000Z");
assert.strictEqual(saved.goals[0].status, "active");
const roundTrip = copy(normalizeGoalsAndMilestones(saved));
assert.deepStrictEqual(roundTrip.goals, saved.goals, "simplified goals round-trip");
console.log("PASS  normalization preserves simplified goals, months, and manual completion");

// --- Sync of simplified goals ---
const syncGoal = (local, remote) => merge.mergeData(
  { settings: { goalsAndMilestones: { goals: [local] } } },
  { settings: { goalsAndMilestones: { goals: [remote] } } },
).settings.goalsAndMilestones.goals[0];
const olderActive = {
  id: "aux", pathId: "signUpAuxiliary", type: "target", status: "active",
  items: [], months: { "2026-11": { try: true, completed: false } },
  updatedAt: "2026-11-01T00:00:00.000Z",
};
const newerCompleted = {
  ...copy(olderActive),
  status: "achieved",
  achievedAt: "2026-11-05T00:00:00.000Z",
  months: { "2026-11": { try: true, completed: true } },
  updatedAt: "2026-11-05T00:00:00.000Z",
};
for (const [a, b] of [[olderActive, newerCompleted], [newerCompleted, olderActive]]) {
  const synced = syncGoal(copy(a), copy(b));
  assert.strictEqual(synced.status, "achieved", "manual completion survives sync");
  assert.strictEqual(synced.achievedAt, "2026-11-05T00:00:00.000Z");
  assert.deepStrictEqual(
    copy(synced.months),
    { "2026-11": { try: true, completed: true } },
    "the newer device's month selections win",
  );
}
console.log("PASS  sync keeps manual completion and month selections for step-less goals");

// --- Simplified rendering (goal rows and the month table) ---
const nestedDeclaration = (name) => {
  const start = source.indexOf(`  const ${name} =`);
  assert(start >= 0, name);
  const end = source.indexOf("\n  const ", start + 1);
  return source.slice(start, end).trim();
};
const i18n = require("../i18n.js");
const renderContext = vm.createContext({
  ...context,
  ...context.api,
  Date, Math, Boolean, Set, Object,
  appText: (key, fallback, vars) => i18n.t(key, vars, fallback),
  escapeHtml: (text) => String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;"),
  document: { documentElement: { lang: "en" } },
});
vm.runInContext(
  ["getGoalPathName", "auxMonthLabel", "renderAuxMonthsTable", "renderSimplifiedGoalRow"]
    .map(nestedDeclaration).join("\n") +
    "\nthis.render = { renderAuxMonthsTable, renderSimplifiedGoalRow };",
  renderContext,
);
const render = renderContext.render;
for (const language of ["en", "es"]) {
  const catalog = JSON.parse(fs.readFileSync(path.join(root, "locales", `${language}.json`), "utf8"));
  i18n._setCatalog(language, catalog);
  i18n._setCurrent(language);
  const normalRow = render.renderSimplifiedGoalRow({
    id: "normal", pathId: "signUpRegular", pathName: "", status: "active", items: [],
  });
  assert(normalRow.includes("data-goal-simple-complete"), "normal goals show a Completed checkbox");
  assert(normalRow.includes('data-goal-action="clear"'), "normal goals show a Clear link");
  assert(normalRow.includes(catalog["goals.path.signUpRegular"]));
  assert(normalRow.includes(catalog["goals.clear"]));
  assert(!normalRow.includes("data-aux-month"), "Sign Up for Regular Pioneer has no month controls");
  for (const postponed of ["edit", "pause", "remove", "try-again", "set-again", "adjust", "complete\"", "undo"]) {
    assert(!normalRow.includes(`data-goal-action="${postponed}`), `postponed control ${postponed} is not exposed`);
  }
  assert(!normalRow.includes("goals-encouragement"), "no encouragement markup on simplified rows");
  const completedRow = render.renderSimplifiedGoalRow({
    id: "normal", pathId: "signUpRegular", pathName: "", status: "achieved", items: [],
  });
  assert(completedRow.includes("checked"), "Completed state is reflected in the checkbox");
  const auxRow = render.renderSimplifiedGoalRow({
    id: "aux", pathId: "signUpAuxiliary", pathName: "", status: "active", items: [], months: {},
  });
  assert(
    !auxRow.includes("data-goal-simple-complete"),
    "Auxiliary Pioneer has no overall Completed checkbox",
  );
  assert(auxRow.includes('data-goal-action="clear"'));

  const keys = getAuxMonthKeys();
  const activeTable = render.renderAuxMonthsTable({
    id: "aux", pathId: "signUpAuxiliary", status: "active", items: [],
    months: { [keys[0]]: { try: true, completed: false } },
  });
  const headerOrder = [catalog["goals.month"], catalog["goals.try"], catalog["goals.completed"]]
    .map((label) => activeTable.indexOf(`<th scope="col">${label}</th>`));
  assert(headerOrder[0] >= 0 && headerOrder[0] < headerOrder[1] && headerOrder[1] < headerOrder[2],
    "table headers are Month | Try | Completed");
  assert.strictEqual((activeTable.match(/<tr><th scope="row">/g) || []).length, 12, "twelve month rows");
  assert(activeTable.includes(`data-aux-month="${keys[0]}"`));
  assert(activeTable.includes(`data-aux-month="${keys[11]}"`));
  assert(!activeTable.includes("disabled"), "active month controls are available");
  assert(activeTable.includes("checked"));
  assert(!activeTable.includes("goals-aux-months-inactive"));

  const inactiveTable = render.renderAuxMonthsTable(null);
  assert(inactiveTable.includes("goals-aux-months-inactive"), "inactive table is greyed out");
  assert.strictEqual((inactiveTable.match(/disabled/g) || []).length, 24, "all 24 inactive checkboxes are disabled");
  assert(!inactiveTable.includes("checked"), "inactive table shows no selections");
}
console.log("PASS  simplified rows and the Auxiliary Pioneer month table render as specified");

// --- Simplified wiring, clearing, and dormancy ---
assert(source.includes('if (GOALS_SIMPLIFIED) {'), "simplified gates exist");
assert(source.includes("renderSimplifiedGoalsView"), "simplified view renderer is wired");
assert(/action === "clear"/.test(source), "Clear removes the goal from the active display");
assert(
  source.includes("settings.goalsAndMilestones.deletedGoalIds.push(goal.id);"),
  "cleared goals leave a tombstone so sync cannot resurrect them",
);
assert(source.includes("input.disabled = taken;"), "listed goals cannot be added twice; cleared goals become selectable again");
assert(
  /if \(GOALS_SIMPLIFIED\) \{\s*\/\/[^\n]*\n\s*\/\/[^\n]*\n\s*notice\.hidden = true;/.test(source),
  "acknowledgement notices stay hidden while simplified",
);
assert(source.includes("stale.forEach((monthKey) => delete auxGoal.months[monthKey]);"),
  "past months are discarded without history");
// Postponed functionality is preserved (dormant), not deleted.
for (const preserved of [
  'action === "try-again" || action === "set-again"',
  'action === "adjust-save"',
  'action === "pause"',
  'action === "resume"',
  "const renderGoalEditor =",
  "const getGoalEncouragement =",
  "const rememberGoalDrafts =",
  "encouragementEnabled",
]) {
  assert(source.includes(preserved), `postponed functionality preserved: ${preserved}`);
}
console.log("PASS  simplified wiring is present and postponed functionality stays dormant in code");

// --- HTML: approved wording, hidden postponed interface ---
assert(html.includes("Goals are still being developed. You are welcome to try them, but some features may change or may not yet work as expected."));
assert(html.includes("Use Goals in whatever way is helpful to you. You can select the goals you want, mark them complete, or clear them when you no longer want them."));
assert(html.includes("These goals are private planning tools. NRV does not compare people or determine official service status or qualifications."));
const introAt = html.indexOf('class="goals-intro"');
const pickerAt = html.indexOf('id="goals-path-options"');
assert(introAt >= 0 && introAt < pickerAt, "introductory wording appears before the picker");
for (const hiddenSection of [
  'id="goals-paused-section" aria-labelledby="goals-paused-title" hidden',
  'id="goals-review-section" aria-labelledby="goals-review-title" hidden',
  'id="goals-history-section" aria-labelledby="goals-history-title" hidden',
  'class="settings-section" id="encouragement-option-section" hidden',
]) {
  assert(html.includes(hiddenSection), `postponed section stays dormant: ${hiddenSection}`);
}
assert(html.includes('aria-labelledby="goals-progress-help-title" hidden'),
  "step-progress guidance is hidden with simplified goals");
assert(html.includes('id="btn-create-goals" disabled'),
  "Add selected goals starts unavailable until a goal is chosen");
assert(html.includes('id="settings-goals-encouragement"'),
  "the encouragement option's markup is preserved for future reactivation");
console.log("PASS  approved introductory wording is live and the postponed interface is hidden");

// --- Localization of the new strings ---
const en = JSON.parse(fs.readFileSync(path.join(root, "locales", "en.json"), "utf8"));
const es = JSON.parse(fs.readFileSync(path.join(root, "locales", "es.json"), "utf8"));
assert.strictEqual(en["goals.path.signUpAuxiliary"], "Sign Up for Auxiliary Pioneer Service");
assert.strictEqual(en["goals.path.signUpRegular"], "Sign Up for Regular Pioneer Service");
assert.strictEqual(en["goals.introStatus"], "Goals are still being developed. You are welcome to try them, but some features may change or may not yet work as expected.");
assert.strictEqual(en["goals.introUse"], "Use Goals in whatever way is helpful to you. You can select the goals you want, mark them complete, or clear them when you no longer want them.");
assert.strictEqual(en["goals.privateNote"], "These goals are private planning tools. NRV does not compare people or determine official service status or qualifications.");
assert.strictEqual(en["goals.clear"], "Clear");
assert.strictEqual(en["goals.month"], "Month");
assert.strictEqual(en["goals.try"], "Try");
for (const key of [
  "goals.path.signUpAuxiliary", "goals.path.signUpRegular",
  "goals.introStatus", "goals.introUse", "goals.clear", "goals.month", "goals.try",
]) {
  assert(typeof es[key] === "string" && es[key].length, `es: ${key}`);
}
console.log("PASS  the approved English wording and Spanish translations are in the catalogs");

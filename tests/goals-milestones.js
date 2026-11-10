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
  "normalizeGoalsAndMilestones",
  "getGoalProgress",
].map(declaration).join("\n");
vm.runInNewContext(
  `${declarations}\nthis.goalHelpers = { GOAL_PATHS, GOAL_METHODS, normalizeGoalsAndMilestones, getGoalProgress };`,
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

// Verbatim excerpts from @brainbase-labs/cli@0.37.0 dist/index.js (npm tarball https://registry.npmjs.org/@brainbase-labs/cli/-/cli-0.37.0.tgz, published 2026-09-24T00:49:22Z).
// Full bundle is 3.4MB so only these line ranges are kept. Line numbers refer to the original file.

// ===== lines 54278,54300 =====
function masApiBase(session) {
  return `${masControlPlaneBaseUrl(session)}/v2`;
}
function usesLegacyControlPlane() {
  return !process.env.BRAINBASE_CONTROL_PLANE_URL?.trim() && !!process.env.BRAINBASE_API_URL?.trim();
}
function legacyScheduleError() {
  return new ApiError("Schedule-trigger writes require the MAS control plane. Set BRAINBASE_CONTROL_PLANE_URL or unset the legacy BRAINBASE_API_URL override.", 400);
}
function legacyAgentConfigError() {
  return new ApiError("Declarative machine/model config requires the MAS control plane. Set BRAINBASE_CONTROL_PLANE_URL or unset the legacy BRAINBASE_API_URL override.", 400);
}
async function resolveCredential(storedPatHint = "control-plane") {
  const envToken = process.env.BRAINBASE_TOKEN;
  if (envToken && envToken.trim()) {
    return {
      bearer: envToken.trim(),
      session: null,
      source: "env_pat"
    };
  }
  const session = await ensureFreshSession();
  if (session) {

// ===== lines 54358,54370 =====
async function sendRequest(url, init, bearer) {
  const headers = new Headers(init.headers);
  if (!headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${bearer}`);
  }
  if (!headers.has("Accept"))
    headers.set("Accept", "application/json");
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  try {
    return await fetch(url, { ...init, headers });
  } catch (err) {

// ===== lines 54698,54770 =====
  async createTask(input, options) {
    const body = await masRequest("/tasks", {
      method: "POST",
      headers: { "Idempotency-Key": options.idempotencyKey },
      body: JSON.stringify(input)
    });
    return parseMasTaskCreateResponse(body);
  },
  async getTaskInputGeneration(taskId) {
    const body = await masReadRequest(`/tasks/${encodeURIComponent(taskId)}/inputs?limit=1&include_messages=false`);
    if (!body || !Array.isArray(body.inputs) || typeof body.generation !== "number" || !Number.isSafeInteger(body.generation) || body.generation < 0) {
      throw new ApiError("MAS returned an unreadable task input generation.", undefined, body);
    }
    return body.generation;
  },
  async sendTaskInput(taskId, input) {
    let replayed = false;
    const body = await masResourceRequest(`/tasks/${encodeURIComponent(taskId)}/inputs`, { method: "POST", body: JSON.stringify(input), keepalive: false }, (headers) => {
      replayed = headers.get("Idempotency-Replayed") === "true";
    });
    if (!body || !isTaskInputReceipt(body.input) || body.input.id.toLowerCase() !== input.input_id.toLowerCase() || body.input.task_id.toLowerCase() !== taskId.toLowerCase() || !Array.isArray(body.messages) || typeof body.run_started !== "boolean" || !(body.accepted_turn_id === null || typeof body.accepted_turn_id === "string")) {
      throw new ApiError("MAS returned an unreadable follow-up receipt.", undefined, body);
    }
    return replayed ? { ...body, idempotency_replayed: true } : body;
  },
  async stopTask(taskId, expectedGeneration) {
    const body = await masResourceRequest(`/tasks/${encodeURIComponent(taskId)}/interrupt`, { method: "POST", body: JSON.stringify({ expected_generation: expectedGeneration }), keepalive: false });
    if (!body || typeof body.id !== "string" || body.id.toLowerCase() !== taskId.toLowerCase() || typeof body.status !== "string" || !Number.isInteger(body.generation) || !Array.isArray(body.cancelled_inputs) || !body.cancelled_inputs.every((input) => isTaskInputReceipt(input) && input.task_id.toLowerCase() === taskId.toLowerCase() && input.status === "cancelled")) {
      throw new ApiError("MAS did not confirm Stop and pending follow-up cancellation.", undefined, body);
    }
    return body;
  },
  async listTasks(options = {}) {
    const params = new URLSearchParams;
    if (options.agentId)
      params.set("agent_id", options.agentId);
    if (options.limit !== undefined)
      params.set("limit", String(options.limit));
    const qs = params.toString() ? `?${params.toString()}` : "";
    return masItems(await masReadRequest(`/tasks${qs}`), "task list");
  },
  async getTask(taskId, options = {}) {
    const body = await masReadRequest(`/tasks/${encodeURIComponent(taskId)}`, options.signal);
    if (!body || typeof body !== "object" || typeof body.id !== "string" || typeof body.status !== "string") {
      throw new ApiError("MAS returned an unreadable task response.", undefined, body);
    }
    return body;
  },
  async listTaskEvents(taskId, options = {}) {
    const params = new URLSearchParams({ order_by_received: "true" });
    if (options.limit !== undefined)
      params.set("limit", String(options.limit));
    if (options.after) {
      params.set("after_received_at", options.after.receivedAt);
      params.set("after_id", options.after.id);
    }
    if (options.desc !== undefined)
      params.set("desc", String(options.desc));
    const body = await masReadRequest(`/tasks/${encodeURIComponent(taskId)}/events?${params.toString()}`);
    return masItems(body, "task events");
  },
  async listMachines(options = {}) {
    const body = await masResourceRequest(`/machines${masListQuery({
      kind: options.kind,
      include_dead: options.includeDead === undefined ? undefined : String(options.includeDead),
      limit: options.limit === undefined ? undefined : String(options.limit)
    })}`);
    if (!body || !Array.isArray(body.items)) {
      throw new ApiError("The control plane returned an unreadable machine list", undefined, body);
    }
    return body.items;
  },
  deleteMachine(machineId) {

// ===== lines 62580,62700 =====
var PlaybookSchema = exports_external.object({
  id: exports_external.string().optional(),
  title: exports_external.string().min(1),
  description: exports_external.string().optional(),
  icon: exports_external.string().optional(),
  content: PlaybookContentSchema
});
var SkillEntrySchema = exports_external.object({
  source: exports_external.string().min(1).superRefine((raw, ctx) => {
    const message = skillSourceVersionError(raw);
    if (message)
      ctx.addIssue({ code: exports_external.ZodIssueCode.custom, message });
  })
});
var McpEntrySchema = exports_external.object({
  name: exports_external.string().min(1),
  url: exports_external.string().optional(),
  command: exports_external.string().optional(),
  args: exports_external.array(exports_external.string()).optional(),
  env: exports_external.record(exports_external.string()).optional(),
  headers: exports_external.record(exports_external.string()).optional(),
  is_enabled: exports_external.boolean().optional(),
  runtime_meta: exports_external.record(exports_external.unknown()).optional()
});
var CapabilitiesSchema = exports_external.object({
  memory: exports_external.boolean().optional(),
  browser: exports_external.boolean().optional(),
  slack: exports_external.boolean().optional(),
  meeting: exports_external.boolean().optional(),
  github: exports_external.boolean().optional(),
  linear: exports_external.boolean().optional()
});
var EvalOutputShape = exports_external.enum(["binary", "rating", "classification"]);
var EVAL_SLUG_RE = /^[a-z0-9][a-z0-9-]*$/;
var EvalSchema = exports_external.object({
  id: exports_external.string().min(1).optional(),
  slug: exports_external.string().regex(EVAL_SLUG_RE, "slug must be kebab-case (a-z, 0-9, hyphens)"),
  criteria: exports_external.string().min(1).max(4000),
  icon: exports_external.string().max(64).optional(),
  enabled: exports_external.boolean().default(true),
  judge_model: exports_external.string().min(1).max(128).default("claude-sonnet-4-6"),
  judge_type: exports_external.enum(["model", "agent"]).default("model"),
  judge_agent: exports_external.string().min(1).optional(),
  output_shape: EvalOutputShape.default("binary"),
  classification_values: exports_external.array(exports_external.string().min(1)).optional()
}).refine((v3) => v3.output_shape === "classification" ? !!v3.classification_values && v3.classification_values.length > 0 : v3.classification_values === undefined, {
  message: 'classification_values must be a non-empty list iff output_shape is "classification"',
  path: ["classification_values"]
}).refine((v3) => v3.judge_type === "agent" ? v3.judge_agent !== undefined : v3.judge_agent === undefined, {
  message: 'judge_agent is required iff judge_type is "agent"',
  path: ["judge_agent"]
}).refine((v3) => v3.judge_agent === undefined || EVAL_SLUG_RE.test(v3.judge_agent), {
  message: "judge_agent must be kebab-case (a slug, or a raw agent id)",
  path: ["judge_agent"]
}).refine((v3) => v3.classification_values === undefined || new Set(v3.classification_values).size === v3.classification_values.length, {
  message: "classification_values must not contain duplicate labels",
  path: ["classification_values"]
});
var MODEL_ID_RE = /^[A-Za-z0-9._:/-]{1,128}$/;
var UnsyncedBlockSchema = exports_external.array(exports_external.record(exports_external.unknown())).optional();
var AgentManifestSchema = exports_external.object({
  schema: exports_external.literal(1),
  id: exports_external.string().min(1).optional(),
  harness: exports_external.string().min(1).optional(),
  machine_kind: exports_external.string().trim().min(1).optional(),
  default_model: exports_external.string().trim().regex(MODEL_ID_RE, "default_model must use letters, digits, and . _ - : / only (max 128)").nullable().optional(),
  agent: AgentMetaSchema,
  instructions: InstructionsSchema.optional(),
  entrypoint: EntrypointSchema.optional(),
  playbooks: exports_external.array(PlaybookSchema).default([]),
  skills: exports_external.array(SkillEntrySchema).default([]),
  mcp: exports_external.array(McpEntrySchema).default([]),
  evals: exports_external.array(EvalSchema).superRefine((evals, ctx) => {
    const seen = new Set;
    evals.forEach((e2, i) => {
      if (seen.has(e2.slug)) {
        ctx.addIssue({
          code: exports_external.ZodIssueCode.custom,
          message: `duplicate eval slug "${e2.slug}" — slugs must be unique within an agent`,
          path: [i, "slug"]
        });
      }
      seen.add(e2.slug);
    });
  }).default([]),
  capabilities: CapabilitiesSchema.optional(),
  commands: UnsyncedBlockSchema,
  hooks: UnsyncedBlockSchema,
  files: UnsyncedBlockSchema
});
var MANIFEST_KEY_SYNC = {
  schema: "local",
  id: "synced",
  harness: "synced",
  machine_kind: "synced",
  default_model: "synced",
  agent: "synced",
  instructions: "synced",
  entrypoint: "synced",
  playbooks: "synced",
  skills: "synced",
  mcp: "synced",
  evals: "synced",
  capabilities: "synced",
  commands: "unsynced",
  hooks: "unsynced",
  files: "unsynced"
};
var UNSYNCED_MANIFEST_KEYS = Object.keys(AgentManifestSchema.shape).filter((key2) => (MANIFEST_KEY_SYNC[key2] ?? "unsynced") === "unsynced");
function manifestPath(cwd2) {
  return path74.join(cwd2, AGENT_MANIFEST_FILE);
}
function existingManifestPath(cwd2) {
  const newPath = path74.join(cwd2, AGENT_MANIFEST_FILE);
  if (fs66.existsSync(newPath))
    return newPath;
  const legacy = path74.join(cwd2, LEGACY_AGENT_MANIFEST_FILE);
  if (fs66.existsSync(legacy))
    return legacy;
  return null;
}

// ===== lines 67856,67935 =====
  return import_yaml4.default.stringify(value, { lineWidth: 0 }).trimEnd();
}
function renderFullTemplate(seed) {
  return `# ${AGENT_MANIFEST_FILE} — declarative agent manifest.
# Committed to source control. Edit by hand, then \`brainbase agent push\`.
#
# Only \`schema\` and \`agent.name\` are required — uncomment the blocks you
# need and delete the rest. Full reference:
# https://docs.brainbaselabs.com/cli/reference/agent-manifest

schema: 1

# Which harness runs this agent locally. One of:
# ${knownHarnessIds().join(", ")}.
harness: ${scalar(seed.harness)}

# Sandbox provider, applied when \`brainbase agent create\` claims this file.
# Immutable afterwards — recreate the agent to change it.
# machine_kind: daytona

# Agent-level model override. Omit it to leave the cloud value alone, or set
# null to clear an override that is already set.
# default_model: openai/gpt-5.6-terra

agent:
  name: ${scalar(seed.name)}
  tagline: ${scalar(singleLine(seed.tagline) || STARTER_TAGLINE)}

# The agent's system prompt. Exactly one of \`text\` or \`file\`.
instructions:
  text: ${scalar(starterInstructions(seed.harness))}
  # file: ./.brainbase/instructions.md

# Bash that runs in the sandbox before the agent starts. Exactly one of
# \`commands\`, \`file\`, or \`text\`.
# entrypoint:
#   commands:
#     - npm install

# Named procedures the agent can follow. Each \`content\` takes exactly one of
# \`text\` or \`file\`.
# playbooks:
#   - title: Release checklist
#     description: Steps to cut a release
#     content:
#       file: ./playbooks/release.md

# Skills to install. A registry ref pins an exact version or omits it to track
# the latest; ranges are not supported. Local paths start with \`./\`.
# skills:
#   - source: registry:brainbase/changelog@1.0.0
#   - source: ./skills/local-linter

# MCP servers. Each entry needs either \`url\` or \`command\`. Keep tokens out
# of this file — put them in the gitignored \`.brainbase/secrets.env\`.
# mcp:
#   - name: github
#     url: https://api.githubcopilot.com/mcp/
#     is_enabled: true

# Criteria a judge scores every completed turn against.
# evals:
#   - slug: answered-the-question
#     criteria: The reply answers what was asked without inventing facts.

# Not shown above: \`capabilities\` is written by \`brainbase agent pull\` from
# the cloud and never pushed, and \`commands\` / \`hooks\` / \`files\` parse but
# no command syncs them yet — \`agent push\` refuses them rather than dropping
# them silently.
`;
}
function writeStarterManifest(cwd2, seed, opts = {}) {
  const body = opts.full ? renderFullTemplate(seed) : renderManifest(buildStarterManifest(seed));
  const manifest = parseManifest(body);
  writeManifestText(cwd2, body);
  return manifest;
}

// src/cli/agent-create.ts
async function runAgentCreate(cwd2, args) {

// ===== lines 80627,80680 =====
// src/cli/task-create.ts
var DEFAULT_POLL_INTERVAL_MS2 = 2000;
async function createTask(input, options) {
  return await masApi.createTask(input, options);
}
function requiredValue(value, flag) {
  const normalized = value?.trim();
  if (!normalized) {
    throw new Error(`${flag} is required and must not be blank.`);
  }
  return normalized;
}
function optionalValue(value, flag) {
  if (value === undefined)
    return;
  const normalized = value.trim();
  if (!normalized) {
    throw new Error(`${flag} must not be blank when provided.`);
  }
  return normalized;
}
function resolveAgentId(cwd2, agentId, readLocalManifest) {
  if (agentId !== undefined) {
    return requiredValue(agentId, "--agent");
  }
  const manifest = readLocalManifest(cwd2);
  if (!manifest?.id) {
    throw new Error("No claimed agent found in brainbase.agent.yaml. Run `brainbase agent create` first, or pass --agent <id>.");
  }
  return manifest.id;
}
function isPublishScopeError(error2) {
  const message = error2 instanceof Error ? error2.message : String(error2);
  const body = error2 && typeof error2 === "object" && "body" in error2 ? JSON.stringify(error2.body) : "";
  return /PAT lacks required scope:\s*publish/i.test(`${message} ${body}`);
}
async function runTaskCreate(cwd2, options, dependencies = {}) {
  const idempotencyKey = (dependencies.randomUUID ?? randomUUID2)();
  const message = requiredValue(options.message, "--message");
  const agentId = resolveAgentId(cwd2, options.agentId, dependencies.readManifest ?? readManifest);
  const title = optionalValue(options.title, "--title");
  const model = optionalValue(options.model, "--model");
  const input = {
    agent_id: agentId,
    initial_messages: [{ role: "user", content: message }],
    auto_run: true,
    ...title ? { title } : {},
    ...model ? { default_model: model } : {}
  };
  let created;
  try {
    created = await (dependencies.createTask ?? createTask)(input, {
      idempotencyKey
    });

// ===== lines 81236,81250 =====
    expectedGeneration ??= await masApi.getTaskInputGeneration(taskId);
    console.error([
      `Input generation: ${expectedGeneration}`,
      `If interrupted, rerun with --input-id ${inputId} and the identical message, plus --generation ${expectedGeneration}, to recover this request.`
    ].join(`
`));
    attempted = true;
    result2 = await masApi.sendTaskInput(taskId, {
      input_id: inputId,
      messages: [{ role: "user", content: message }],
      expected_generation: expectedGeneration
    });
  } catch (error2) {
    const status = error2 instanceof ApiError ? error2.status : undefined;
    const code = errorCode(error2);

// ===== lines 89700,89860 =====
]);
var SUBCOMMAND_OWNED_FLAGS = {
  token: ["--scope", "--name"]
};
function help() {
  const out = [];
  out.push("");
  out.push(`  ${brandTint("◆")}  ${import_picocolors61.default.bold("brainbase")}  ${import_picocolors61.default.dim(`v${VERSION}`)}`);
  out.push(`     ${import_picocolors61.default.dim("connect your local agent to the brainbase platform")}`);
  out.push("");
  out.push(divider("USAGE"));
  out.push("");
  out.push(`  ${import_picocolors61.default.bold("brainbase")} ${import_picocolors61.default.dim("<command> [options]")}`);
  out.push("");
  out.push(divider("AUTH"));
  out.push("");
  out.push(`  ${import_picocolors61.default.cyan("login")}     ${import_picocolors61.default.dim("  open the web app and connect this device")}`);
  out.push(`  ${import_picocolors61.default.cyan("logout")}    ${import_picocolors61.default.dim("  clear the local session")}`);
  out.push(`  ${import_picocolors61.default.cyan("whoami")} ${import_picocolors61.default.dim("[--json]")} ${import_picocolors61.default.dim(" show which credential is in use and what it covers")}`);
  out.push("");
  out.push(divider("DISCOVERY"));
  out.push("");
  out.push(`  ${import_picocolors61.default.cyan("team list")}                  ${import_picocolors61.default.dim("show the teams you can create agents in")}`);
  out.push(`  ${import_picocolors61.default.cyan("agent list")}                 ${import_picocolors61.default.dim("show a team's agents and their ids")}`);
  out.push("");
  out.push(divider("LINKED AGENT"));
  out.push("");
  out.push(`  ${import_picocolors61.default.cyan("agent init")}                 ${import_picocolors61.default.dim("write a starter brainbase.agent.yaml here — offline, no login needed")}`);
  out.push(`  ${import_picocolors61.default.cyan("agent create")}               ${import_picocolors61.default.dim("claim an unclaimed brainbase.agent.yaml and create the cloud agent")}`);
  out.push(`  ${import_picocolors61.default.cyan("agent pull")} ${import_picocolors61.default.dim("[<id>]")}          ${import_picocolors61.default.dim("bring cloud changes into this folder (--force to override; --run-entrypoint to also execute the agent entrypoint)")}`);
  out.push(`  ${import_picocolors61.default.cyan("agent push")}                 ${import_picocolors61.default.dim("send local changes to the cloud (--force to overwrite cloud-side conflicts with local)")}`);
  out.push(`  ${import_picocolors61.default.cyan("agent unpack")}               ${import_picocolors61.default.dim("install the claimed agent into a harness layout")}`);
  out.push(`  ${import_picocolors61.default.cyan("link")}                       ${import_picocolors61.default.dim("attach this folder to an existing agent")}`);
  out.push(`  ${import_picocolors61.default.cyan("agent status")}               ${import_picocolors61.default.dim("show what would pull and what would push")}`);
  out.push(`  ${import_picocolors61.default.cyan("agent connections")}          ${import_picocolors61.default.dim("show which integrations this agent is wired to (--json for CI)")}`);
  out.push(`  ${import_picocolors61.default.cyan("agent connect")} ${import_picocolors61.default.dim("<name>")}       ${import_picocolors61.default.dim("connect slack or meeting from the terminal")}`);
  out.push(`  ${import_picocolors61.default.cyan("agent disconnect")} ${import_picocolors61.default.dim("<name>")}    ${import_picocolors61.default.dim("revoke a slack or meeting install")}`);
  out.push(`  ${import_picocolors61.default.cyan("agent env")}                  ${import_picocolors61.default.dim("print export lines for `eval $(brainbase agent env)`")}`);
  out.push(`  ${import_picocolors61.default.cyan("run")} ${import_picocolors61.default.dim("<cmd> [args...]")}         ${import_picocolors61.default.dim("run <cmd> with secrets.env loaded into env")}`);
  out.push(`  ${import_picocolors61.default.cyan("status")}                     ${import_picocolors61.default.dim("show what this folder is linked to")}`);
  out.push(`  ${import_picocolors61.default.cyan("unlink")}                     ${import_picocolors61.default.dim("disconnect this folder")}`);
  out.push("");
  out.push(divider("TASKS"));
  out.push("");
  out.push(`  ${import_picocolors61.default.cyan("task create")} ${import_picocolors61.default.dim("--message <text>")}   ${import_picocolors61.default.dim("create a managed task and start its first run (--wait to block on it)")}`);
  out.push(`  ${import_picocolors61.default.cyan("task list")}                       ${import_picocolors61.default.dim("recent tasks you can reach")}`);
  out.push(`  ${import_picocolors61.default.cyan("task get")} ${import_picocolors61.default.dim("<task-id>")}              ${import_picocolors61.default.dim("one task: status, agent, machine, eval verdicts")}`);
  out.push(`  ${import_picocolors61.default.cyan("task logs")} ${import_picocolors61.default.dim("<task-id> [--follow]")}  ${import_picocolors61.default.dim("one line per event in the task's transcript, or tail it live")}`);
  out.push(`  ${import_picocolors61.default.cyan("task send")} ${import_picocolors61.default.dim("<task-id> <message>")}  ${import_picocolors61.default.dim("send a follow-up during execution, or queue it for the next turn")}`);
  out.push(`  ${import_picocolors61.default.cyan("task stop")} ${import_picocolors61.default.dim("<task-id>")}             ${import_picocolors61.default.dim("stop execution and cancel pending follow-ups, retaining their text")}`);
  out.push("");
  out.push(divider("SANDBOXES"));
  out.push("");
  out.push(`  ${import_picocolors61.default.cyan("machine ls")} ${import_picocolors61.default.dim("[--all]")}            ${import_picocolors61.default.dim("list your sandboxes — live ones only unless --all")}`);
  out.push(`  ${import_picocolors61.default.cyan("machine rm")} ${import_picocolors61.default.dim("<id>")}               ${import_picocolors61.default.dim("tear a sandbox down (it bills until you do)")}`);
  out.push("");
  out.push(divider("BENCHMARKS"));
  out.push("");
  out.push(`  ${import_picocolors61.default.cyan("benchmark list")}                    ${import_picocolors61.default.dim("list benchmarks for the linked agent")}`);
  out.push(`  ${import_picocolors61.default.cyan("benchmark init")} ${import_picocolors61.default.dim("[directory]")}        ${import_picocolors61.default.dim("scaffold a local benchmark")}`);
  out.push(`  ${import_picocolors61.default.cyan("benchmark create")} ${import_picocolors61.default.dim("[path|-]")}         ${import_picocolors61.default.dim("create a benchmark draft")}`);
  out.push(`  ${import_picocolors61.default.cyan("benchmark run")} ${import_picocolors61.default.dim("<benchmark> --yes")}   ${import_picocolors61.default.dim("plan and start a benchmark run")}`);
  out.push(`  ${import_picocolors61.default.cyan("benchmark results")} ${import_picocolors61.default.dim("<run>")}           ${import_picocolors61.default.dim("inspect normalized benchmark results")}`);
  out.push("");
  out.push(divider("BENCHMARK RUNTIME"));
  out.push("");
  out.push(`  ${import_picocolors61.default.cyan("benchmark hydrate")} ${import_picocolors61.default.dim("--spec <path> --result <path> --json")}`);
  out.push(`  ${import_picocolors61.default.cyan("benchmark evaluate")} ${import_picocolors61.default.dim("--spec <path> --result <path> --json")}`);
  out.push(`  ${import_picocolors61.default.cyan("benchmark capabilities")} ${import_picocolors61.default.dim("--json")}`);
  out.push("");
  out.push(divider("ORCHESTRATIONS"));
  out.push("");
  out.push(`  ${import_picocolors61.default.cyan("orchestration create")}           ${import_picocolors61.default.dim("claim a local orchestration manifest and create it in the cloud")}`);
  out.push(`  ${import_picocolors61.default.cyan("orchestration list")}             ${import_picocolors61.default.dim("list orchestrations under a team")}`);
  out.push(`  ${import_picocolors61.default.cyan("orchestration pull")} ${import_picocolors61.default.dim("<id>")}        ${import_picocolors61.default.dim("recursively fetch an orchestration + every member agent")}`);
  out.push(`  ${import_picocolors61.default.cyan("orchestration push")}             ${import_picocolors61.default.dim("recursively push each member, then update the graph")}`);
  out.push(`  ${import_picocolors61.default.cyan("orchestration status")}           ${import_picocolors61.default.dim("show what would push and what would pull")}`);
  out.push("");
  out.push(divider("TEMPLATES"));
  out.push("");
  out.push(`  ${import_picocolors61.default.cyan("template pack")}                       ${import_picocolors61.default.dim("bundle the current agent into a template")}`);
  out.push(`  ${import_picocolors61.default.cyan("template publish")}                    ${import_picocolors61.default.dim("upload a template to the registry")}`);
  out.push(`  ${import_picocolors61.default.cyan("template search")} ${import_picocolors61.default.dim("[query]")}             ${import_picocolors61.default.dim("search the registry")}`);
  out.push(`  ${import_picocolors61.default.cyan("template info")}    ${import_picocolors61.default.dim("<creator/slug>")}     ${import_picocolors61.default.dim("show registry details for a template")}`);
  out.push(`  ${import_picocolors61.default.cyan("template onboard")} ${import_picocolors61.default.dim("<creator/slug>")}     ${import_picocolors61.default.dim("install (or refresh) a template")}`);
  out.push(`  ${import_picocolors61.default.cyan("template list")}                       ${import_picocolors61.default.dim("show installed templates")}`);
  out.push(`  ${import_picocolors61.default.cyan("template remove")}  ${import_picocolors61.default.dim("<creator/slug>")}     ${import_picocolors61.default.dim("uninstall a template")}`);
  out.push("");
  out.push(divider("SKILLS"));
  out.push("");
  out.push(`  ${import_picocolors61.default.cyan("skill add")} ${import_picocolors61.default.dim("<source>")}                  ${import_picocolors61.default.dim("install a skill (github / git / brainbase)")}`);
  out.push(`  ${import_picocolors61.default.cyan("skill list")}                            ${import_picocolors61.default.dim("show locally installed skills + their source")}`);
  out.push(`  ${import_picocolors61.default.cyan("skill update")} ${import_picocolors61.default.dim("<slug>")}                  ${import_picocolors61.default.dim("re-fetch a skill from its recorded source")}`);
  out.push(`  ${import_picocolors61.default.cyan("skill remove")} ${import_picocolors61.default.dim("<slug>")}                  ${import_picocolors61.default.dim("uninstall a skill")}`);
  out.push(`  ${import_picocolors61.default.cyan("skill search")} ${import_picocolors61.default.dim("[query]")}                 ${import_picocolors61.default.dim("search the brainbase skill registry")}`);
  out.push(`  ${import_picocolors61.default.cyan("skill info")} ${import_picocolors61.default.dim("<creator/slug>")}            ${import_picocolors61.default.dim("show registry details for a skill")}`);
  out.push(`  ${import_picocolors61.default.cyan("skill publish")} ${import_picocolors61.default.dim("[dir]")}                  ${import_picocolors61.default.dim("publish a SKILL.md folder (defaults to .)")}`);
  out.push("");
  out.push(divider("CLI TOKENS"));
  out.push("");
  out.push(`  ${import_picocolors61.default.cyan("token create")}                        ${import_picocolors61.default.dim("issue a long-lived CLI key for CI / scripts")}`);
  out.push(`  ${import_picocolors61.default.cyan("token list")}                          ${import_picocolors61.default.dim("show your tokens")}`);
  out.push(`  ${import_picocolors61.default.cyan("token rename")} ${import_picocolors61.default.dim("<id>")}                  ${import_picocolors61.default.dim("relabel a token")}`);
  out.push(`  ${import_picocolors61.default.cyan("token revoke")} ${import_picocolors61.default.dim("<id>")}                  ${import_picocolors61.default.dim("revoke a token")}`);
  out.push("");
  out.push(divider("MCP"));
  out.push("");
  out.push(`  ${import_picocolors61.default.cyan("mcp check")} ${import_picocolors61.default.dim("[--json]")}              ${import_picocolors61.default.dim("verify MCP server connectivity through the brainbase proxy (runs at sandbox bootstrap)")}`);
  out.push(`  ${import_picocolors61.default.cyan("mcp list")} ${import_picocolors61.default.dim("[--json]")}               ${import_picocolors61.default.dim("show configured servers with OAuth state and expiry")}`);
  out.push("");
  out.push(divider("FLAGS"));
  out.push("");
  out.push(`  ${import_picocolors61.default.dim("--harness <id>")}     force harness for onboard / sync (e.g. claude-code)`);
  out.push(`  ${import_picocolors61.default.dim("--scope <s>")}        force scope: global | project`);
  out.push(`  ${import_picocolors61.default.dim("--yes, -y")}          skip confirmations / auto-overwrite`);
  out.push(`  ${" ".repeat("--yes, -y".length)}          required for destructive commands with no terminal (pipes, CI)`);
  out.push(`  ${import_picocolors61.default.dim("--agent <id>")}       for link/task create: use this agent id explicitly (task list: filter to it)`);
  out.push(`  ${import_picocolors61.default.dim("--message <text>")}   for task create: required first user message`);
  out.push(`  ${import_picocolors61.default.dim("--title <text>")}     for task create: optional task title`);
  out.push(`  ${import_picocolors61.default.dim("--model <id>")}       for task create: optional model override`);
  out.push(`  ${import_picocolors61.default.dim("--wait")}             for task create: block until the task finishes; exit 1 unless it succeeded`);
  out.push(`  ${import_picocolors61.default.dim("--timeout <secs>")}   for task create --wait: give up after <secs> and exit 1`);
  out.push(`  ${import_picocolors61.default.dim("--limit <n>")}        for task list (1-200), task logs (events to print; with --follow, the first page size) and machine ls`);
  out.push(`  ${import_picocolors61.default.dim("--follow, -f")}       for task logs: stay attached and print events as they land`);
  out.push(`  ${import_picocolors61.default.dim("--org <id-or-slug>")} pick the organization (team/agent list, agent create, orchestration create/list)`);
  out.push(`  ${import_picocolors61.default.dim("--team <id>")}        pick the team, same commands (works without --org)`);
  out.push(`  ${import_picocolors61.default.dim("--json")}             machine-readable output for supported commands`);
  out.push(`  ${import_picocolors61.default.dim("--no-tracking")}      for link: skip routing LLM traffic through brainbase`);
  out.push(`  ${import_picocolors61.default.dim("--track")}            for agent create: enable tracking non-interactively (off without a TTY)`);
  out.push(`  ${import_picocolors61.default.dim("--shell <sh|fish>")}  for agent env: pick output format (auto-detected from $SHELL)`);
  out.push(`  ${import_picocolors61.default.dim("--bot-token <t>")}    for agent connect slack (or BRAINBASE_SLACK_BOT_TOKEN, or stdin)`);
  out.push(`  ${import_picocolors61.default.dim("--signing-secret <s>")} for agent connect slack (or BRAINBASE_SLACK_SIGNING_SECRET, or stdin)`);
  out.push(`  ${import_picocolors61.default.dim("--bot-name <name>")}  for agent connect meeting: the bot's display name`);
  out.push(`  ${import_picocolors61.default.dim("--full")}             for agent init: write a commented template covering every block`);
  out.push(`  ${import_picocolors61.default.dim("--minimal")}          for agent init: write the starter manifest (the default)`);
  out.push(`  ${import_picocolors61.default.dim("--all")}              for template list: include installs from other folders; for machine ls: include torn-down machines`);
  out.push(`  ${import_picocolors61.default.dim("--web <url>")}        for login: web app URL (default https://app.brainbaselabs.com)`);
  out.push("");
  out.push(divider("ENV"));
  out.push("");
  out.push(`  ${import_picocolors61.default.dim("BRAINBASE_HOME")}         override the local config dir (default ~/.brainbase)`);
  out.push(`  ${import_picocolors61.default.dim("BRAINBASE_DEBUG")}        print full stack traces on error (any value; unset to disable)`);
  out.push(`  ${import_picocolors61.default.dim("BRAINBASE_WEB_URL")}      override the web app URL used by login`);
  out.push(`  ${import_picocolors61.default.dim("BRAINBASE_CONTROL_PLANE_URL")} override the MAS host (/v2/cli; task commands use /v2/tasks)`);
  out.push(`  ${import_picocolors61.default.dim("BRAINBASE_API_URL")}      legacy KLS host override (uses /api/cli; proxy/registry fallback)`);
  out.push(`  ${import_picocolors61.default.dim("BRAINBASE_PROXY_URL")}    override the model-proxy URL used by harness traffic (default https://api.v1.brainbaselabs.com)`);
  out.push(`  ${import_picocolors61.default.dim("BRAINBASE_REGISTRY_URL")} override the registry API URL (default https://api.v1.brainbaselabs.com)`);
  out.push(`  ${import_picocolors61.default.dim("BRAINBASE_TOKEN")}        long-lived CLI PAT; the only PAT control-plane commands accept (token.json is not read there)`);
  out.push(`  ${import_picocolors61.default.dim("BRAINBASE_SKIP_AUTH")}    bypass the auth gate for development`);
  out.push(`  ${import_picocolors61.default.dim("BRAINBASE_NON_INTERACTIVE")} force non-interactive mode — skip/auto-default prompts (CI & agents)`);
  out.push(`  ${import_picocolors61.default.dim("BRAINBASE_RUN_ENTRYPOINT")} =1 → agent pull executes the agent entrypoint (sandbox boots; or pass --run-entrypoint)`);
  out.push("");
  out.push(`  ${import_picocolors61.default.dim("BRAINBASE_MEMORY_MCP_URL")}        override the built-in memory MCP host`);
  out.push(`  ${import_picocolors61.default.dim("BRAINBASE_BROWSER_MCP_URL")}       override the built-in browser MCP host`);
  out.push(`  ${import_picocolors61.default.dim("BRAINBASE_SLACK_MCP_URL")}         override the built-in Slack MCP host`);
  out.push(`  ${import_picocolors61.default.dim("BRAINBASE_MEETING_MCP_URL")}       override the built-in meeting MCP host`);
  out.push(`  ${import_picocolors61.default.dim("BRAINBASE_GITHUB_MCP_URL")}        override the built-in GitHub MCP host`);
  out.push(`  ${import_picocolors61.default.dim("BRAINBASE_LINEAR_MCP_URL")}        override the built-in Linear MCP host`);
  out.push(`  ${import_picocolors61.default.dim("BRAINBASE_ORCHESTRATION_MCP_URL")} override the built-in orchestration MCP host`);
  out.push("");
  out.push(divider("HARNESSES"));

// ===== lines 64924,64975 =====
// src/core/secrets-env.ts
import path79 from "node:path";
import fs72 from "node:fs";
var SECRETS_FILE = "secrets.env";
function secretsPath(cwd2) {
  return path79.join(cwd2, LINK_DIR, SECRETS_FILE);
}
var VALID_KEY = /^[A-Z][A-Z0-9_]*$/;
function parseSecretsEnv(text2) {
  const out = {};
  const lines = text2.split(/\r?\n/);
  for (const raw of lines) {
    const line = raw.replace(/^\s+/, "");
    if (!line || line.startsWith("#"))
      continue;
    const eq = line.indexOf("=");
    if (eq <= 0)
      continue;
    const key2 = line.slice(0, eq).trim();
    let value = line.slice(eq + 1);
    if (value.startsWith('"') && value.endsWith('"') || value.startsWith("'") && value.endsWith("'")) {
      value = value.slice(1, -1);
    }
    if (!VALID_KEY.test(key2))
      continue;
    out[key2] = value;
  }
  return out;
}
function formatSecretsEnv(secrets) {
  const keys2 = Object.keys(secrets).sort();
  const lines = [
    "# Brainbase agent secrets — auto-generated by `brainbase agent pull`.",
    "# Edit values here, then run `brainbase agent push` to sync back to the cloud.",
    "# This file is gitignored. Do NOT commit it.",
    ""
  ];
  for (const k3 of keys2) {
    const v3 = secrets[k3] ?? "";
    const escaped = v3.replace(/\\/g, "\\\\").replace(/"/g, "\\\"");
    lines.push(`${k3}="${escaped}"`);
  }
  return lines.join(`
`) + `
`;
}
function readLocalSecrets(cwd2) {
  const p2 = secretsPath(cwd2);
  if (!exists(p2))
    return {};
  return parseSecretsEnv(fs72.readFileSync(p2, "utf8"));
}

// ===== lines 54540,54570 =====
    if (res.status === 409 && code === "idempotency_request_in_progress") {
      if (typeof detailObject?.task_id === "string") {
        recoveryTaskId = detailObject.task_id;
      }
      recoveryDeadline ??= Date.now() + MAS_IN_PROGRESS_MAX_WAIT_MS;
      const delayMs = masRetryDelayMs(res.headers.get("Retry-After"), 1000);
      if (Date.now() + delayMs >= recoveryDeadline) {
        throw new ApiError(recoveryTaskId ? `Task ${recoveryTaskId} is still being processed. Check its status before starting another task.` : masApiErrorMessage(body, res.status), res.status, body);
      }
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      continue;
    }
    if (res.status >= 500 && transientHttpRetriesRemaining > 0) {
      transientHttpRetriesRemaining -= 1;
      requestMayHaveSucceeded = true;
      const delayMs = masRetryDelayMs(res.headers.get("Retry-After"), 250);
      if (recoveryDeadline !== null && Date.now() + delayMs >= recoveryDeadline) {
        throw new TaskRecoveryDeadlineError(recoveryTaskId ? `Task ${recoveryTaskId} is still being processed. Check its status before starting another task.` : "Task creation may still be processing. Check your tasks before running this command again.");
      }
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      continue;
    }
    if (!res.ok) {
      const message = masApiErrorMessage(body, res.status);
      throw new ApiError(res.status >= 500 ? `${message} Task creation may still be processing; check your tasks before running this command again.` : res.status === 401 ? withRejectedSessionHint(message, credential.source, "managed-task") : message, res.status, body);
    }
    return body;
  }
}
async function masReadRequest(pathname, callerSignal) {
  const credential = await resolveMasCredential();

// ===== lines 76350,76360 =====
var PaginatedRequestSchema = RequestSchema.extend({
  params: PaginatedRequestParamsSchema.optional()
});
var PaginatedResultSchema = ResultSchema.extend({
  nextCursor: CursorSchema.optional()
});
var TaskStatusSchema = _enum(["working", "input_required", "completed", "failed", "cancelled"]);
var TaskSchema = object2({
  taskId: string2(),
  status: TaskStatusSchema,
  ttl: union2([number2(), _null3()]),

// ===== lines 80540,80552 =====
import { randomUUID as randomUUID2 } from "node:crypto";

// src/cli/task-status.ts
var TERMINAL_TASK_STATUSES = new Set([
  "success",
  "fail",
  "need_more_info"
]);
var SUCCESS_STATUS = "success";
function isTerminalTaskStatus(status) {
  return TERMINAL_TASK_STATUSES.has(status);
}
function exitCodeForTaskStatus(status) {

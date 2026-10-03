// Layer rules from docs/ARCHITECTURE.md §4. import/no-restricted-paths
// resolves each import to a real file, so relative paths and the "@/"
// alias are caught alike; no-restricted-imports bans packages by name.
import { readdirSync } from "node:fs";

const app = "./src/app";
const components = "./src/components";
const harness = "./src/server/harness";
const agent = "./src/server/agent";
const modules = "./src/server/modules";
const adapters = "./src/server/adapters";
const platform = "./src/server/platform";
const mockGov = "./src/server/mock-gov";
const composition = "./src/server/composition.ts";

const zone = (target, from, message, except) => ({ target, from, message, except });

const layerZones = [
  zone(
    app,
    [agent, modules, adapters, platform, composition],
    "app/ reaches the server only through the harness.",
  ),
  // The mock's own route files are its HTTP edge, the one way in.
  zone(
    [`${app}/!(api)/**`, `${app}/*.{ts,tsx}`, `${app}/api/!(mock-gov)/**`],
    mockGov,
    "Only app/api/mock-gov reaches the mock; everything else calls it over HTTP.",
  ),
  zone(
    components,
    "./src/server",
    "Components render state and call route handlers; they never import server code.",
  ),
  zone(
    harness,
    [adapters, mockGov],
    "The harness gets adapters from composition.ts, never directly.",
  ),
  zone(
    agent,
    [app, harness, adapters, mockGov, composition],
    "The agent depends on modules and its own ports, never on the harness or adapters.",
  ),
  zone(
    modules,
    [app, harness, agent, adapters, mockGov, composition],
    "Domain modules depend only on their ports, platform and other modules' index.ts.",
  ),
  zone(
    adapters,
    [app, harness, mockGov, composition],
    "Adapters implement ports; they hold no domain logic.",
  ),
  zone(adapters, agent, "Adapters may import only the agent's port types.", ["./ports.ts"]),
  zone(
    platform,
    [app, harness, agent, modules, adapters, mockGov, composition],
    "Platform is the bottom layer; it imports nothing above it.",
  ),
  zone(
    mockGov,
    [app, harness, agent, modules, adapters, composition],
    "mock-gov stands in for an external system: platform only, reached over HTTP.",
  ),
];

// Code outside a module may import only its index.ts.
const moduleIds = readdirSync(modules, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name);

const privacyZones = moduleIds.map((id) =>
  zone(
    [
      `./src/{app,components,test}/**`,
      `./src/server/{harness,agent,adapters,platform,mock-gov}/**`,
      composition,
      `${modules}/!(${id})/**`,
    ],
    `${modules}/${id}`,
    `Import the ${id} module through its index.ts only.`,
    ["./index.ts"],
  ),
);

export const boundaries = [
  {
    files: ["src/**/*.{ts,tsx}"],
    rules: {
      "import/no-restricted-paths": ["error", { zones: [...layerZones, ...privacyZones] }],
    },
  },
  {
    files: ["src/server/modules/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["langchain", "langchain/*", "@langchain/*"],
              message:
                "Domain modules never import LangChain or LangGraph, so business rules run without a model.",
            },
          ],
        },
      ],
    },
  },
];

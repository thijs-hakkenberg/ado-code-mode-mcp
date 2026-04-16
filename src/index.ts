import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { parseArgs } from "node:util";
import { Catalog } from "./catalog/index.js";
import { allEntries } from "./catalog/all.js";
import { createAuthHandler } from "./auth.js";
import { createServer } from "./server.js";

async function main() {
  const { values } = parseArgs({
    options: {
      org: { type: "string" },
      auth: { type: "string", default: "auto" },
      timeout: { type: "string", default: "120000" },
    },
    strict: false,
  });

  const org = values.org ?? process.env.AZURE_DEVOPS_ORG;
  if (!org) {
    console.error(
      "Error: Azure DevOps organization is required.\n" +
      "Set AZURE_DEVOPS_ORG environment variable or use --org flag.\n\n" +
      "Example:\n" +
      "  AZURE_DEVOPS_ORG=myorg npx ado-code-mode-mcp\n" +
      "  npx ado-code-mode-mcp --org myorg",
    );
    process.exit(1);
  }

  const timeout = parseInt(values.timeout as string, 10) || 120_000;

  const authHandler = createAuthHandler({
    mode: (values.auth as "pat" | "azcli" | "auto") ?? "auto",
  });

  const catalog = new Catalog(allEntries);

  // Stub proxy — in production this will be wired to azure-devops-node-api
  // via createConnection(). For now, methods return helpful errors.
  const createProxy = () => {
    const notImplemented = (method: string) => async () => {
      throw new Error(
        `${method} is not yet connected to Azure DevOps. ` +
        `The proxy layer is a work in progress. ` +
        `Org: ${org}, Auth: ${authHandler.mode}`,
      );
    };

    return {
      workItems: {
        get: notImplemented("ado.workItems.get"),
        getBatch: notImplemented("ado.workItems.getBatch"),
        create: notImplemented("ado.workItems.create"),
        update: notImplemented("ado.workItems.update"),
        delete: notImplemented("ado.workItems.delete"),
        query: notImplemented("ado.workItems.query"),
        list: notImplemented("ado.workItems.list"),
        addComment: notImplemented("ado.workItems.addComment"),
        link: notImplemented("ado.workItems.link"),
        getChildren: notImplemented("ado.workItems.getChildren"),
        myWorkItems: notImplemented("ado.workItems.myWorkItems"),
      },
      work: {
        listTeamIterations: notImplemented("ado.work.listTeamIterations"),
        getWorkItemsForIteration: notImplemented("ado.work.getWorkItemsForIteration"),
        getTeamCapacity: notImplemented("ado.work.getTeamCapacity"),
        getTeamSettings: notImplemented("ado.work.getTeamSettings"),
      },
      repos: {
        list: notImplemented("ado.repos.list"),
        get: notImplemented("ado.repos.get"),
        listPullRequests: notImplemented("ado.repos.listPullRequests"),
        getPullRequest: notImplemented("ado.repos.getPullRequest"),
        createPullRequest: notImplemented("ado.repos.createPullRequest"),
        listBranches: notImplemented("ado.repos.listBranches"),
        getFileContent: notImplemented("ado.repos.getFileContent"),
        listCommits: notImplemented("ado.repos.listCommits"),
      },
      pipelines: {
        listDefinitions: notImplemented("ado.pipelines.listDefinitions"),
        listBuilds: notImplemented("ado.pipelines.listBuilds"),
        getBuild: notImplemented("ado.pipelines.getBuild"),
        getBuildLog: notImplemented("ado.pipelines.getBuildLog"),
        runPipeline: notImplemented("ado.pipelines.runPipeline"),
      },
      core: {
        listProjects: notImplemented("ado.core.listProjects"),
        getProject: notImplemented("ado.core.getProject"),
        listTeams: notImplemented("ado.core.listTeams"),
      },
      wiki: {
        list: notImplemented("ado.wiki.list"),
        getPage: notImplemented("ado.wiki.getPage"),
        listPages: notImplemented("ado.wiki.listPages"),
        createOrUpdatePage: notImplemented("ado.wiki.createOrUpdatePage"),
      },
      search: {
        code: notImplemented("ado.search.code"),
        workItems: notImplemented("ado.search.workItems"),
        wiki: notImplemented("ado.search.wiki"),
      },
      testPlans: {
        listPlans: notImplemented("ado.testPlans.listPlans"),
        listSuites: notImplemented("ado.testPlans.listSuites"),
        listCases: notImplemented("ado.testPlans.listCases"),
        getResults: notImplemented("ado.testPlans.getResults"),
      },
      security: {
        getAlerts: notImplemented("ado.security.getAlerts"),
        getAlertDetails: notImplemented("ado.security.getAlertDetails"),
      },
    };
  };

  const server = createServer({ catalog, proxyFactory: createProxy, timeout });
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("Fatal:", err.message ?? err);
  process.exit(1);
});

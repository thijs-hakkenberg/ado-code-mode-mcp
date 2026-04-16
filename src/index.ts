import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { parseArgs } from "node:util";
import { Catalog } from "./catalog/index.js";
import { allEntries } from "./catalog/all.js";
import { createAuthHandler } from "./auth.js";
import { createConnection } from "./connection.js";
import { createServer } from "./server.js";
import * as WIT from "azure-devops-node-api/interfaces/WorkItemTrackingInterfaces.js";
import * as GitInterfaces from "azure-devops-node-api/interfaces/GitInterfaces.js";

async function streamToText(stream: NodeJS.ReadableStream): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string));
  }
  return Buffer.concat(chunks).toString("utf8");
}

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

  // Establish connection once at startup; refresh for azcli (bearer tokens expire ~1h)
  let connection = await createConnection(org as string, authHandler);

  // Lazy API client cache — each client is initialised on first use
  type WitApi     = Awaited<ReturnType<typeof connection.getWorkItemTrackingApi>>;
  type WorkApiT   = Awaited<ReturnType<typeof connection.getWorkApi>>;
  type GitApiT    = Awaited<ReturnType<typeof connection.getGitApi>>;
  type BuildApiT  = Awaited<ReturnType<typeof connection.getBuildApi>>;
  type CoreApiT   = Awaited<ReturnType<typeof connection.getCoreApi>>;
  type WikiApiT   = Awaited<ReturnType<typeof connection.getWikiApi>>;
  type AlertApiT  = Awaited<ReturnType<typeof connection.getAlertApi>>;
  type PipesApiT  = Awaited<ReturnType<typeof connection.getPipelinesApi>>;
  type ReleaseApiT = Awaited<ReturnType<typeof connection.getReleaseApi>>;
  type TestApiT   = Awaited<ReturnType<typeof connection.getTestApi>>;
  type TestPlanApiT = Awaited<ReturnType<typeof connection.getTestPlanApi>>;

  let _wit: WitApi | null = null;
  let _work: WorkApiT | null = null;
  let _git: GitApiT | null = null;
  let _build: BuildApiT | null = null;
  let _core: CoreApiT | null = null;
  let _wiki: WikiApiT | null = null;
  let _alert: AlertApiT | null = null;
  let _pipes: PipesApiT | null = null;
  let _release: ReleaseApiT | null = null;
  let _test: TestApiT | null = null;
  let _testPlan: TestPlanApiT | null = null;

  const witApi     = async () => { if (!_wit)     _wit     = await connection.getWorkItemTrackingApi(); return _wit; };
  const workApi    = async () => { if (!_work)    _work    = await connection.getWorkApi();              return _work; };
  const gitApi     = async () => { if (!_git)     _git     = await connection.getGitApi();               return _git; };
  const buildApi   = async () => { if (!_build)   _build   = await connection.getBuildApi();             return _build; };
  const coreApi    = async () => { if (!_core)    _core    = await connection.getCoreApi();              return _core; };
  const wikiApi    = async () => { if (!_wiki)    _wiki    = await connection.getWikiApi();              return _wiki; };
  const alertApi   = async () => { if (!_alert)   _alert   = await connection.getAlertApi();             return _alert; };
  const pipesApi   = async () => { if (!_pipes)   _pipes   = await connection.getPipelinesApi();         return _pipes; };
  const releaseApi = async () => { if (!_release) _release = await connection.getReleaseApi();           return _release; };
  const testApi    = async () => { if (!_test)    _test    = await connection.getTestApi();              return _test; };
  const testPlanApi = async () => { if (!_testPlan) _testPlan = await connection.getTestPlanApi();       return _testPlan; };

  // Refresh azcli bearer token before it expires (~1h); clears cached clients so they reinit
  if (authHandler.mode === "azcli") {
    setInterval(() => {
      createConnection(org as string, authHandler).then((newConn) => {
        connection = newConn;
        _wit = null; _work = null; _git = null; _build = null; _core = null;
        _wiki = null; _alert = null; _pipes = null; _release = null; _test = null; _testPlan = null;
      }).catch((err) => {
        console.error("Warning: failed to refresh Azure CLI token:", err.message ?? err);
      });
    }, 50 * 60 * 1000); // 50 min — safely inside the 60-min window
  }

  // Direct REST helpers for APIs not in the SDK (wiki pages, search, test plans)
  const authHeader = () => authHandler.getAuthorizationHeader();

  const restGet = async (url: string) => {
    const resp = await fetch(url, { headers: { Authorization: await authHeader() } });
    if (!resp.ok) throw new Error(`GET ${url} → ${resp.status}: ${await resp.text()}`);
    return resp.json();
  };

  const restPut = async (url: string, body: unknown, etag = "*") => {
    const resp = await fetch(url, {
      method: "PUT",
      headers: {
        Authorization: await authHeader(),
        "Content-Type": "application/json",
        "If-Match": etag,
      },
      body: JSON.stringify(body),
    });
    if (!resp.ok) throw new Error(`PUT ${url} → ${resp.status}: ${await resp.text()}`);
    return resp.json();
  };

  const restPost = async (url: string, body: unknown) => {
    const resp = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: await authHeader(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    if (!resp.ok) throw new Error(`POST ${url} → ${resp.status}: ${await resp.text()}`);
    return resp.json();
  };

  const restDelete = async (url: string) => {
    const resp = await fetch(url, {
      method: "DELETE",
      headers: { Authorization: await authHeader() },
    });
    if (!resp.ok) throw new Error(`DELETE ${url} → ${resp.status}: ${await resp.text()}`);
    return resp.status === 204 ? null : resp.json();
  };

  const catalog = new Catalog(allEntries);

  const createProxy = () => ({
    workItems: {
      get: async (id: number, fields?: string[], expand?: boolean) => {
        const api = await witApi();
        return api.getWorkItem(id, fields, undefined, expand ? WIT.WorkItemExpand.Relations : WIT.WorkItemExpand.None);
      },

      getBatch: async (ids: number[], fields?: string[]) => {
        const api = await witApi();
        return api.getWorkItems(ids, fields);
      },

      create: async ({ type, project, fields }: { type: string; project: string; fields: Record<string, unknown> }) => {
        const api = await witApi();
        const doc = Object.entries(fields).map(([key, val]) => ({
          op: "add",
          path: `/fields/${key}`,
          value: val,
        }));
        return api.createWorkItem({}, doc, project, type);
      },

      update: async (id: number, patches: { path: string; value: unknown; op?: string }[], project?: string) => {
        const api = await witApi();
        const doc = patches.map((p) => ({ op: p.op ?? "add", path: p.path, value: p.value }));
        return api.updateWorkItem({}, doc, id, project);
      },

      delete: async (id: number, project?: string) => {
        const api = await witApi();
        return api.deleteWorkItem(id, project);
      },

      query: async ({ wiql, project, top }: { wiql: string; project?: string; top?: number }) => {
        const api = await witApi();
        const teamContext = project ? { project } : undefined;
        return api.queryByWiql({ query: wiql }, teamContext, undefined, top);
      },

      list: async ({ project, team, type, state, top = 50 }: { project: string; team?: string; type?: string; state?: string; top?: number }) => {
        const api = await witApi();
        let query = `SELECT [System.Id],[System.Title],[System.State],[System.AssignedTo],[System.WorkItemType]`
          + ` FROM WorkItems WHERE [System.TeamProject] = '${project}'`;
        if (type)  query += ` AND [System.WorkItemType] = '${type}'`;
        if (state) query += ` AND [System.State] = '${state}'`;
        query += " ORDER BY [System.ChangedDate] DESC";
        const teamContext = team ? { project, team } : { project };
        const result = await api.queryByWiql({ query }, teamContext, undefined, top);
        if (!result.workItems?.length) return [];
        const ids = result.workItems.map((wi) => wi.id!);
        return api.getWorkItems(ids, ["System.Id", "System.Title", "System.State", "System.AssignedTo", "System.WorkItemType"]);
      },

      addComment: async (id: number, text: string, project?: string) => {
        if (!project) throw new Error("workItems.addComment requires project as the third argument");
        const api = await witApi();
        return api.addComment({ text }, project, id);
      },

      link: async (sourceId: number, targetId: number, linkType = "System.LinkTypes.Related", project?: string) => {
        const api = await witApi();
        const doc = [{
          op: "add",
          path: "/relations/-",
          value: {
            rel: linkType,
            url: `https://dev.azure.com/${org}/_apis/wit/workItems/${targetId}`,
          },
        }];
        return api.updateWorkItem({}, doc, sourceId, project);
      },

      getChildren: async (id: number) => {
        const api = await witApi();
        const item = await api.getWorkItem(id, undefined, undefined, WIT.WorkItemExpand.Relations);
        const childIds = (item.relations ?? [])
          .filter((r) => r.rel === "System.LinkTypes.Hierarchy-Forward")
          .map((r) => Number(r.url!.split("/").pop()));
        if (!childIds.length) return [];
        return api.getWorkItems(childIds);
      },

      myWorkItems: async () => {
        const api = await witApi();
        return api.getAccountMyWorkData();
      },

      getRevisions: async (id: number) => {
        const api = await witApi();
        return api.getRevisions(id);
      },

      getUpdates: async (id: number) => {
        return restGet(`https://dev.azure.com/${org}/_apis/wit/workItems/${id}/updates?api-version=7.0`);
      },

      getComments: async (id: number, project?: string) => {
        if (!project) throw new Error("workItems.getComments requires project as the second argument");
        const api = await witApi();
        return api.getComments(project, id);
      },

      removeLink: async (id: number, relationIndex: number, project?: string) => {
        const api = await witApi();
        const doc = [{ op: "remove", path: `/relations/${relationIndex}` }];
        return api.updateWorkItem({}, doc, id, project);
      },

      recycle: async (id: number, project?: string) => {
        const api = await witApi();
        return api.deleteWorkItem(id, project);
      },

      restore: async (id: number, project?: string) => {
        const api = await witApi();
        return api.restoreWorkItem({ isDeleted: false } as never, id, project);
      },

      getTypes: async (project: string) => {
        const api = await witApi();
        return api.getWorkItemTypes(project);
      },

      getStates: async (project: string, type: string) => {
        return restGet(`https://dev.azure.com/${org}/${project}/_apis/wit/workitemtypes/${encodeURIComponent(type)}/states?api-version=7.0`);
      },
    },

    work: {
      listTeamIterations: async ({ project, team, timeframe }: { project: string; team: string; timeframe?: string }) => {
        const api = await workApi();
        return api.getTeamIterations({ project, team }, timeframe);
      },

      getWorkItemsForIteration: async ({ project, team, iterationId }: { project: string; team: string; iterationId: string }) => {
        const api = await workApi();
        return api.getIterationWorkItems({ project, team }, iterationId);
      },

      getTeamCapacity: async ({ project, team, iterationId }: { project: string; team: string; iterationId: string }) => {
        const api = await workApi();
        return api.getCapacitiesWithIdentityRefAndTotals({ project, team }, iterationId);
      },

      getTeamSettings: async ({ project, team }: { project: string; team: string }) => {
        const api = await workApi();
        return api.getTeamSettings({ project, team });
      },

      getTeamFieldValues: async ({ project, team }: { project: string; team: string }) => {
        const api = await workApi();
        return api.getTeamFieldValues({ project, team });
      },

      getTeamDaysOff: async ({ project, team, iterationId }: { project: string; team: string; iterationId: string }) => {
        const api = await workApi();
        return api.getTeamDaysOff({ project, team }, iterationId);
      },

      getBoard: async ({ project, team, boardId }: { project: string; team: string; boardId: string }) => {
        const api = await workApi();
        return api.getBoard({ project, team }, boardId);
      },

      getBoardColumns: async ({ project, team, boardId }: { project: string; team: string; boardId: string }) => {
        const api = await workApi();
        return api.getBoardColumns({ project, team }, boardId);
      },
    },

    repos: {
      list: async ({ project }: { project?: string } = {}) => {
        const api = await gitApi();
        return api.getRepositories(project);
      },

      get: async (nameOrId: string, project?: string) => {
        const api = await gitApi();
        return api.getRepository(nameOrId, project);
      },

      listPullRequests: async ({ project, repoId, status = "active", top }: { project: string; repoId?: string; status?: string; top?: number }) => {
        const api = await gitApi();
        if (repoId) {
          return api.getPullRequests(repoId, { status: status as unknown as GitInterfaces.PullRequestStatus }, project, undefined, undefined, top);
        }
        // Cross-repo search via REST
        return restGet(`https://dev.azure.com/${org}/${project}/_apis/git/pullrequests?searchCriteria.status=${status}${top ? `&$top=${top}` : ""}&api-version=7.0`);
      },

      getPullRequest: async (id: number, repoId?: string, project?: string) => {
        const api = await gitApi();
        if (repoId) return api.getPullRequest(repoId, id, project);
        if (!project) throw new Error("getPullRequest requires either repoId or project for cross-repo lookup");
        return restGet(`https://dev.azure.com/${org}/${project}/_apis/git/pullrequests/${id}?api-version=7.0`);
      },

      createPullRequest: async ({ repoId, title, source, target = "main", description, project }: { repoId: string; title: string; source: string; target?: string; description?: string; project?: string }) => {
        const api = await gitApi();
        return api.createPullRequest({
          title,
          description,
          sourceRefName: source.startsWith("refs/") ? source : `refs/heads/${source}`,
          targetRefName: target.startsWith("refs/") ? target : `refs/heads/${target}`,
        } as GitInterfaces.GitPullRequest, repoId, project);
      },

      updatePullRequest: async ({ repoId, pullRequestId, updates, project }: { repoId: string; pullRequestId: number; updates: Partial<GitInterfaces.GitPullRequest>; project?: string }) => {
        const api = await gitApi();
        return api.updatePullRequest(updates as GitInterfaces.GitPullRequest, repoId, pullRequestId, project);
      },

      listBranches: async (repoId: string, project?: string) => {
        const api = await gitApi();
        return api.getBranches(repoId, project);
      },

      getFileContent: async ({ repoId, path, branch, project }: { repoId: string; path: string; branch?: string; project?: string }) => {
        const api = await gitApi();
        return api.getItem(
          repoId, path, project, undefined, undefined, undefined, undefined, undefined,
          branch ? { version: branch, versionType: GitInterfaces.GitVersionType.Branch } : undefined,
          true, // includeContent
        );
      },

      listCommits: async ({ repoId, branch, top = 20, project }: { repoId: string; branch?: string; top?: number; project?: string }) => {
        const api = await gitApi();
        return api.getCommits(repoId, branch ? { itemVersion: { version: branch } } : {}, project, 0, top);
      },

      getCommit: async ({ repoId, commitId, project }: { repoId: string; commitId: string; project?: string }) => {
        const api = await gitApi();
        return api.getCommit(commitId, repoId, project);
      },

      getDiff: async ({ repoId, base, target, project }: { repoId: string; base: string; target: string; project?: string }) => {
        const isSha = (s: string) => /^[0-9a-f]{40}$/i.test(s);
        const baseType = isSha(base) ? "commit" : "branch";
        const targetType = isSha(target) ? "commit" : "branch";
        const baseEnc = encodeURIComponent(base);
        const targetEnc = encodeURIComponent(target);
        return restGet(
          `https://dev.azure.com/${org}/${project ?? "_"}/_apis/git/repositories/${repoId}/diffs/commits?baseVersion=${baseEnc}&baseVersionType=${baseType}&targetVersion=${targetEnc}&targetVersionType=${targetType}&api-version=7.0`,
        );
      },

      getPullRequestThreads: async ({ repoId, pullRequestId, project }: { repoId: string; pullRequestId: number; project?: string }) => {
        const api = await gitApi();
        return api.getThreads(repoId, pullRequestId, project);
      },

      createPullRequestThread: async ({ repoId, pullRequestId, comment, filePath, line, project }: { repoId: string; pullRequestId: number; comment: string; filePath?: string; line?: number; project?: string }) => {
        const api = await gitApi();
        const thread: GitInterfaces.GitPullRequestCommentThread = {
          comments: [{ content: comment, commentType: GitInterfaces.CommentType.Text }],
          status: GitInterfaces.CommentThreadStatus.Active,
          ...(filePath && {
            threadContext: {
              filePath,
              rightFileStart: line ? { line, offset: 1 } : undefined,
              rightFileEnd: line ? { line, offset: 1 } : undefined,
            },
          }),
        };
        return api.createThread(thread, repoId, pullRequestId, project);
      },

      addPullRequestReviewer: async ({ repoId, pullRequestId, reviewerId, project }: { repoId: string; pullRequestId: number; reviewerId: string; project?: string }) => {
        const api = await gitApi();
        return api.createPullRequestReviewer({ id: reviewerId } as GitInterfaces.IdentityRefWithVote, repoId, pullRequestId, reviewerId, project);
      },

      listPullRequestWorkItems: async ({ repoId, pullRequestId, project }: { repoId: string; pullRequestId: number; project?: string }) => {
        const api = await gitApi();
        return api.getPullRequestWorkItemRefs(repoId, pullRequestId, project);
      },

      listItems: async ({ repoId, path = "/", branch, project }: { repoId: string; path?: string; branch?: string; project?: string }) => {
        const api = await gitApi();
        return api.getItems(
          repoId, project, path,
          GitInterfaces.VersionControlRecursionType.OneLevel,
          undefined, undefined, undefined, undefined,
          branch ? { version: branch, versionType: GitInterfaces.GitVersionType.Branch } : undefined,
        );
      },

      createBranch: async ({ repoId, name, sourceRef, project }: { repoId: string; name: string; sourceRef: string; project?: string }) => {
        const api = await gitApi();
        // Look up the source ref's object ID
        const sourceBranch = await api.getBranch(repoId, sourceRef, project);
        return api.createPush({
          refUpdates: [{
            name: name.startsWith("refs/") ? name : `refs/heads/${name}`,
            oldObjectId: "0000000000000000000000000000000000000000",
            newObjectId: sourceBranch.commit!.commitId,
          }],
          commits: [],
        } as GitInterfaces.GitPush, repoId, project);
      },

      deleteBranch: async ({ repoId, name, project }: { repoId: string; name: string; project?: string }) => {
        const api = await gitApi();
        const branch = await api.getBranch(repoId, name, project);
        return api.createPush({
          refUpdates: [{
            name: name.startsWith("refs/") ? name : `refs/heads/${name}`,
            oldObjectId: branch.commit!.commitId,
            newObjectId: "0000000000000000000000000000000000000000",
          }],
          commits: [],
        } as GitInterfaces.GitPush, repoId, project);
      },

      getStats: async ({ repoId, branch, project }: { repoId: string; branch?: string; project?: string }) => {
        const api = await gitApi();
        if (branch) return api.getBranch(repoId, branch, project);
        return api.getBranches(repoId, project);
      },
    },

    pipelines: {
      listDefinitions: async ({ project, name }: { project: string; name?: string }) => {
        const api = await buildApi();
        return api.getDefinitions(project, name);
      },

      getDefinition: async ({ project, definitionId }: { project: string; definitionId: number }) => {
        const api = await buildApi();
        return api.getDefinition(project, definitionId);
      },

      listBuilds: async ({ project, definitionId, status, top = 20 }: { project: string; definitionId?: number; status?: string; top?: number }) => {
        const api = await buildApi();
        // BuildStatus: notStarted=1, inProgress=2, cancelling=4, completed=8, all=31
        const statusMap: Record<string, number> = { notStarted: 1, inProgress: 2, cancelling: 4, completed: 8, all: 31 };
        const statusFilter = status ? statusMap[status] as never : undefined;
        return api.getBuilds(
          project,
          definitionId ? [definitionId] : undefined,
          undefined, undefined, undefined, undefined, undefined, undefined,
          statusFilter,
          undefined, undefined, undefined,
          top,
        );
      },

      getBuild: async ({ project, buildId }: { project: string; buildId: number }) => {
        const api = await buildApi();
        return api.getBuild(project, buildId);
      },

      getBuildLog: async ({ project, buildId, logId }: { project: string; buildId: number; logId?: number }) => {
        const api = await buildApi();
        if (logId !== undefined) {
          const stream = await api.getBuildLog(project, buildId, logId);
          return streamToText(stream);
        }
        return api.getBuildLogs(project, buildId);
      },

      getBuildTimeline: async ({ project, buildId }: { project: string; buildId: number }) => {
        const api = await buildApi();
        return api.getBuildTimeline(project, buildId);
      },

      runPipeline: async ({ project, definitionId, branch, parameters }: { project: string; definitionId: number; branch?: string; parameters?: Record<string, string> }) => {
        const api = await pipesApi();
        return api.runPipeline(
          {
            templateParameters: parameters,
            ...(branch && {
              resources: {
                repositories: {
                  self: { refName: branch.startsWith("refs/") ? branch : `refs/heads/${branch}` },
                },
              },
            }),
          },
          project,
          definitionId,
        );
      },

      cancelBuild: async ({ project, buildId }: { project: string; buildId: number }) => {
        const api = await buildApi();
        return api.updateBuild({ status: 4 /* Cancelling */ } as never, project, buildId);
      },

      listReleases: async ({ project, definitionId, top }: { project: string; definitionId?: number; top?: number }) => {
        const api = await releaseApi();
        return api.getReleases(project, definitionId, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, top);
      },

      getRelease: async ({ project, releaseId }: { project: string; releaseId: number }) => {
        const api = await releaseApi();
        return api.getRelease(project, releaseId);
      },

      listArtifacts: async ({ project, buildId }: { project: string; buildId: number }) => {
        const api = await buildApi();
        return api.getArtifacts(project, buildId);
      },

      getBuildChanges: async ({ project, buildId }: { project: string; buildId: number }) => {
        const api = await buildApi();
        return api.getBuildChanges(project, buildId);
      },
    },

    core: {
      listProjects: async () => {
        const api = await coreApi();
        return api.getProjects();
      },

      getProject: async (projectId: string) => {
        const api = await coreApi();
        return api.getProject(projectId, true);
      },

      listTeams: async ({ projectId, mine }: { projectId: string; mine?: boolean }) => {
        const api = await coreApi();
        return api.getTeams(projectId, mine);
      },
    },

    wiki: {
      list: async (project?: string) => {
        const api = await wikiApi();
        return api.getAllWikis(project);
      },

      getPage: async ({ project, wikiId, path }: { project: string; wikiId: string; path: string }) => {
        const encoded = encodeURIComponent(path);
        return restGet(`https://dev.azure.com/${org}/${project}/_apis/wiki/wikis/${wikiId}/pages?path=${encoded}&includeContent=true&api-version=7.0`);
      },

      listPages: async ({ project, wikiId }: { project: string; wikiId: string }) => {
        const api = await wikiApi();
        return api.getPagesBatch({ top: 200 } as never, project, wikiId);
      },

      createOrUpdatePage: async ({ project, wikiId, path, content }: { project: string; wikiId: string; path: string; content: string }) => {
        const encoded = encodeURIComponent(path);
        return restPut(
          `https://dev.azure.com/${org}/${project}/_apis/wiki/wikis/${wikiId}/pages?path=${encoded}&api-version=7.0`,
          { content },
        );
      },

      deletePage: async ({ project, wikiId, path }: { project: string; wikiId: string; path: string }) => {
        const encoded = encodeURIComponent(path);
        return restDelete(`https://dev.azure.com/${org}/${project}/_apis/wiki/wikis/${wikiId}/pages?path=${encoded}&api-version=7.0`);
      },
    },

    search: {
      code: async ({ project, searchText, top = 25 }: { project: string; searchText: string; top?: number }) => {
        return restPost(
          `https://almsearch.dev.azure.com/${org}/${project}/_apis/search/codesearchresults?api-version=7.0`,
          { searchText, $skip: 0, $top: top, includeFacets: false },
        );
      },

      workItems: async ({ project, searchText, top = 25 }: { project: string; searchText: string; top?: number }) => {
        return restPost(
          `https://almsearch.dev.azure.com/${org}/${project}/_apis/search/workitemsearchresults?api-version=7.0`,
          { searchText, $skip: 0, $top: top, includeFacets: false },
        );
      },

      wiki: async ({ project, searchText, top = 25 }: { project: string; searchText: string; top?: number }) => {
        return restPost(
          `https://almsearch.dev.azure.com/${org}/${project}/_apis/search/wikisearchresults?api-version=7.0`,
          { searchText, $skip: 0, $top: top, includeFacets: false },
        );
      },
    },

    testPlans: {
      listPlans: async ({ project }: { project: string }) => {
        const api = await testPlanApi();
        return api.getTestPlans(project);
      },

      getPlan: async ({ project, planId }: { project: string; planId: number }) => {
        return restGet(`https://dev.azure.com/${org}/${project}/_apis/testplan/plans/${planId}?api-version=7.0`);
      },

      listSuites: async ({ project, planId }: { project: string; planId: number }) => {
        return restGet(`https://dev.azure.com/${org}/${project}/_apis/testplan/plans/${planId}/suites?api-version=7.0`);
      },

      listCases: async ({ project, planId, suiteId }: { project: string; planId: number; suiteId: number }) => {
        return restGet(`https://dev.azure.com/${org}/${project}/_apis/testplan/plans/${planId}/suites/${suiteId}/testcase?api-version=7.0`);
      },

      createCase: async ({ project, planId, suiteId, title }: { project: string; planId: number; suiteId: number; title: string }) => {
        // Create work item of type Test Case, then link to suite
        const api = await witApi();
        const doc = [{ op: "add", path: "/fields/System.Title", value: title }];
        const testCase = await api.createWorkItem({}, doc, project, "Test Case");
        // Add to suite
        return restPost(
          `https://dev.azure.com/${org}/${project}/_apis/testplan/plans/${planId}/suites/${suiteId}/testcase?api-version=7.0`,
          [{ workItem: { id: testCase.id } }],
        );
      },

      getResults: async ({ project, buildId, top = 100 }: { project: string; buildId: number; top?: number }) => {
        const api = await testApi();
        return api.getTestResultsByBuild(project, buildId, undefined, undefined, top);
      },

      getRun: async ({ project, runId }: { project: string; runId: number }) => {
        return restGet(`https://dev.azure.com/${org}/${project}/_apis/test/Runs/${runId}?api-version=7.0`);
      },

      createRun: async ({ project, planId, name }: { project: string; planId: number; name: string }) => {
        const api = await testApi();
        return api.createTestRun({ name, plan: { id: String(planId) } } as never, project);
      },
    },

    security: {
      getAlerts: async ({ project, repoId, state }: { project: string; repoId: string; state?: string }) => {
        const api = await alertApi();
        return api.getAlerts(project, repoId, undefined, undefined, state ? { states: [state as never] } : undefined);
      },

      getAlertDetails: async ({ project, repoId, alertId }: { project: string; repoId: string; alertId: number }) => {
        const api = await alertApi();
        return api.getAlert(project, alertId, repoId);
      },
    },
  });

  const server = createServer({ catalog, proxyFactory: createProxy, timeout });
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("Fatal:", err.message ?? err);
  process.exit(1);
});

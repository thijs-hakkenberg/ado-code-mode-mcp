import { Domain } from "../types.js";
import type { CatalogEntry } from "../types.js";

export const coreEntries: CatalogEntry[] = [
  { id: "core.listProjects", domain: Domain.Core, name: "listProjects", title: "List Projects", description: "List all projects in the organization.", params: [], returns: "Project[] — projects with id, name, state, description", example: "await ado.core.listProjects()", tags: ["project", "list", "all", "organization"], readOnly: true },
  { id: "core.getProject", domain: Domain.Core, name: "getProject", title: "Get Project", description: "Get details of a specific project.", params: [{ name: "name", type: "string", required: true, description: "Project name or ID" }], returns: "Project — full project details", example: 'await ado.core.getProject("MyProj")', tags: ["project", "details", "info"], readOnly: true },
  { id: "core.listTeams", domain: Domain.Core, name: "listTeams", title: "List Teams", description: "List teams in a project.", params: [{ name: "project", type: "string", required: true, description: "Project name" }], returns: "Team[] — teams with id, name, description", example: 'await ado.core.listTeams("MyProj")', tags: ["team", "list", "members", "group"], readOnly: true },
  { id: "core.getTeam", domain: Domain.Core, name: "getTeam", title: "Get Team", description: "Get details of a specific team.", params: [{ name: "project", type: "string", required: true, description: "Project name" }, { name: "team", type: "string", required: true, description: "Team name or ID" }], returns: "Team — team details with members", example: 'await ado.core.getTeam({ project: "MyProj", team: "MyTeam" })', tags: ["team", "details", "members", "info"], readOnly: true },
];

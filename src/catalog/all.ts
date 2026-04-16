import type { CatalogEntry } from "./types.js";
import { workItemEntries } from "./domains/work-items.js";
import { workEntries } from "./domains/work.js";
import { repositoryEntries } from "./domains/repositories.js";
import { pipelineEntries } from "./domains/pipelines.js";
import { coreEntries } from "./domains/core.js";
import { wikiEntries } from "./domains/wiki.js";
import { searchEntries } from "./domains/search.js";
import { testPlanEntries } from "./domains/test-plans.js";
import { securityEntries } from "./domains/security.js";

export const allEntries: CatalogEntry[] = [
  ...workItemEntries,
  ...workEntries,
  ...repositoryEntries,
  ...pipelineEntries,
  ...coreEntries,
  ...wikiEntries,
  ...searchEntries,
  ...testPlanEntries,
  ...securityEntries,
];

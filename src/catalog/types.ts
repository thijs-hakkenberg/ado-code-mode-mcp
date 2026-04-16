export enum Domain {
  WorkItems = "work-items",
  Work = "work",
  Repositories = "repositories",
  Pipelines = "pipelines",
  Core = "core",
  Wiki = "wiki",
  Search = "search",
  TestPlans = "test-plans",
  Security = "security",
}

export interface OperationParam {
  name: string;
  type: "string" | "number" | "boolean" | "string[]" | "number[]" | "object";
  required: boolean;
  description: string;
  default?: unknown;
}

export interface CatalogEntry {
  id: string;
  domain: Domain;
  name: string;
  title: string;
  description: string;
  params: OperationParam[];
  returns: string;
  example: string;
  tags: string[];
  readOnly: boolean;
}

export interface SearchResult {
  entry: CatalogEntry;
  score: number;
}

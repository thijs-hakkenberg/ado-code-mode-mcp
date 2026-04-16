export interface ProjectorOptions {
  select?: string[];
  maxDepth?: number;
  maxArrayLength?: number;
  maxStringLength?: number;
}

const DEFAULT_STRIP_KEYS = new Set(["_links", "url", "remoteUrl"]);

const DEFAULTS: Required<Omit<ProjectorOptions, "select">> = {
  maxDepth: 3,
  maxArrayLength: 50,
  maxStringLength: 1000,
};

export function project(value: unknown, options: ProjectorOptions): unknown {
  const opts = { ...DEFAULTS, ...options };

  if (value === null) return null;
  if (value === undefined) return undefined;
  if (typeof value !== "object") {
    if (typeof value === "string" && opts.maxStringLength && value.length > opts.maxStringLength) {
      return value.slice(0, opts.maxStringLength) + "...[truncated]";
    }
    return value;
  }

  if (Array.isArray(value)) {
    return projectArray(value, opts, 1);
  }

  const obj = value as Record<string, unknown>;

  if (opts.select && opts.select.length > 0) {
    return selectFields(obj, opts.select, opts, 1);
  }

  return projectObject(obj, opts, 1);
}

function selectFields(
  obj: Record<string, unknown>,
  paths: string[],
  opts: Required<Omit<ProjectorOptions, "select">> & { select?: string[] },
  depth: number,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  // Group paths by their top-level key, handling dotted keys in the object
  const processed = new Set<string>();

  for (const path of paths) {
    if (processed.has(path)) continue;

    // Try exact match first (handles keys like "System.Title" that contain dots)
    if (path in obj) {
      const val = obj[path];
      if (val !== null && val !== undefined) {
        result[path] = projectValue(val, { ...opts, select: undefined }, depth + 1);
      }
      processed.add(path);
      continue;
    }

    // Try splitting at the first dot for nested navigation
    const dotIdx = path.indexOf(".");
    if (dotIdx === -1) continue; // not found in obj, skip

    const topKey = path.slice(0, dotIdx);
    if (!(topKey in obj)) continue;

    if (typeof obj[topKey] === "object" && obj[topKey] !== null && result[topKey] === undefined) {
      const subPaths = paths
        .filter((p) => p.startsWith(topKey + "."))
        .map((p) => p.slice(topKey.length + 1));
      result[topKey] = selectFields(
        obj[topKey] as Record<string, unknown>,
        subPaths,
        opts,
        depth + 1,
      );
      for (const sp of subPaths) {
        processed.add(topKey + "." + sp);
      }
    }
  }

  return result;
}

function projectObject(
  obj: Record<string, unknown>,
  opts: Required<Omit<ProjectorOptions, "select">>,
  depth: number,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const [key, val] of Object.entries(obj)) {
    if (val === null || val === undefined) continue;
    if (DEFAULT_STRIP_KEYS.has(key)) continue;

    result[key] = projectValue(val, opts, depth + 1);
  }

  return result;
}

function projectValue(
  val: unknown,
  opts: Required<Omit<ProjectorOptions, "select">> & { select?: string[] },
  depth: number,
): unknown {
  if (val === null || val === undefined) return val;

  if (typeof val === "string") {
    if (opts.maxStringLength && val.length > opts.maxStringLength) {
      return val.slice(0, opts.maxStringLength) + "...[truncated]";
    }
    return val;
  }

  if (typeof val !== "object") return val;

  if (depth > opts.maxDepth) {
    return Array.isArray(val) ? `[array(${val.length})]` : "[object]";
  }

  if (Array.isArray(val)) {
    return projectArray(val, opts, depth);
  }

  const objVal = val as Record<string, unknown>;
  if (opts.select && opts.select.length > 0) {
    return selectFields(objVal, opts.select, opts, depth);
  }
  return projectObject(objVal, opts, depth);
}

function projectArray(
  arr: unknown[],
  opts: Required<Omit<ProjectorOptions, "select">> & { select?: string[] },
  depth: number,
): unknown[] {
  const truncated = arr.length > opts.maxArrayLength;
  const slice = truncated ? arr.slice(0, opts.maxArrayLength) : arr;

  const projected = slice.map((item) => {
    if (item === null || item === undefined) return item;
    if (typeof item !== "object") return item;
    if (depth > opts.maxDepth) {
      return Array.isArray(item) ? `[array(${item.length})]` : "[object]";
    }
    if (Array.isArray(item)) return projectArray(item, opts, depth + 1);

    const objItem = item as Record<string, unknown>;
    if (opts.select && opts.select.length > 0) {
      return selectFields(objItem, opts.select, opts, depth);
    }
    return projectObject(objItem, opts, depth);
  });

  if (truncated) {
    projected.push(`[...${arr.length - opts.maxArrayLength} more]`);
  }

  return projected;
}

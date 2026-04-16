export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

const BANNED_PATTERNS = [
  { pattern: /\brequire\s*\(/, label: "require(" },
  { pattern: /\bimport\s+/, label: "import " },
  { pattern: /\bprocess\./, label: "process." },
  { pattern: /\bchild_process\b/, label: "child_process" },
  { pattern: /\bglobal\./, label: "global." },
  { pattern: /\bglobalThis\./, label: "globalThis." },
  { pattern: /\bfetch\s*\(/, label: "fetch(" },
  { pattern: /\beval\s*\(/, label: "eval(" },
  { pattern: /\bFunction\s*\(/, label: "Function(" },
];

export function validateCode(code: string): void {
  if (!code.trim()) {
    throw new ValidationError("Code cannot be empty.");
  }

  for (const { pattern, label } of BANNED_PATTERNS) {
    if (pattern.test(code)) {
      throw new ValidationError(
        `Banned pattern detected: '${label}'. ` +
        `The sandbox does not allow direct access to Node.js APIs. ` +
        `Use the 'ado' proxy object for Azure DevOps operations.`,
      );
    }
  }
}

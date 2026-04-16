import { AzureCliCredential } from "@azure/identity";

export type AuthMode = "pat" | "azcli" | "auto";

export interface AuthHandler {
  mode: AuthMode;
  getAuthorizationHeader(): Promise<string>;
  getRawToken(): Promise<string>;
}

interface AuthOptions {
  mode?: AuthMode;
  pat?: string;
}

export function createAuthHandler(options: AuthOptions = {}): AuthHandler {
  const mode = options.mode ?? (process.env.AZURE_DEVOPS_AUTH as AuthMode) ?? "auto";
  const pat = options.pat ?? process.env.AZURE_DEVOPS_PAT;

  const resolvedMode: AuthMode =
    mode === "auto" ? (pat ? "pat" : "azcli") :
    mode === "pat" ? "pat" :
    "azcli";

  if (resolvedMode === "pat") {
    if (!pat) {
      throw new Error("PAT auth selected but AZURE_DEVOPS_PAT is not set.");
    }
    const encoded = Buffer.from(`:${pat}`).toString("base64");
    return {
      mode: "pat",
      getAuthorizationHeader: async () => `Basic ${encoded}`,
      getRawToken: async () => pat,
    };
  }

  const credential = new AzureCliCredential();
  return {
    mode: "azcli",
    async getAuthorizationHeader() {
      const token = await credential.getToken("499b84ac-1321-427f-aa17-267ca6975798/.default");
      return `Bearer ${token.token}`;
    },
    async getRawToken() {
      const token = await credential.getToken("499b84ac-1321-427f-aa17-267ca6975798/.default");
      return token.token;
    },
  };
}

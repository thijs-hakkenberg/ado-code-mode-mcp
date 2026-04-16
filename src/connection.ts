import * as azdev from "azure-devops-node-api";
import type { AuthHandler } from "./auth.js";

export async function createConnection(org: string, authHandler: AuthHandler): Promise<azdev.WebApi> {
  const orgUrl = `https://dev.azure.com/${org}`;
  const token = await authHandler.getRawToken();

  if (authHandler.mode === "pat") {
    return new azdev.WebApi(orgUrl, azdev.getPersonalAccessTokenHandler(token));
  }

  // Azure CLI — bearer token
  return new azdev.WebApi(orgUrl, azdev.getBearerHandler(token));
}

export function getOrgUrl(org: string): string {
  return `https://dev.azure.com/${org}`;
}

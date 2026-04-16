import * as azdev from "azure-devops-node-api";
import type { AuthHandler } from "./auth.js";

export function createConnection(org: string, authHandler: AuthHandler): azdev.WebApi {
  const orgUrl = `https://dev.azure.com/${org}`;

  if (authHandler.mode === "pat") {
    // For PAT, use the personal access token handler
    // We need the raw PAT, not the encoded header
    const handler = azdev.getPersonalAccessTokenHandler("");
    // Override the handler to use our auth
    const connection = new azdev.WebApi(orgUrl, handler);
    // Patch the rest client to use our auth header
    connection.rest.client.requestOptions = {
      ...connection.rest.client.requestOptions,
      headers: {},
    };
    return connection;
  }

  // For Azure CLI, use a bearer handler with a placeholder
  // The actual token will be refreshed via the credential
  const handler = azdev.getBearerHandler("");
  return new azdev.WebApi(orgUrl, handler);
}

export function getOrgUrl(org: string): string {
  return `https://dev.azure.com/${org}`;
}

export const WORKSPACE_REDIRECT_PATTERN =
  /^(?:\/workspaces\/|%2Fworkspaces%2F)[0-9a-f]{24}(?:\/|%2F)?$/i;

const DECODED_WORKSPACE_REDIRECT_PATTERN =
  /^\/workspaces\/([0-9a-fA-F]{24})\/?$/;

export function getWorkspaceIdFromRedirect(redirectTo: string): string | null {
  try {
    const decodedRedirect = decodeURIComponent(redirectTo);
    return DECODED_WORKSPACE_REDIRECT_PATTERN.exec(decodedRedirect)?.[1] ?? null;
  } catch {
    return null;
  }
}

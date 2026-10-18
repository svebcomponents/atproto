import type { PermissionSetConfig } from "@svebcomponents/atproto.bridge";

/**
 * Reads `PERMISSION_SETS`: a JSON object of permission sets keyed by name,
 * in the shape of `ServiceConfig.permissionSets`. Unset or empty means none.
 * Only the outer shape is checked here; the bridge validates every field
 * when it is constructed, so a bad entry fails at startup either way.
 */
export const parsePermissionSets = (
  raw: string | undefined,
): Record<string, PermissionSetConfig> | undefined => {
  if (raw === undefined || raw.trim() === "") return undefined;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new Error("PERMISSION_SETS must be valid JSON");
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("PERMISSION_SETS must be a JSON object keyed by set name");
  }
  for (const [name, set] of Object.entries(value)) {
    if (typeof set !== "object" || set === null || Array.isArray(set)) {
      throw new Error(`PERMISSION_SETS.${name} must be an object`);
    }
    const { clientName, description, origins } = set as Record<string, unknown>;
    if (typeof clientName !== "string" || typeof description !== "string") {
      throw new Error(
        `PERMISSION_SETS.${name} needs clientName and description strings`,
      );
    }
    if (
      !Array.isArray(origins) ||
      !origins.every((o) => typeof o === "string")
    ) {
      throw new Error(
        `PERMISSION_SETS.${name}.origins must be an array of strings`,
      );
    }
  }
  return value as Record<string, PermissionSetConfig>;
};

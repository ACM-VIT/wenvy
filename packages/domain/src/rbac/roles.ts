export const dataRoles = ["none", "viewer", "editor", "admin", "owner"] as const;

export type DataRole = (typeof dataRoles)[number];

const roleRank = new Map<DataRole, number>(
  dataRoles.map((role, index) => [role, index])
);

export function compareDataRoles(left: DataRole, right: DataRole): number {
  return roleRank.get(left)! - roleRank.get(right)!;
}

export function maxDataRole(roles: readonly DataRole[]): DataRole {
  return roles.reduce<DataRole>(
    (current, next) => (compareDataRoles(next, current) > 0 ? next : current),
    "none"
  );
}

export function minDataRole(left: DataRole, right: DataRole): DataRole {
  return compareDataRoles(left, right) <= 0 ? left : right;
}

export function canRead(role: DataRole): boolean {
  return compareDataRoles(role, "viewer") >= 0;
}

export function canWrite(role: DataRole): boolean {
  return compareDataRoles(role, "editor") >= 0;
}

export function assertDataRole(value: string): asserts value is DataRole {
  if (!dataRoles.includes(value as DataRole)) {
    throw new Error(`Unsupported data role: ${value}`);
  }
}

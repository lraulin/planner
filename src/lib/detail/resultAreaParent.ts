/**
 * Where a Goal or Project should sit after the form's Result Area field is changed.
 *
 * The field names the *owning* Result Area, not the immediate parent. Changing it
 * reparents the row under that area (or to the top level when cleared). If the
 * selected area is already the owner, the immediate parent is left alone — a project
 * under a goal in Health stays under that goal when Health is re-saved.
 *
 * `undefined` means "do not move". That is the case a naive "parentId = resultAreaId
 * on every save" would get wrong, and it is the only reason this helper exists.
 */
export function parentIdForResultAreaChange(args: {
  currentResultAreaId: string | null;
  nextResultAreaId: string | null;
}): string | null | undefined {
  if (args.nextResultAreaId === args.currentResultAreaId) return undefined;
  return args.nextResultAreaId;
}

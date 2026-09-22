import type { ExtractedFields } from "./schema";

/** Sum of every line item's Amount — null (not zero) when none has one yet, so it doesn't clobber a value Claude already read. */
export function sumLineItemAmounts(lineItems: ExtractedFields["service"]["line_items"]): number | null {
  const amounts = lineItems.map((l) => l.amount).filter((a): a is number => a !== null);
  if (amounts.length === 0) return null;
  return amounts.reduce((sum, a) => sum + a, 0);
}

/**
 * A document freshly extracted (or only ever seen through a grid) can have
 * line items with amounts but no Taxable value — the auto-fill from line
 * items only used to run when someone edited a line item by hand. This
 * applies the same fallback once, up front, so the single-document forms
 * and both grids all start from the same, already-summed figure instead of
 * showing a blank Taxable value until someone happens to touch a line item.
 * Never overrides a Taxable value that's already present.
 */
export function ensureTaxableValueFromLineItems(fields: ExtractedFields): ExtractedFields {
  if (fields.amounts.taxable_value !== null) return fields;
  const taxable_value = sumLineItemAmounts(fields.service.line_items);
  if (taxable_value === null) return fields;
  const amounts = { ...fields.amounts, taxable_value };
  const total = fields.amounts.total ?? taxable_value + (amounts.cgst ?? 0) + (amounts.sgst ?? 0) + (amounts.igst ?? 0);
  return { ...fields, amounts: { ...amounts, total } };
}

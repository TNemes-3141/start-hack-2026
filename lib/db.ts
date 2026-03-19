/**
 * db.ts — Server-side database access layer (Supabase REST API)
 *
 * All Supabase queries go through this module. The low-level `supabaseGET`
 * helper handles authentication and error reporting. The named functions above
 * it express *what* data you want in plain terms, hiding the PostgREST syntax.
 *
 * Rules:
 *  - Import only in server-side code (Server Components, Route Handlers, Server Actions).
 *  - Never import from client components — API keys would be exposed.
 *  - Never use the `postgres` driver; direct TCP to Supabase is unavailable.
 */

import type { EligibleSupplier, HistoricalAward } from "./request-data";

// ── Database row types ────────────────────────────────────────────────────────
// EligibleSupplier and HistoricalAward (from request-data.ts) already mirror
// the suppliers / historical_awards table columns, so we reuse them directly.
// PricingRow and CategoryRow are defined here since they have no application-
// level equivalent.

export type PricingRow = {
  pricing_id: string;
  supplier_id: string;
  category_l1: string;
  category_l2: string;
  region: string;
  currency: string;
  pricing_model: string | null;
  min_quantity: number | null;
  max_quantity: number | null;
  unit_price: number | null;
  moq: number | null;
  standard_lead_time_days: number | null;
  expedited_lead_time_days: number | null;
  expedited_unit_price: number | null;
  valid_from: string | null;
  valid_to: string | null;
  notes: string | null;
};

export type CategoryRow = {
  category_l1: string;
  category_l2: string;
  category_description: string | null;
  typical_unit: string | null;
  pricing_model: string | null;
};

// ── Core fetch helper ─────────────────────────────────────────────────────────

/**
 * Performs an authenticated GET request against the Supabase REST API.
 *
 * Params are appended as query string filters using PostgREST syntax, e.g.:
 *   { category_l1: "eq.IT", supplier_id: "in.(SUP-001,SUP-002)" }
 *
 * Values are set via URLSearchParams, so special characters are percent-encoded.
 * PostgREST accepts both encoded and unencoded filter values.
 *
 * @throws Error if Supabase returns a non-2xx response.
 */
async function supabaseGET<T>(
  table: string,
  params: Record<string, string>,
): Promise<T[]> {
  const url = new URL(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/${table}`);

  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  const res = await fetch(url.toString(), {
    headers: {
      apikey: process.env.NEXT_SUPABASE_SECRET_KEY!,
      Authorization: `Bearer ${process.env.NEXT_SUPABASE_SECRET_KEY!}`,
    },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Supabase [${table}] — HTTP ${res.status}: ${body}`);
  }

  return res.json() as Promise<T[]>;
}

// ── Supplier queries ──────────────────────────────────────────────────────────

/**
 * Returns all suppliers registered for the given category and currency.
 * This is the initial candidate set before geographic and policy filtering.
 */
export function getSuppliersByCategoryAndCurrency(
  category_l1: string,
  category_l2: string,
  currency: string,
): Promise<EligibleSupplier[]> {
  return supabaseGET<EligibleSupplier>("suppliers", {
    category_l1: `eq.${category_l1}`,
    category_l2: `eq.${category_l2}`,
    currency:    `eq.${currency}`,
  });
}

/**
 * Searches suppliers by name using a case-insensitive partial match.
 * Only fetches the fields needed for eligibility checks (category, region, currency).
 * Used by the preferred-supplier evaluation stage.
 */
export function getSuppliersByName(name: string): Promise<
  Pick<EligibleSupplier, "supplier_id" | "supplier_name" | "category_l1" | "category_l2" | "service_regions" | "currency">[]
> {
  return supabaseGET("suppliers", {
    supplier_name: `ilike.*${name}*`,
    select: "supplier_id,supplier_name,category_l1,category_l2,service_regions,currency",
  });
}

// ── Pricing queries ───────────────────────────────────────────────────────────

/**
 * Fetches all pricing rows for a set of suppliers in a specific category,
 * currency, and delivery region. Returns all columns so callers can match
 * the correct quantity tier and calculate totals.
 */
export function getPricingForSuppliers(
  supplierIds: string[],
  category_l1: string,
  category_l2: string,
  currency: string,
  region: string,
): Promise<PricingRow[]> {
  return supabaseGET<PricingRow>("pricing", {
    supplier_id: `in.(${supplierIds.join(",")})`,
    category_l1: `eq.${category_l1}`,
    category_l2: `eq.${category_l2}`,
    currency:    `eq.${currency}`,
    region:      `eq.${region}`,
    select:      "*",
  });
}

/**
 * Fetches pricing rows that match a category, currency, region set, and
 * quantity tier, validated within a date window (valid_from ≤ today ≤ valid_to).
 * Used to check whether a request's budget and timeline are realistic.
 */
export function getPricingForCategory(
  category_l1: string,
  category_l2: string,
  currency: string,
  regions: string[],
  quantity: number,
  today: string,
): Promise<Pick<PricingRow, "pricing_id" | "supplier_id" | "unit_price" | "expedited_unit_price" | "standard_lead_time_days">[]> {
  return supabaseGET("pricing", {
    category_l1:  `eq.${category_l1}`,
    category_l2:  `eq.${category_l2}`,
    currency:     `eq.${currency}`,
    region:       `in.(${regions.join(",")})`,
    min_quantity: `lte.${quantity}`,
    max_quantity: `gte.${quantity}`,
    valid_from:   `lte.${today}`,
    valid_to:     `gte.${today}`,
    select:       "pricing_id,supplier_id,unit_price,expedited_unit_price,standard_lead_time_days",
  });
}

// ── Category queries ──────────────────────────────────────────────────────────

/**
 * Looks up a single category entry by its L1 and L2 identifiers.
 * Returns null if the category does not exist in the procurement catalog.
 */
export async function getCategoryByL1L2(
  category_l1: string,
  category_l2: string,
): Promise<CategoryRow | null> {
  const rows = await supabaseGET<CategoryRow>("categories", {
    category_l1: `eq.${category_l1}`,
    category_l2: `eq.${category_l2}`,
    limit:       "1",
  });
  return rows[0] ?? null;
}

// ── Historical award queries ──────────────────────────────────────────────────

/**
 * Fetches historical awards matching a specific category, currency, and country.
 * Used as the initial candidate pool for proximity-based precedent matching.
 */
export function getHistoricalAwardsByContext(
  category_l1: string,
  category_l2: string,
  currency: string,
  country: string,
): Promise<HistoricalAward[]> {
  return supabaseGET<HistoricalAward>("historical_awards", {
    category_l1: `eq.${category_l1}`,
    category_l2: `eq.${category_l2}`,
    currency:    `eq.${currency}`,
    country:     `eq.${country}`,
  });
}

/**
 * Fetches all award rows for a list of request IDs, ordered by request ID
 * and award rank (rank 1 = the recommended / winning supplier).
 */
export function getHistoricalAwardsByRequestIds(
  requestIds: string[],
): Promise<HistoricalAward[]> {
  return supabaseGET<HistoricalAward>("historical_awards", {
    request_id: `in.(${requestIds.join(",")})`,
    order:      "request_id.asc,award_rank.asc",
  });
}

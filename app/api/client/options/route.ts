import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";

type RequestRecord = {
  country?: unknown;
  site?: unknown;
};

function uniqueSorted(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean))).sort((a, b) =>
    a.localeCompare(b),
  );
}

function parseCategories(csv: string): {
  categoryL1: string[];
  categoryL2ByL1: Record<string, string[]>;
} {
  const lines = csv.split(/\r?\n/).filter(Boolean);
  const l1Values = new Set<string>();
  const l2ByL1 = new Map<string, Set<string>>();

  lines.slice(1).forEach((line) => {
    const [l1Raw, l2Raw] = line.split(",");
    const l1 = l1Raw?.trim() ?? "";
    const l2 = l2Raw?.trim() ?? "";

    if (!l1 || !l2) {
      return;
    }

    l1Values.add(l1);
    if (!l2ByL1.has(l1)) {
      l2ByL1.set(l1, new Set<string>());
    }
    l2ByL1.get(l1)?.add(l2);
  });

  const categoryL2ByL1: Record<string, string[]> = {};
  l2ByL1.forEach((values, key) => {
    categoryL2ByL1[key] = uniqueSorted(Array.from(values));
  });

  return {
    categoryL1: uniqueSorted(Array.from(l1Values)),
    categoryL2ByL1,
  };
}

function parseSupplierOptions(csv: string): { countries: string[]; currencies: string[] } {
  const lines = csv.split(/\r?\n/).filter(Boolean);
  const countries = new Set<string>();
  const currencies = new Set<string>();

  lines.slice(1).forEach((line) => {
    const parts = line.split(",");
    const countryHq = parts[4]?.trim() ?? "";
    const serviceRegions = parts[5]?.trim() ?? "";
    const currency = parts[6]?.trim() ?? "";

    if (countryHq) {
      countries.add(countryHq);
    }

    if (currency) {
      currencies.add(currency);
    }

    serviceRegions
      .split(";")
      .map((item) => item.trim())
      .filter(Boolean)
      .forEach((countryCode) => countries.add(countryCode));
  });

  return {
    countries: uniqueSorted(Array.from(countries)),
    currencies: uniqueSorted(Array.from(currencies)),
  };
}

function parseCities(requestsRaw: string): string[] {
  try {
    const requests = JSON.parse(requestsRaw) as RequestRecord[];
    const cities = requests
      .map((item) =>
        typeof item.site === "string" ? item.site.trim() : "",
      )
      .filter(Boolean);
    return uniqueSorted(cities);
  } catch {
    return [];
  }
}

export async function GET() {
  try {
    const dataDir = path.resolve(
      process.cwd(),
      "mockdata",
      "zChainIQ-START-Hack-2026--main",
      "data",
    );

    const [categoriesCsv, suppliersCsv, requestsJson] = await Promise.all([
      readFile(path.join(dataDir, "categories.csv"), "utf8"),
      readFile(path.join(dataDir, "suppliers.csv"), "utf8"),
      readFile(path.join(dataDir, "requests.json"), "utf8"),
    ]);

    const categories = parseCategories(categoriesCsv);
    const supplierOptions = parseSupplierOptions(suppliersCsv);
    const cities = parseCities(requestsJson);

    return NextResponse.json({
      category_l1_options: categories.categoryL1,
      category_l2_by_l1: categories.categoryL2ByL1,
      country_options: supplierOptions.countries,
      city_options: cities,
      currency_options: supplierOptions.currencies,
    });
  } catch (error) {
    console.error("Failed to build client form options", error);
    return NextResponse.json(
      { error: "Failed to load client form options." },
      { status: 500 },
    );
  }
}

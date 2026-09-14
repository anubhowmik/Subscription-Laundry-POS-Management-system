// Seeds the global Country/State/City reference tables (see schema.prisma) from a stripped-down
// copy of the public dr5hn/countries-states-cities-database (MIT licensed) - 250 countries,
// ~5,300 states/regions, ~153,000 cities. Idempotent: skips entirely if Country already has rows,
// since re-running this on every `prisma db seed` would otherwise re-insert 150k+ city rows.
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "crypto";
import fs from "fs";
import path from "path";

interface GeoCity {
  name: string;
}
interface GeoState {
  nameEn: string;
  nameAr: string | null;
  cities: string[];
}
interface GeoCountry {
  code: string;
  nameEn: string;
  nameAr: string | null;
  phoneCode: string | null;
  states: GeoState[];
}

export async function seedGeography(prisma: PrismaClient) {
  const existing = await prisma.country.count();
  if (existing > 0) {
    console.log("Geography already seeded, skipping.");
    return;
  }

  console.log("Seeding geography (countries/states/cities)...");
  const dataPath = path.join(__dirname, "seedData", "geography.json");
  const countries: GeoCountry[] = JSON.parse(fs.readFileSync(dataPath, "utf8"));

  const countryRows: { id: string; code: string; nameEn: string; nameAr: string | null; phoneCode: string | null }[] = [];
  const stateRows: { id: string; countryId: string; nameEn: string; nameAr: string | null }[] = [];
  const cityRows: { id: string; stateId: string; nameEn: string }[] = [];

  for (const c of countries) {
    const countryId = randomUUID();
    countryRows.push({ id: countryId, code: c.code, nameEn: c.nameEn, nameAr: c.nameAr, phoneCode: c.phoneCode });
    for (const s of c.states) {
      const stateId = randomUUID();
      stateRows.push({ id: stateId, countryId, nameEn: s.nameEn, nameAr: s.nameAr });
      for (const cityName of s.cities) {
        cityRows.push({ id: randomUUID(), stateId, nameEn: cityName });
      }
    }
  }

  await prisma.country.createMany({ data: countryRows });
  console.log(`  ${countryRows.length} countries`);

  for (let i = 0; i < stateRows.length; i += 5000) {
    await prisma.state.createMany({ data: stateRows.slice(i, i + 5000) });
  }
  console.log(`  ${stateRows.length} states`);

  for (let i = 0; i < cityRows.length; i += 5000) {
    await prisma.city.createMany({ data: cityRows.slice(i, i + 5000) });
  }
  console.log(`  ${cityRows.length} cities`);
}

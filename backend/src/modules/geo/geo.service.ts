import { prisma } from "../../config/prisma";

export async function listCountries() {
  return prisma.country.findMany({
    select: { id: true, code: true, nameEn: true, nameAr: true },
    orderBy: { nameEn: "asc" },
  });
}

export async function listStates(countryId: string) {
  return prisma.state.findMany({
    where: { countryId },
    select: { id: true, nameEn: true, nameAr: true },
    orderBy: { nameEn: "asc" },
  });
}

export async function listCities(stateId: string) {
  return prisma.city.findMany({
    where: { stateId },
    select: { id: true, nameEn: true, nameAr: true },
    orderBy: { nameEn: "asc" },
  });
}

import { z } from "zod";

// The reference's "Add Contact Persons" repeatable sub-form - see schema.prisma's
// SupplierContactPerson for why the "Allow login" portal-account fields aren't replicated.
export const supplierContactPersonSchema = z.object({
  prefix: z.string().optional(),
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().optional(),
  email: z.string().email().optional().or(z.literal("")),
  mobile: z.string().optional(),
  altPhone: z.string().optional(),
  familyContactNumber: z.string().optional(),
  department: z.string().optional(),
  designation: z.string().optional(),
});

export const createSupplierSchema = z.object({
  // Optional user override of the auto-generated code - the reference app's "Contact ID" field
  // ("Leave empty to autogenerate"). See supplier.service.ts's create().
  code: z.string().trim().min(1).optional(),
  nameEn: z.string().min(1, "English name is required"),
  nameAr: z.string().optional(),
  // Individual/Business radio, converted from the reference exactly - see schema.prisma's
  // Supplier.contactType comment for how nameEn stays in sync.
  contactType: z.enum(["individual", "business"]).optional(),
  prefix: z.string().optional(),
  firstName: z.string().optional(),
  middleName: z.string().optional(),
  lastName: z.string().optional(),
  dateOfBirth: z.string().optional(),
  businessName: z.string().optional(),
  // Converted from the reference's checkboxes - see schema.prisma's Supplier.globalCustomer
  // comment for why these are saved faithfully but currently have no downstream effect.
  globalCustomer: z.boolean().optional(),
  allowExpeditedDiscount: z.boolean().optional(),
  // The reference's "Account" contact field.
  defaultAccountId: z.string().uuid().optional().nullable(),
  phone: z.string().min(1, "Phone is required"),
  altPhone: z.string().optional(),
  landline: z.string().optional(),
  email: z.string().email().optional().or(z.literal("")),
  businessLocationId: z.string().uuid().optional().nullable(),
  address: z.string().optional(),
  addressLine2: z.string().optional(),
  shippingAddress: z.string().optional(),
  country: z.string().optional(),
  state: z.string().optional(),
  city: z.string().optional(),
  district: z.string().optional(),
  postalCode: z.string().optional(),
  buildingNo: z.string().optional(),
  additionalNo: z.string().optional(),
  idType: z.enum(["TIN", "CRN", "MOM", "MLS", "700", "SAG", "NAT", "IQA", "PAS", "OTH"]).optional().or(z.literal("")),
  mapLocation: z.string().optional(),
  vatNumber: z.string().optional(),
  crNumber: z.string().optional(),
  nationalAddress: z.string().optional(),
  notes: z.string().optional(),
  creditLimit: z.number().min(0).optional(),
  paymentTermsDays: z.number().int().min(0).optional(),
  payTermType: z.enum(["DAYS", "MONTHS"]).optional().nullable(),
  openingBalance: z.number().optional(),
  customField1: z.string().optional(),
  customField2: z.string().optional(),
  customField3: z.string().optional(),
  customField4: z.string().optional(),
  customField5: z.string().optional(),
  customField6: z.string().optional(),
  customField7: z.string().optional(),
  customField8: z.string().optional(),
  customField9: z.string().optional(),
  customField10: z.string().optional(),
  contactPersons: z.array(supplierContactPersonSchema).optional(),
});

export const updateSupplierSchema = createSupplierSchema.partial();

export const listSupplierQuerySchema = z.object({
  page: z.string().optional(),
  limit: z.string().optional(),
  sortBy: z.string().optional(),
  sortOrder: z.string().optional(),
  search: z.string().optional(),
  businessLocationId: z.string().uuid().optional(),
  status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
  // Filter checkboxes matching the EJADA reference's Suppliers list exactly - see
  // supplier.service.ts's list() for how each is applied.
  hasPurchaseDue: z.enum(["true"]).optional(),
  hasPurchaseReturn: z.enum(["true"]).optional(),
  hasAdvanceBalance: z.enum(["true"]).optional(),
  hasOpeningBalance: z.enum(["true"]).optional(),
});

import { useState } from "react";
import { User } from "lucide-react";
import { usePosStore } from "../../stores/posStore";
import { useCustomers } from "../../api/posApi";
import { CustomerFormModal } from "../customers/CustomerFormModal";

/**
 * Add Sale's own Customer field + Billing/Shipping Address display (`sell/create.blade.php`'s
 * `contact_id` form-group) - a full-width section of its own, matching the reference's actual
 * page shape, instead of living inside the touch-grid POS's narrow `InvoicePanel` sidebar (see
 * PosPage.tsx's layout branch). The customer typeahead logic is intentionally duplicated from
 * `InvoicePanel.tsx`'s `CustomerBar` rather than shared - the two now render in genuinely
 * different page shapes (a compact bar vs. a full-width labeled field), and forcing one
 * component to serve both would need as many layout-branching props as just having two. The
 * "+ New customer" button opens the SAME full `CustomerFormModal` the Customers page itself
 * uses (the reference's own POS quick-add reuses its one real Add Contact form too, not a
 * separate simplified template - see CustomerFormModal.tsx's own comment).
 */
export function AddSaleCustomerSection({ isAr }: { isAr: boolean }) {
  const customer = usePosStore((s) => s.customer);
  const setCustomer = usePosStore((s) => s.setCustomer);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [newOpen, setNewOpen] = useState(false);
  const { data: customers } = useCustomers(search);

  const billingAddress = customer
    ? [customer.address, customer.addressLine2, customer.city, customer.state, customer.country].filter(Boolean).join(", ")
    : "";
  const shippingAddress = customer ? customer.shippingAddress || billingAddress : "";

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <label className="mb-1.5 block text-sm font-medium text-slate-700">
        {isAr ? "العميل" : "Customer"}
        <span className="text-red-500">*</span>
      </label>
      <div className="relative flex max-w-lg items-center gap-2">
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex flex-1 items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-start text-sm hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/40"
        >
          <User className="h-4 w-4 shrink-0 text-slate-400" strokeWidth={2} aria-hidden />
          <span className="flex-1 truncate font-medium text-slate-700">
            {customer ? (isAr ? customer.nameAr || customer.nameEn : customer.nameEn) : isAr ? "عميل نقدي" : "Walk-in Customer"}
          </span>
          {customer && (
            <span className="ltr-nums text-xs text-slate-400">
              {isAr ? "الرصيد" : "Bal"}: {Number(customer.balance).toFixed(2)}
            </span>
          )}
        </button>
        <button
          onClick={() => setNewOpen(true)}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-sky-500 text-lg font-semibold text-white shadow-sm hover:bg-sky-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/40"
          title={isAr ? "عميل جديد" : "New customer"}
        >
          +
        </button>

        {open && (
          <div className="absolute inset-x-0 top-full z-20 mt-1 rounded-xl border border-slate-200 bg-white shadow-lg">
            <input
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={isAr ? "ابحث بالاسم أو الهاتف" : "Search name or phone"}
              className="w-full border-b border-slate-100 px-3 py-2 text-sm focus:outline-none"
            />
            <div className="max-h-60 overflow-y-auto">
              {customers?.map((c) => (
                <button
                  key={c.id}
                  onClick={() => {
                    setCustomer({
                      id: c.id,
                      nameEn: c.nameEn,
                      nameAr: c.nameAr,
                      phone: c.phone,
                      balance: c.balance,
                      rewardPoints: c.rewardPoints,
                      cashBack: c.cashBack,
                      address: c.address,
                      addressLine2: c.addressLine2,
                      city: c.city,
                      state: c.state,
                      country: c.country,
                      shippingAddress: c.shippingAddress,
                      paymentTermsDays: c.paymentTermsDays,
                      payTermType: c.payTermType,
                    });
                    setOpen(false);
                    setSearch("");
                  }}
                  className="flex w-full items-center justify-between px-3 py-2 text-start text-sm transition-colors hover:bg-slate-100"
                >
                  <span>{isAr ? c.nameAr || c.nameEn : c.nameEn}</span>
                  <span className="text-xs text-slate-400">{c.phone}</span>
                </button>
              ))}
              {(customers?.length ?? 0) === 0 && <p className="px-3 py-3 text-center text-xs text-slate-400">{isAr ? "لا نتائج" : "No results"}</p>}
            </div>
          </div>
        )}
      </div>

      <div className="mt-3 grid max-w-2xl grid-cols-1 gap-3 text-sm sm:grid-cols-2">
        <p>
          <span className="font-semibold text-slate-600">{isAr ? "عنوان الفوترة" : "Billing Address"}:</span>{" "}
          <span className="text-slate-500">{billingAddress || "—"}</span>
        </p>
        <p>
          <span className="font-semibold text-slate-600">{isAr ? "عنوان الشحن" : "Shipping Address"}:</span>{" "}
          <span className="text-slate-500">{shippingAddress || "—"}</span>
        </p>
      </div>

      {newOpen && (
        <CustomerFormModal
          isAr={isAr}
          editing={null}
          onClose={() => setNewOpen(false)}
          onSaved={(created) => {
            if (created) {
              setCustomer({
                id: created.id,
                nameEn: created.nameEn,
                nameAr: created.nameAr,
                phone: created.phone,
                balance: created.balance,
                address: created.address,
                addressLine2: created.addressLine2,
                city: created.city,
                state: created.state,
                country: created.country,
                shippingAddress: created.shippingAddress,
                paymentTermsDays: created.paymentTermsDays,
                payTermType: created.payTermType,
              });
            }
            setNewOpen(false);
          }}
        />
      )}
    </div>
  );
}

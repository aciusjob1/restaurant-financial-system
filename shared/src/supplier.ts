import { z } from 'zod';

export const PURCHASE_INVOICE_STATUSES = ['DRAFT', 'POSTED', 'CANCELLED'] as const;
export type PurchaseInvoiceStatus = (typeof PURCHASE_INVOICE_STATUSES)[number];

export const PAYMENT_METHODS = [
  'CASH',
  'MPESA',
  'AIRTEL_MONEY',
  'TIGO_PESA',
  'HALOPESA',
  'BANK',
  'CARD',
  'OTHER',
] as const;

const MoneyString = z
  .string()
  .regex(/^-?\d+(\.\d{1,2})?$/, 'Must be a decimal string with up to 2 places')
  .refine((v) => v.replace('-', '').replace('.', '').length <= 14, {
    message: 'Too many digits for Decimal(14,2)',
  });

const PositiveMoneyString = MoneyString.refine(
  (v) => !v.startsWith('-') && parseFloat(v) > 0,
  { message: 'Amount must be positive.' }
);

const DateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

// ---------- Supplier ----------

export const PublicSupplier = z.object({
  id: z.string(),
  supplierNumber: z.string(),
  name: z.string(),
  phone: z.string().nullable(),
  email: z.string().nullable(),
  address: z.string().nullable(),
  contactPerson: z.string().nullable(),
  tin: z.string().nullable(),
  paymentTerms: z.string().nullable(),
  notes: z.string().nullable(),
  isActive: z.boolean(),
  createdBy: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type PublicSupplier = z.infer<typeof PublicSupplier>;

export const CreateSupplierRequest = z.object({
  name: z.string().trim().min(2).max(128),
  phone: z.string().trim().max(32).nullable().optional(),
  email: z.string().trim().max(128).nullable().optional(),
  address: z.string().trim().max(300).nullable().optional(),
  contactPerson: z.string().trim().max(128).nullable().optional(),
  tin: z.string().trim().max(64).nullable().optional(),
  paymentTerms: z.string().trim().max(128).nullable().optional(),
  notes: z.string().trim().max(500).nullable().optional(),
});
export type CreateSupplierRequest = z.infer<typeof CreateSupplierRequest>;

export const UpdateSupplierRequest = z.object({
  name: z.string().trim().min(2).max(128).optional(),
  phone: z.string().trim().max(32).nullable().optional(),
  email: z.string().trim().max(128).nullable().optional(),
  address: z.string().trim().max(300).nullable().optional(),
  contactPerson: z.string().trim().max(128).nullable().optional(),
  tin: z.string().trim().max(64).nullable().optional(),
  paymentTerms: z.string().trim().max(128).nullable().optional(),
  notes: z.string().trim().max(500).nullable().optional(),
  isActive: z.boolean().optional(),
});
export type UpdateSupplierRequest = z.infer<typeof UpdateSupplierRequest>;

export const SupplierBalanceResponse = z.object({
  success: z.literal(true),
  supplierId: z.string(),
  balance: MoneyString,
  totalInvoiced: MoneyString,
  totalPaid: MoneyString,
  totalAllocated: MoneyString,
  totalUnallocated: MoneyString,
});
export type SupplierBalanceResponse = z.infer<typeof SupplierBalanceResponse>;

// ---------- Purchase invoice ----------

export const PublicPurchaseInvoice = z.object({
  id: z.string(),
  invoiceNumber: z.string(),
  supplierId: z.string(),
  date: DateOnly,
  businessDate: DateOnly,
  subtotal: MoneyString,
  total: MoneyString,
  status: z.enum(PURCHASE_INVOICE_STATUSES),
  notes: z.string().nullable(),
  createdBy: z.string(),
  postedBy: z.string().nullable(),
  postedAt: z.string().nullable(),
  cancelledBy: z.string().nullable(),
  cancelledAt: z.string().nullable(),
  cancelReason: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type PublicPurchaseInvoice = z.infer<typeof PublicPurchaseInvoice>;

export const CreatePurchaseInvoiceRequest = z.object({
  supplierId: z.string().min(1),
  invoiceNumber: z.string().trim().min(1).max(64),
  date: DateOnly,
  businessDate: DateOnly,
  total: PositiveMoneyString,
  notes: z.string().trim().max(500).nullable().optional(),
});
export type CreatePurchaseInvoiceRequest = z.infer<typeof CreatePurchaseInvoiceRequest>;

export const UpdatePurchaseInvoiceRequest = z.object({
  invoiceNumber: z.string().trim().min(1).max(64).optional(),
  date: DateOnly.optional(),
  businessDate: DateOnly.optional(),
  total: PositiveMoneyString.optional(),
  notes: z.string().trim().max(500).nullable().optional(),
});
export type UpdatePurchaseInvoiceRequest = z.infer<typeof UpdatePurchaseInvoiceRequest>;

export const CancelPurchaseInvoiceRequest = z.object({
  reason: z.string().trim().min(3).max(500),
});
export type CancelPurchaseInvoiceRequest = z.infer<typeof CancelPurchaseInvoiceRequest>;

// ---------- Supplier payment ----------

export const PublicSupplierPayment = z.object({
  id: z.string(),
  paymentNumber: z.string(),
  supplierId: z.string(),
  businessDate: DateOnly,
  amount: MoneyString,
  paymentMethod: z.enum(PAYMENT_METHODS),
  reference: z.string().nullable(),
  notes: z.string().nullable(),
  recordedBy: z.string(),
  voidedAt: z.string().nullable(),
  voidedBy: z.string().nullable(),
  voidReason: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type PublicSupplierPayment = z.infer<typeof PublicSupplierPayment>;

export const PublicPaymentAllocation = z.object({
  id: z.string(),
  supplierPaymentId: z.string(),
  purchaseInvoiceId: z.string(),
  amount: MoneyString,
  voidedAt: z.string().nullable(),
  voidedBy: z.string().nullable(),
  voidReason: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type PublicPaymentAllocation = z.infer<typeof PublicPaymentAllocation>;

export const CreateSupplierPaymentRequest = z.object({
  supplierId: z.string().min(1),
  businessDate: DateOnly,
  amount: PositiveMoneyString,
  paymentMethod: z.enum(PAYMENT_METHODS),
  reference: z.string().trim().max(64).nullable().optional(),
  notes: z.string().trim().max(500).nullable().optional(),
});
export type CreateSupplierPaymentRequest = z.infer<typeof CreateSupplierPaymentRequest>;

export const VoidSupplierPaymentRequest = z.object({
  reason: z.string().trim().min(3).max(500),
});
export type VoidSupplierPaymentRequest = z.infer<typeof VoidSupplierPaymentRequest>;

export const AllocatePaymentRequest = z.object({
  purchaseInvoiceId: z.string().min(1),
  amount: PositiveMoneyString,
});
export type AllocatePaymentRequest = z.infer<typeof AllocatePaymentRequest>;

export const VoidAllocationRequest = z.object({
  reason: z.string().trim().min(3).max(500),
});
export type VoidAllocationRequest = z.infer<typeof VoidAllocationRequest>;

export const SuppliersListResponse = z.object({
  success: z.literal(true),
  suppliers: z.array(PublicSupplier),
});
export type SuppliersListResponse = z.infer<typeof SuppliersListResponse>;

export const SupplierResponse = z.object({
  success: z.literal(true),
  supplier: PublicSupplier,
});
export type SupplierResponse = z.infer<typeof SupplierResponse>;

export const PurchaseInvoicesListResponse = z.object({
  success: z.literal(true),
  invoices: z.array(PublicPurchaseInvoice),
});
export type PurchaseInvoicesListResponse = z.infer<typeof PurchaseInvoicesListResponse>;

export const PurchaseInvoiceResponse = z.object({
  success: z.literal(true),
  invoice: PublicPurchaseInvoice,
});
export type PurchaseInvoiceResponse = z.infer<typeof PurchaseInvoiceResponse>;

export const SupplierPaymentsListResponse = z.object({
  success: z.literal(true),
  payments: z.array(PublicSupplierPayment),
});
export type SupplierPaymentsListResponse = z.infer<typeof SupplierPaymentsListResponse>;

export const SupplierPaymentResponse = z.object({
  success: z.literal(true),
  payment: PublicSupplierPayment,
  allocations: z.array(PublicPaymentAllocation),
});
export type SupplierPaymentResponse = z.infer<typeof SupplierPaymentResponse>;

export const AllocationResponse = z.object({
  success: z.literal(true),
  allocation: PublicPaymentAllocation,
});
export type AllocationResponse = z.infer<typeof AllocationResponse>;
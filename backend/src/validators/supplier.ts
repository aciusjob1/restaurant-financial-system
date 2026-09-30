import { z } from 'zod';

const PAYMENT_METHODS = [
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

const DateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD');

export const CreateSupplierSchema = z.object({
  name: z.string().trim().min(2).max(128),
  phone: z.string().trim().max(32).nullable().optional(),
  email: z.string().trim().max(128).nullable().optional(),
  address: z.string().trim().max(300).nullable().optional(),
  contactPerson: z.string().trim().max(128).nullable().optional(),
  tin: z.string().trim().max(64).nullable().optional(),
  paymentTerms: z.string().trim().max(128).nullable().optional(),
  notes: z.string().trim().max(500).nullable().optional(),
});

export const UpdateSupplierSchema = z.object({
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

export const ListSuppliersQuerySchema = z.object({
  includeInactive: z
    .union([z.literal('true'), z.literal('false'), z.boolean()])
    .optional()
    .transform((v) => v === true || v === 'true'),
  search: z.string().trim().max(128).optional(),
});

export const CreatePurchaseInvoiceSchema = z.object({
  supplierId: z.string().min(1),
  invoiceNumber: z.string().trim().min(1).max(64),
  date: DateOnly,
  businessDate: DateOnly,
  total: PositiveMoneyString,
  notes: z.string().trim().max(500).nullable().optional(),
});

export const UpdatePurchaseInvoiceSchema = z.object({
  invoiceNumber: z.string().trim().min(1).max(64).optional(),
  date: DateOnly.optional(),
  businessDate: DateOnly.optional(),
  total: PositiveMoneyString.optional(),
  notes: z.string().trim().max(500).nullable().optional(),
});

export const CancelPurchaseInvoiceSchema = z.object({
  reason: z.string().trim().min(3).max(500),
});

export const ListPurchaseInvoicesQuerySchema = z.object({
  supplierId: z.string().min(1).optional(),
  businessDate: DateOnly.optional(),
  from: DateOnly.optional(),
  to: DateOnly.optional(),
  status: z.enum(['DRAFT', 'POSTED', 'CANCELLED']).optional(),
  unpaidOnly: z
    .union([z.literal('true'), z.literal('false'), z.boolean()])
    .optional()
    .transform((v) => v === true || v === 'true'),
});

export const CreateSupplierPaymentSchema = z.object({
  supplierId: z.string().min(1),
  businessDate: DateOnly,
  amount: PositiveMoneyString,
  paymentMethod: z.enum(PAYMENT_METHODS),
  reference: z.string().trim().max(64).nullable().optional(),
  notes: z.string().trim().max(500).nullable().optional(),
});

export const VoidSupplierPaymentSchema = z.object({
  reason: z.string().trim().min(3).max(500),
});

export const AllocatePaymentSchema = z.object({
  purchaseInvoiceId: z.string().min(1),
  amount: PositiveMoneyString,
});

const QuantityString = z
  .string()
  .trim()
  .regex(/^\d+(\.\d{1,3})?$/, 'Quantity must be a positive decimal with up to 3 places.');

const PurchaseItemLineSchema = z.object({
  materialId: z.string().min(1),
  quantity: QuantityString,
  unitPrice: PositiveMoneyString,
  notes: z.string().trim().max(500).nullable().optional(),
});

export const CompletePurchaseInvoiceSchema = z.object({
  supplierId: z.string().min(1),
  invoiceNumber: z.string().trim().min(1).max(64),
  date: DateOnly,
  businessDate: DateOnly,
  notes: z.string().trim().max(500).nullable().optional(),
  postNow: z.boolean(),
  items: z.array(PurchaseItemLineSchema).min(1),
});

export const CompleteSupplierPaymentSchema = z.object({
  supplierId: z.string().min(1),
  businessDate: DateOnly,
  amount: PositiveMoneyString,
  paymentMethod: z.enum(PAYMENT_METHODS),
  reference: z.string().trim().max(64).nullable().optional(),
  notes: z.string().trim().max(500).nullable().optional(),
  autoAllocate: z.boolean().optional(),
  allocateTo: z.array(z.string().min(1)).optional(),
});
export const VoidAllocationSchema = z.object({
  reason: z.string().trim().min(3).max(500),
});

export const ListSupplierPaymentsQuerySchema = z.object({
  supplierId: z.string().min(1).optional(),
  businessDate: DateOnly.optional(),
  from: DateOnly.optional(),
  to: DateOnly.optional(),
  paymentMethod: z.enum(PAYMENT_METHODS).optional(),
  includeVoided: z
    .union([z.literal('true'), z.literal('false'), z.boolean()])
    .optional()
    .transform((v) => v === true || v === 'true'),
});

export type CreateSupplierInput = z.infer<typeof CreateSupplierSchema>;
export type UpdateSupplierInput = z.infer<typeof UpdateSupplierSchema>;
export type ListSuppliersQuery = z.infer<typeof ListSuppliersQuerySchema>;
export type CreatePurchaseInvoiceInput = z.infer<typeof CreatePurchaseInvoiceSchema>;
export type UpdatePurchaseInvoiceInput = z.infer<typeof UpdatePurchaseInvoiceSchema>;
export type CancelPurchaseInvoiceInput = z.infer<typeof CancelPurchaseInvoiceSchema>;
export type ListPurchaseInvoicesQuery = z.infer<typeof ListPurchaseInvoicesQuerySchema>;
export type CreateSupplierPaymentInput = z.infer<typeof CreateSupplierPaymentSchema>;
export type VoidSupplierPaymentInput = z.infer<typeof VoidSupplierPaymentSchema>;
export type AllocatePaymentInput = z.infer<typeof AllocatePaymentSchema>;
export type VoidAllocationInput = z.infer<typeof VoidAllocationSchema>;
export type CompletePurchaseInvoiceInput = z.infer<typeof CompletePurchaseInvoiceSchema>;
export type CompleteSupplierPaymentInput = z.infer<typeof CompleteSupplierPaymentSchema>;
export type ListSupplierPaymentsQuery = z.infer<typeof ListSupplierPaymentsQuerySchema>;
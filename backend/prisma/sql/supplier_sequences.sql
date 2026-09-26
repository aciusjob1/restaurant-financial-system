-- Phase 12: supplier and supplier-payment number sequences.
-- SUP-0001 for suppliers; PAY-0001 for supplier payments.
-- Idempotent; runs after every migrate via prisma:apply-raw-sql.
CREATE SEQUENCE IF NOT EXISTS supplier_number_seq START WITH 1 INCREMENT BY 1;
CREATE SEQUENCE IF NOT EXISTS payment_number_seq  START WITH 1 INCREMENT BY 1;
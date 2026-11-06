CREATE OR REPLACE FUNCTION reject_stock_document_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION '% is an immutable stock document; % is not permitted', TG_TABLE_NAME, TG_OP
    USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER opening_stock_imports_no_update_or_delete
BEFORE UPDATE OR DELETE ON "opening_stock_imports"
FOR EACH ROW EXECUTE FUNCTION reject_stock_document_mutation();
CREATE TRIGGER opening_stock_imports_no_truncate
BEFORE TRUNCATE ON "opening_stock_imports"
FOR EACH STATEMENT EXECUTE FUNCTION reject_stock_document_mutation();

CREATE TRIGGER supplier_receipts_no_update_or_delete
BEFORE UPDATE OR DELETE ON "supplier_receipts"
FOR EACH ROW EXECUTE FUNCTION reject_stock_document_mutation();
CREATE TRIGGER supplier_receipts_no_truncate
BEFORE TRUNCATE ON "supplier_receipts"
FOR EACH STATEMENT EXECUTE FUNCTION reject_stock_document_mutation();

CREATE TRIGGER supplier_receipt_lines_no_update_or_delete
BEFORE UPDATE OR DELETE ON "supplier_receipt_lines"
FOR EACH ROW EXECUTE FUNCTION reject_stock_document_mutation();
CREATE TRIGGER supplier_receipt_lines_no_truncate
BEFORE TRUNCATE ON "supplier_receipt_lines"
FOR EACH STATEMENT EXECUTE FUNCTION reject_stock_document_mutation();

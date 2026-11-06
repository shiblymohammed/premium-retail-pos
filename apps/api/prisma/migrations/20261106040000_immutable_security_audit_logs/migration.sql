CREATE OR REPLACE FUNCTION reject_security_audit_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION '% is an immutable audit record; % is not permitted', TG_TABLE_NAME, TG_OP
    USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER audit_events_no_update_or_delete
BEFORE UPDATE OR DELETE ON "audit_events"
FOR EACH ROW EXECUTE FUNCTION reject_security_audit_mutation();
CREATE TRIGGER audit_events_no_truncate
BEFORE TRUNCATE ON "audit_events"
FOR EACH STATEMENT EXECUTE FUNCTION reject_security_audit_mutation();

CREATE TRIGGER price_change_logs_no_update_or_delete
BEFORE UPDATE OR DELETE ON "price_change_logs"
FOR EACH ROW EXECUTE FUNCTION reject_security_audit_mutation();
CREATE TRIGGER price_change_logs_no_truncate
BEFORE TRUNCATE ON "price_change_logs"
FOR EACH STATEMENT EXECUTE FUNCTION reject_security_audit_mutation();

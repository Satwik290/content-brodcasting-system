-- ADR-003: Immutable Approvals
-- No UPDATE allowed on approved content
CREATE OR REPLACE FUNCTION prevent_approved_modification()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status = 'APPROVED' AND NEW.status = 'APPROVED' THEN
    RAISE EXCEPTION 'Cannot modify approved content';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS content_update_lock ON "Content";

CREATE TRIGGER content_update_lock
BEFORE UPDATE ON "Content"
FOR EACH ROW EXECUTE FUNCTION prevent_approved_modification();

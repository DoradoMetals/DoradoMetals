-- Tracking events are replaced wholesale, not edited - a poll removes what's there and inserts the current set.
-- This DELETE once destroyed real FedEx history: correct behavior, caught late by a test that read its own writes through a committing transaction - see audit:test-leaks.
DELETE FROM shipping.tracking WHERE shipment_id = $1

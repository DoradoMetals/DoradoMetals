-- Tracking events are replaced wholesale rather than edited: a carrier poll
-- removes what is there and inserts the current set.
--
-- THIS STATEMENT DELETED THE REAL FedEx HISTORY OF FIVE DEV SHIPMENTS. Not
-- because it is wrong - it is what a poll does - but because the test written
-- to prevent exactly that called a service which opened its own transaction and
-- committed, while the test's own transaction rolled back. Every assertion
-- passed, because a test reads its own writes either way.
DELETE FROM shipping.tracking WHERE shipment_id = $1

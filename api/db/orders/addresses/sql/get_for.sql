-- The address link of one order.
--
-- TWO IDS, AND THE DIFFERENCE MATTERS. `address_id` is the SNAPSHOT - a
-- places.addresses row recording where the parcel actually went, frozen so that
-- editing an address book entry later cannot rewrite history.
-- `source_address_id` is the address-BOOK row it was taken from.
--
-- The wire returns the SOURCE id, because the frontend posts it back at
-- checkout and the API resolves it against the book. Returning the snapshot's
-- id would break checkout.
SELECT id, order_id, address_id, source_address_id
  FROM orders.addresses
 WHERE order_id = $1

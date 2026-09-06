-- Adopting an anonymous basket moves the LINK. The lot ids survive it, which is
-- what "the id is minted once" means.
UPDATE checkout.lots SET checkout_id = $2 WHERE checkout_id = $1 RETURNING id

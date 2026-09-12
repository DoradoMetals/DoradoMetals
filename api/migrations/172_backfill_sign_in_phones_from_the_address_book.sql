-- EVERY EXISTING CUSTOMER GETS A SIGN-IN NUMBER (ruling 108).
--
-- Jacob: "address phone numbers should be sent to user phone numbers... it
-- should be largely 1 to 1."
--
-- Auth is passwordless and phone-first since 142/143/144: the code is the only
-- key, and `auth.users.phone_number` is what a sign-in resolves an account by.
-- A customer who registered before that cutover has an email and no number, so
-- there is nothing for the OTP to go to - but they DID give us a phone, once,
-- on the address a parcel was going to. That is the number this carries.
--
-- *** WHERE THE NUMBER COMES FROM. *** The address BOOK, not the order
-- snapshot: `places.user_addresses` is what says an address is this customer's,
-- and `places.addresses` holds its `phone_number`. Where the native copy has no
-- number the same address id is read out of `exchange.addresses`, which is the
-- frozen source every native address was derived from and the only place an
-- older number can still be. exchange is READ here and never written.
--
-- *** WHICH NUMBER, WHEN THERE ARE SEVERAL. *** (Jacob, revised: the
-- default-shipping preference is dropped.) Prefer the number on an address
-- that has actually been USED ON AN ORDER - `orders.addresses.source_address_id`
-- is the link from an order's snapshot back to the book row - most recent order
-- first. A number we have already shipped to is a number the customer answers;
-- a book entry nobody ever ordered against may be a relative's house. Only when
-- the customer has no order against any of their addresses does the earliest
-- address win, because the first number they ever gave us is the one that has
-- been theirs the longest. `address_id` is the last tiebreak so that two
-- addresses created in the same transaction still resolve the same way on every
-- run - an unstable ORDER BY would make this migration non-idempotent by
-- accident.
--
-- *** WHAT COUNTS AS A NUMBER. *** US only, E.164, matching
-- `features/accounts/auth`'s own `US_E164` - punctuation stripped, a leading
-- country code 1 dropped, and the ten digits then checked as a real NANP number
-- (area code and exchange code both starting 2-9). Anything else - an
-- extension, a nine-digit typo, an international number - is NOT carried.
-- A wrong number in this column is worse than an empty one: it sends a stranger
-- the code to somebody's account, and the customer it belongs to cannot sign in
-- at all. Silence is the safe failure.
--
-- *** NEVER OVERWRITE. *** Only a user whose `phone_number` IS NULL is touched.
-- A customer who has already signed in phone-first owns their number; this
-- migration has nothing to tell them. `phone_number_verified` is set false
-- because nobody has answered a code on it yet - they prove it on their first
-- OTP sign-in, which is exactly what the flag is for.
--
-- *** ANONYMOUS VISITORS ARE NOT CUSTOMERS. *** An `"isAnonymous"` row (122) is
-- a basket identity, not a sign-in, and `users_one_phone_number` is UNIQUE: a
-- number spent on a visitor row is a number the real person can never sign up
-- with. Dev holds 8 such rows and none has an address, so this excludes nothing
-- today and forecloses that on the day one does.
--
-- *** TWO PEOPLE, ONE NUMBER. *** A household shares a landline and a business
-- shares a switchboard, so two customers can honestly hold the same digits. The
-- unique index means only one of them can sign in with it, and picking which is
-- a human decision, not a migration's. So where a chosen number already belongs
-- to another account, or two customers would receive the same one, NEITHER is
-- filled and the ids are raised in a NOTICE. They keep signing in by email
-- until somebody decides. No number is ever printed.
--
-- *** IDEMPOTENT, AND IT HAS TO BE. *** Ruling 82 replays every migration from
-- a reset on production day, and `verify:backfill` runs the whole backfill set
-- three times inside one transaction. A second run finds every filled customer
-- holding a number and skips them; the collided ones are still collided,
-- because neither half of a collision was written. So it is one statement, with
-- no temporary table to survive a re-run, and it changes nothing the second
-- time.
--
-- No DDL: genesis is unchanged. exchange is read and not written.
-- ROLLBACK: there is no row this created, only a column it filled. To undo,
-- UPDATE auth.users SET phone_number = NULL, phone_number_verified = false
-- WHERE phone_number_verified = false AND <the ids this run's NOTICE named>.

DO $$
DECLARE
  eligible  bigint;
  filled    bigint;
  collided  bigint;
  no_number bigint;
  groups    text[];
  line      text;
BEGIN
  SELECT count(*) INTO eligible
    FROM auth.users u
   WHERE u.phone_number IS NULL
     AND u."isAnonymous" IS NOT TRUE;

  WITH book AS (
    SELECT ua.user_id,
           ua.address_id,
           coalesce(pa.created_at, ea.created_at) AS created_at,
           (SELECT max(o.created_at)
              FROM orders.addresses oa
              JOIN orders.orders o ON o.id = oa.order_id
             WHERE oa.source_address_id = ua.address_id
               AND o.user_id = ua.user_id) AS last_order_at,
           regexp_replace(coalesce(nullif(btrim(pa.phone_number), ''),
                                   nullif(btrim(ea.phone_number), '')),
                          '[^0-9]', '', 'g') AS digits
      FROM places.user_addresses ua
      JOIN auth.users u ON u.id = ua.user_id
      LEFT JOIN places.addresses pa ON pa.id = ua.address_id
      LEFT JOIN exchange.addresses ea ON ea.id = ua.address_id
     WHERE u.phone_number IS NULL
       AND u."isAnonymous" IS NOT TRUE
  ),
  candidate AS (
    SELECT DISTINCT ON (b.user_id)
           b.user_id,
           '+1' || right(b.digits, 10) AS phone
      FROM book b
     WHERE (length(b.digits) = 10 OR (length(b.digits) = 11 AND left(b.digits, 1) = '1'))
       AND right(b.digits, 10) ~ '^[2-9][0-9]{2}[2-9][0-9]{6}$'
     ORDER BY b.user_id,
              (b.last_order_at IS NOT NULL) DESC,
              b.last_order_at DESC,
              b.created_at ASC,
              b.address_id
  ),
  collision AS (
    SELECT c.user_id, c.phone
      FROM candidate c
     WHERE EXISTS (SELECT 1 FROM auth.users u WHERE u.phone_number = c.phone)
        OR EXISTS (SELECT 1 FROM candidate c2
                    WHERE c2.phone = c.phone AND c2.user_id <> c.user_id)
  ),
  updated AS (
    UPDATE auth.users u
       SET phone_number = c.phone,
           phone_number_verified = false
      FROM candidate c
     WHERE u.id = c.user_id
       AND u.phone_number IS NULL
       AND NOT EXISTS (SELECT 1 FROM collision x WHERE x.user_id = c.user_id)
    RETURNING u.id
  )
  SELECT (SELECT count(*) FROM updated),
         (SELECT count(*) FROM collision),
         (SELECT array_agg(g.line ORDER BY g.line)
            FROM (SELECT array_to_string(
                           array_agg(x.user_id::text ORDER BY x.user_id::text), ', ')
                         || coalesce(' (already the sign-in number of '
                              || (SELECT string_agg(u.id::text, ', ' ORDER BY u.id::text)
                                    FROM auth.users u WHERE u.phone_number = x.phone)
                              || ')', '') AS line
                    FROM collision x
                   GROUP BY x.phone) g)
    INTO filled, collided, groups;

  no_number := eligible - filled - collided;

  RAISE NOTICE '172: % customer account(s) held no sign-in number', eligible;
  RAISE NOTICE '172: filled % from the address book', filled;
  RAISE NOTICE '172: % had no address carrying a valid US number', no_number;
  RAISE NOTICE '172: % left unfilled because the number is shared', collided;

  IF groups IS NOT NULL THEN
    FOREACH line IN ARRAY groups LOOP
      RAISE NOTICE '172:   shared number - customers %', line;
    END LOOP;
  END IF;
END $$;

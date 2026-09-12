-- Every metal in the fixed vocabulary, zero rows included, so the empty-state
-- screen always has a row to render. est_value is priced here, in SQL -
-- nothing outside pricing sums money (ruling 75). The position expression is
-- shared with every other lot read, so this rollup and the inventory table
-- can never disagree about which lots are on hand.
SELECT m.id AS metal_id,
       COALESCE(on_hand.lots, 0)::int AS on_hand_lots,
       COALESCE(on_hand.content, 0) AS on_hand_content,
       CASE WHEN s.bid IS NULL THEN NULL ELSE COALESCE(on_hand.content, 0) * s.bid END AS est_value
  FROM metals.metals m
  LEFT JOIN spots.spots s ON s.metal_id = m.id
  LEFT JOIN LATERAL (
         SELECT count(*) AS lots, sum(li.content) AS content
           FROM lots.items li
          WHERE li.metal_id = m.id
            AND /*__lot_position__*/ = 'on hand'
       ) on_hand ON TRUE
 ORDER BY m.id

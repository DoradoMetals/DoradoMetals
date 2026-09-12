SELECT li.id, /*__lot_position__*/ AS position
  FROM lots.items li
 WHERE li.id = ANY($1::uuid[])

SELECT li.id, /*__lot_position__*/ AS position
  FROM inventory.lots li
 WHERE li.id = ANY($1::uuid[])

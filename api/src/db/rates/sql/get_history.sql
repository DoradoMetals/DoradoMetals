SELECT rh.id, rh.rate_id, rh.field, rh.old_value, rh.new_value,
       rh.actor_id, rh.actor_name, rh.changed_at
  FROM rates.rate_history rh
 ORDER BY rh.changed_at DESC, rh.id DESC

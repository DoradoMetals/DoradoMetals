SELECT u.id,
       u.email,
       u.name,
       u.phone_number,
       u."createdAt"     AS created_at,
       u."updatedAt"     AS updated_at,
       u."emailVerified" AS email_verified,
       u.image,
       u.role,
       u.dorado_funds,
       u."isAnonymous",
       u.banned,
       u."banReason"  AS ban_reason,
       u."banExpires" AS ban_expires,
       u.assigned_to_id,
       u.notes,
       u.sms_consent_at,
       u.sms_consent_method,
       (SELECT count(*) FROM orders.orders o WHERE o.user_id = u.id) AS orders_count,
       (SELECT count(*) FROM orders.orders o
         WHERE o.user_id = u.id
           AND /*__order_state__*/ NOT IN ('Completed', 'Cancelled')) AS open_orders_count,
       greatest(
         (SELECT max(m.created_at) FROM crm.sms_messages m WHERE m.user_id = u.id),
         (SELECT max(c.started_at) FROM crm.calls c WHERE c.user_id = u.id)
       ) AS last_contact
  FROM auth.users u
 ORDER BY u.role, u.id

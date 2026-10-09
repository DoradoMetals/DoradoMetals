-- One row per assign or reassign. assigned_to_id may be NULL: taking a lead
-- off an employee is as much a fact as giving it to one. assigned_at,
-- created_at, updated_at and the actor are all stamped by the database.
INSERT INTO crm.assignments (user_id, lead_id, assigned_to_id)
VALUES ($1, $2, $3)
RETURNING id, user_id, lead_id, assigned_to_id, assigned_at,
          created_at, updated_at, created_by_id, updated_by_id

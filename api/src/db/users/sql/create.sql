INSERT INTO auth.users
       (email, name, phone_number, role, "emailVerified", phone_number_verified, dorado_funds, "isAnonymous")
VALUES ($1, $2, $3, 'user', false, false, 0, false)
RETURNING id

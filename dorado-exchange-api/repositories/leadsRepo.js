const pool = require("../db");

async function getLead(id) {
  const query = `
    SELECT *
    FROM exchange.leads
    WHERE id = $1
  `;
  const values = [id];
  const result = await pool.query(query, values);
  return result.rows[0];
}

async function getAllLeads() {
  const query = `
    SELECT *
    FROM exchange.leads
    ORDER BY created_at DESC
  `;
  const result = await pool.query(query, []);
  return result.rows;
}

async function createLead(lead) {
  const query = `
    INSERT INTO exchange.leads (name, phone, email, created_by, updated_by)
    VALUES ($1, $2, $3, $4, $5)
    RETURNING *;
  `;
  const values = [
    lead.name,
    lead.phone,
    lead.email,
    lead.created_by,
    lead.updated_by,
  ];
  const result = await pool.query(query, values);
  return result.rows[0];
}

async function updateLead(lead, user_name) {
  const query = `
    UPDATE exchange.leads
    SET name = $1,
        phone = $2,
        email = $3,
        updated_at = NOW(),
        updated_by = $4,
        last_contacted = $5,
        converted = $6,
        contacted = $7,
        responded = $8,
        contact = $9,
        notes = $10
    WHERE id = $11
    RETURNING *;
  `;

  const values = [
    lead.name,
    lead.phone,
    lead.email,
    user_name,
    lead.last_contacted,
    lead.converted,
    lead.contacted,
    lead.responded,
    lead.contact,
    lead.notes,
    lead.id,
  ];

  const result = await pool.query(query, values);
  return result.rows[0];
}

async function deleteLead(id) {
  const query = `
    DELETE FROM exchange.leads WHERE id = $1
  `;
  const values = [id];
  return await pool.query(query, values);
}

module.exports = {
  getLead,
  getAllLeads,
  createLead,
  updateLead,
  deleteLead,
};

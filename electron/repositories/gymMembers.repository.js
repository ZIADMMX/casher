const { db } = require('../database/db');

function getProfile(customerId) {
  return db.prepare(`
    SELECT p.customer_id, p.emergency_name, p.emergency_phone, p.health_notes, p.trainer_id,
           t.name AS trainer_name, p.updated_at
    FROM gym_member_profiles p
    LEFT JOIN gym_trainers t ON t.id = p.trainer_id
    WHERE p.customer_id = ?
  `).get(customerId) || null;
}

function getAllProfiles() {
  return db.prepare(`
    SELECT p.customer_id, p.emergency_name, p.emergency_phone, p.health_notes, p.trainer_id, t.name AS trainer_name
    FROM gym_member_profiles p
    LEFT JOIN gym_trainers t ON t.id = p.trainer_id
  `).all();
}

function saveProfile(customerId, { emergency_name, emergency_phone, health_notes, trainer_id }) {
  db.prepare(`
    INSERT INTO gym_member_profiles (customer_id, emergency_name, emergency_phone, health_notes, trainer_id, updated_at)
    VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(customer_id) DO UPDATE SET
      emergency_name = excluded.emergency_name,
      emergency_phone = excluded.emergency_phone,
      health_notes = excluded.health_notes,
      trainer_id = excluded.trainer_id,
      updated_at = CURRENT_TIMESTAMP
  `).run(customerId, emergency_name, emergency_phone, health_notes, trainer_id);
}

function trainerExists(trainerId) {
  return Boolean(db.prepare('SELECT 1 FROM gym_trainers WHERE id = ? AND is_active = 1').get(trainerId));
}

module.exports = { getProfile, getAllProfiles, saveProfile, trainerExists };

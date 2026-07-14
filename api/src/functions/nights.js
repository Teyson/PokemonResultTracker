const { app } = require('@azure/functions');
const { sql, getPool } = require('../db');

/**
 * /api/nights  — the league night log. Requires the "member" role
 * (enforced by allowedRoles in staticwebapp.config.json).
 *
 *   GET    /api/nights        -> [{ id, date, deck, type, w, t, l, notes }]
 *   POST   /api/nights        -> create   (body: { date, deck, type, w, t, l, notes? })
 *   PUT    /api/nights/{id}   -> update
 *   DELETE /api/nights/{id}   -> delete
 *
 * Decks are normalized into their own table; the client just sends a deck name
 * plus type and we upsert the deck transparently.
 */

const SELECT_NIGHTS = `
  SELECT n.id,
         CONVERT(char(10), n.played_on, 23) AS [date],
         d.name        AS deck,
         d.energy_type AS [type],
         n.wins   AS w,
         n.ties   AS t,
         n.losses AS l,
         n.notes
  FROM nights n
  JOIN decks d ON d.id = n.deck_id
`;

function toInt(v) { const n = parseInt(v, 10); return Number.isFinite(n) && n >= 0 ? n : 0; }

function parseBody(body) {
  const date = (body.date || '').trim();
  const deck = (body.deck || '').trim();
  const type = (body.type || 'Colorless').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: 'A valid date (YYYY-MM-DD) is required.' };
  if (!deck) return { error: 'A deck name is required.' };
  return { date, deck, type, w: toInt(body.w), t: toInt(body.t), l: toInt(body.l), notes: (body.notes || '').trim() || null };
}

async function upsertDeck(pool, name, type) {
  const result = await pool.request()
    .input('name', sql.NVarChar, name)
    .input('type', sql.NVarChar, type)
    .query(`
      MERGE decks AS target
      USING (SELECT @name AS name) AS src
        ON LOWER(target.name) = LOWER(src.name)
      WHEN MATCHED THEN
        UPDATE SET energy_type = @type
      WHEN NOT MATCHED THEN
        INSERT (name, energy_type) VALUES (@name, @type)
      OUTPUT INSERTED.id;
    `);
  return result.recordset[0].id;
}

app.http('nights', {
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  authLevel: 'anonymous',
  route: 'nights/{id?}',
  handler: async (request, context) => {
    const id = request.params.id;
    try {
      const pool = await getPool();

      if (request.method === 'GET') {
        const result = await pool.request().query(SELECT_NIGHTS + ' ORDER BY n.played_on DESC, n.id DESC;');
        return { jsonBody: result.recordset };
      }

      if (request.method === 'DELETE') {
        if (!id) return { status: 400, jsonBody: { error: 'Missing night id.' } };
        const del = await pool.request().input('id', sql.Int, parseInt(id, 10))
          .query('DELETE FROM nights WHERE id = @id;');
        if (del.rowsAffected[0] === 0) return { status: 404, jsonBody: { error: 'Night not found.' } };
        return { status: 204 };
      }

      // POST / PUT share the same body shape
      let raw = {};
      try { raw = await request.json(); } catch (e) { return { status: 400, jsonBody: { error: 'Invalid JSON body.' } }; }
      const parsed = parseBody(raw);
      if (parsed.error) return { status: 400, jsonBody: { error: parsed.error } };

      const deckId = await upsertDeck(pool, parsed.deck, parsed.type);

      if (request.method === 'POST') {
        const ins = await pool.request()
          .input('date', sql.Date, parsed.date)
          .input('deck_id', sql.Int, deckId)
          .input('w', sql.Int, parsed.w).input('t', sql.Int, parsed.t).input('l', sql.Int, parsed.l)
          .input('notes', sql.NVarChar, parsed.notes)
          .query(`
            INSERT INTO nights (played_on, deck_id, wins, ties, losses, notes)
            OUTPUT INSERTED.id
            VALUES (@date, @deck_id, @w, @t, @l, @notes);
          `);
        const newId = ins.recordset[0].id;
        const row = await pool.request().input('id', sql.Int, newId).query(SELECT_NIGHTS + ' WHERE n.id = @id;');
        return { status: 201, jsonBody: row.recordset[0] };
      }

      // PUT
      if (!id) return { status: 400, jsonBody: { error: 'Missing night id.' } };
      const upd = await pool.request()
        .input('id', sql.Int, parseInt(id, 10))
        .input('date', sql.Date, parsed.date)
        .input('deck_id', sql.Int, deckId)
        .input('w', sql.Int, parsed.w).input('t', sql.Int, parsed.t).input('l', sql.Int, parsed.l)
        .input('notes', sql.NVarChar, parsed.notes)
        .query(`
          UPDATE nights
          SET played_on = @date, deck_id = @deck_id, wins = @w, ties = @t, losses = @l, notes = @notes
          WHERE id = @id;
        `);
      if (upd.rowsAffected[0] === 0) return { status: 404, jsonBody: { error: 'Night not found.' } };
      const row = await pool.request().input('id', sql.Int, parseInt(id, 10)).query(SELECT_NIGHTS + ' WHERE n.id = @id;');
      return { jsonBody: row.recordset[0] };

    } catch (err) {
      context.error('nights handler failed', err);
      return { status: 500, jsonBody: { error: 'Database error. If the app was idle, the database may be waking up — try again in a few seconds.' } };
    }
  }
});

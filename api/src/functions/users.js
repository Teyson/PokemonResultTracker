const { app } = require('@azure/functions');
const { sql, getPool, getUser } = require('../db');

/**
 * /api/users  — the member whitelist. Admin only
 * (enforced by allowedRoles: ["admin"] in staticwebapp.config.json).
 *
 *   GET    /api/users        -> { admin: "<login>", users: [{ id, github_login, role, created_at }] }
 *   POST   /api/users        -> add a member   (body: { github_login })
 *   DELETE /api/users/{id}   -> remove a member
 *
 * The admin themselves is defined by the ADMIN_GITHUB_LOGIN app setting, not by
 * a table row, so the admin always has access even before the DB has any rows.
 */
app.http('users', {
  methods: ['GET', 'POST', 'DELETE'],
  authLevel: 'anonymous',
  route: 'users/{id?}',
  handler: async (request, context) => {
    const id = request.params.id;
    const admin = (process.env.ADMIN_GITHUB_LOGIN || '').trim();
    try {
      const pool = await getPool();

      if (request.method === 'GET') {
        const result = await pool.request()
          .query('SELECT id, github_login, role, CONVERT(char(10), created_at, 23) AS created_at FROM allowed_users ORDER BY created_at ASC, id ASC;');
        return { jsonBody: { admin, users: result.recordset } };
      }

      if (request.method === 'POST') {
        let raw = {};
        try { raw = await request.json(); } catch (e) { return { status: 400, jsonBody: { error: 'Invalid JSON body.' } }; }
        const login = (raw.github_login || '').trim().replace(/^@/, '');
        if (!login || !/^[A-Za-z0-9-]{1,39}$/.test(login)) {
          return { status: 400, jsonBody: { error: 'Enter a valid GitHub username (letters, numbers and hyphens).' } };
        }
        if (login.toLowerCase() === admin.toLowerCase()) {
          return { status: 400, jsonBody: { error: 'That user is already the admin.' } };
        }
        const me = getUser(request);
        const addedBy = me ? me.userDetails : null;
        try {
          const ins = await pool.request()
            .input('login', sql.NVarChar, login)
            .input('added_by', sql.NVarChar, addedBy)
            .query(`
              INSERT INTO allowed_users (github_login, role, added_by)
              OUTPUT INSERTED.id, INSERTED.github_login, INSERTED.role, CONVERT(char(10), INSERTED.created_at, 23) AS created_at
              VALUES (@login, 'member', @added_by);
            `);
          return { status: 201, jsonBody: ins.recordset[0] };
        } catch (err) {
          if (err.number === 2627 || err.number === 2601) { // unique constraint
            return { status: 409, jsonBody: { error: login + ' is already on the list.' } };
          }
          throw err;
        }
      }

      // DELETE
      if (!id) return { status: 400, jsonBody: { error: 'Missing user id.' } };
      const del = await pool.request().input('id', sql.Int, parseInt(id, 10))
        .query("DELETE FROM allowed_users WHERE id = @id AND role <> 'admin';");
      if (del.rowsAffected[0] === 0) return { status: 404, jsonBody: { error: 'Member not found (or is an admin).' } };
      return { status: 204 };

    } catch (err) {
      context.error('users handler failed', err);
      return { status: 500, jsonBody: { error: 'Database error. If the app was idle, the database may be waking up — try again in a few seconds.' } };
    }
  }
});

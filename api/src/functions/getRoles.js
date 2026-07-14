const { app } = require('@azure/functions');
const { sql, getPool } = require('../db');

/**
 * Custom roles function (rolesSource in staticwebapp.config.json).
 * Static Web Apps POSTs the signed-in user's identity here on every login and
 * uses the returned roles for the session. We grant:
 *   - "admin" + "member"  to the configured ADMIN_GITHUB_LOGIN
 *   - "member"            to anyone the admin has whitelisted in allowed_users
 *   - nothing extra       to everyone else (they stay merely "authenticated")
 *
 * Once wired as rolesSource, this endpoint can't be called from outside SWA.
 */
app.http('GetRoles', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'GetRoles',
  handler: async (request, context) => {
    let body = {};
    try { body = await request.json(); } catch (e) { /* empty body */ }

    const login = (body.userDetails || '').trim().toLowerCase();
    const admin = (process.env.ADMIN_GITHUB_LOGIN || '').trim().toLowerCase();
    const roles = [];

    if (login && login === admin) {
      return { jsonBody: { roles: ['admin', 'member'] } };
    }

    if (login) {
      try {
        const pool = await getPool();
        const result = await pool.request()
          .input('login', sql.NVarChar, login)
          .query('SELECT role FROM allowed_users WHERE LOWER(github_login) = @login');
        if (result.recordset.length) {
          const role = result.recordset[0].role;
          if (role === 'admin') roles.push('admin', 'member');
          else roles.push('member');
        }
      } catch (err) {
        context.error('GetRoles DB lookup failed', err);
        // Fail closed: no extra roles rather than granting access on error.
      }
    }

    return { jsonBody: { roles } };
  }
});

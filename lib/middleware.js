/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */
/* Middleware for The Whistle.                                                     C.Veness 2017  */
/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

import jwt     from 'jsonwebtoken'; // JSON Web Token implementation
import fs      from 'fs-extra';     // fs with extra functions & promise interface
import glob    from 'glob-promise'; // match files using the patterns the shell uses
import MongoDB from 'mongodb';      // MongoDB driver for Node.js
const MongoClient = MongoDB.MongoClient;


class Middleware {

    /**
     * Verify the JSON Web Token authentication supplied in (signed) cookie.
     *
     * If the token verifies, record the payload in ctx.state.user: the user id is held in ctx.state.user.id.
     *
     * Issued tokens have 24-hour validity. If the cookie contains an expired token, and the user logged
     * with using the 'remember-me' option, then issue a replacement 24-hour token, and renew the cookie
     * for a further 7 days. The 'remember-me' function will lapse after 7 days inactivity.
     */
    static verifyJwt() {
        return async function(ctx, next) {
            const token = ctx.cookies.get('koa:jwt', { signed: true });

            if (token) {
                // the jwt cookie is held against the top-level domain, for login interoperability between admin. & report.
                const domain = ctx.request.hostname.replace(/^admin\.|^report\./, '');

                try {
                    const  payload = jwt.verify(token, 'the-whistle-jwt-signature-key'); // throws on invalid token

                    // valid token: accept it...
                    await setupUser(ctx, payload);
                } catch (err) {
                    // verify failed - retry with ignore expire option
                    const options = { signed: true, domain: domain };

                    try {
                        const payload = jwt.verify(token, 'the-whistle-jwt-signature-key', { ignoreExpiration: true });

                        // valid token except for exp: accept it...
                        await setupUser(ctx, payload);

                        // ... and re-issue a replacement token for a further 24 hours
                        delete payload.exp;
                        const replacementToken = jwt.sign(payload, 'the-whistle-jwt-signature-key', { expiresIn: '24h' });
                        if (payload.remember) options.expires = new Date(Date.now() + 1000*60*60*24*7); // remember-me for 7d
                        ctx.cookies.set('koa:jwt', replacementToken, options);
                    } catch (e) {
                        if ([ 'invalid token', 'invalid signature' ].includes(e.message)) {
                            // delete the cookie holding the JSON Web Token
                            ctx.cookies.set('koa:jwt', null, options);
                            ctx.throw(401, 'Invalid authentication'); // verify (both!) failed
                        }
                        ctx.throw(e.status||500, e.message); // Internal Server Error
                    }
                }
            }

            await next();
        };
    }

}


/**
 * Record user details in ctx.state.user.
 *
 * This expands the cryptic abbreviated roles in the JWT token to full versions. Also, if there is
 * no MongoDB connection already set up for the user's organisation database, that is done here.
 *
 * @param ctx
 * @param jwtPayload
 * @private
 */
async function setupUser(ctx, jwtPayload) {
    const roles = { g: 'guest', u: 'user', a: 'admin', r: 'reporter', s: 'su' };

    ctx.state.user = Object.assign({}, jwtPayload);                           // for user id  to look up user details
    if (!ctx.state.user.roles) ctx.state.user.roles = '';                     // avoid risk of exception due to unset roles!
    ctx.state.user.roles = ctx.state.user.roles.split('').map(r => roles[r]); // abbreviated string -> array
    ctx.state.user.isAdmin = ctx.state.user.roles.includes('admin');          // for nav menu
    //ctx.state.user.jwt = token;                                             // for ajax->api calls

    // get list of reports user can submit; 'internal' reports are determined by having an
    // '-internal.html' template, otherwise reports are taken to be public
    ctx.state.user.projects = {};
    for (const project of await glob(`app-report/${ctx.state.user.db}/*`)) {
        const internal = await fs.pathExists(`${project}/templates/pages/-internal.html`);
        const menu = project.replace('app-report/', '') + (internal ? ' (internal)':' (public)');
        const url = `http://${ctx.host.replace('admin', 'report')}${project.replace('app-report', '')}${internal?'/internal':''}`;
        ctx.state.user.projects[menu] = url;
    }

    // if we don't have db connection for this user's (current) db, get it now (qv login.js)
    // (these will remain in global for entire app, this doesn't happen per request)
    const db = ctx.state.user.db;
    if (!global.db[db]) {
        try {
            const connectionString = process.env[`DB_${db.toUpperCase().replace('-', '_')}`];
            global.db[db] = await MongoClient.connect(connectionString);
        } catch (e) {
            const loginfailmsg = `Invalid database credentials for ‘${db}’`;
            ctx.flash = { username: ctx.state.user.email, loginfailmsg: loginfailmsg };
            ctx.redirect('/login');
            return;
        }
    }
}


/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

export default Middleware;

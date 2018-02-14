/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */
/* Middleware for The Whistle.                                                C.Veness 2017-2018  */
/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

import jwt     from 'jsonwebtoken'; // JSON Web Token implementation
import fs      from 'fs-extra';     // fs with extra functions & promise interface
import glob    from 'glob-promise'; // match files using the patterns the shell uses
import MongoDB from 'mongodb';      // MongoDB driver for Node.js
const MongoClient = MongoDB.MongoClient;


class Middleware {

    /**
     * Force SSL; if protocol is http and NODE_ENV is production, redirect to same url using https.
     *
     * Note if app.proxy is true, ctx.request.secure will respect X-Forwarded-Proto, hence
     * opt.trustProxy is implied.
     *
     * qv github.com/jclem/koa-ssl, github.com/turboMaCk/koa-sslify
     *
     * @param {boolean} options.disabled=NODE_ENV!='production' - If true, all requests will be
     *   allowed through.
     * @param {boolean} options.trustProxy=false - If true, trust the x-forwarded-proto header; qv
     *   devcenter.heroku.com/articles/http-routing#heroku-headers.
     */
    static ssl(options) {
        const defaults = { disabled: process.env.NODE_ENV != 'production', trustProxy: false };
        const opt = Object.assign(defaults, options);

        return async function sslMiddleware(ctx, next) {
            if (opt.disabled) { // nothing to do
                await next();
                return;
            }

            const xfp = ctx.request.get('x-forwarded-proto');
            const isSecure = ctx.request.secure || (opt.trustProxy && xfp=='https');

            if (isSecure) { // secure or trusted, all well & good
                await next();
                return;
            }

            if (ctx.method=='GET' || ctx.method=='HEAD') { // redirect to https equivalent
                ctx.status = 301;
                ctx.redirect(ctx.request.href.replace(/^http/, 'https'));
                return;
            }

            ctx.status = 403; // otherwise respond Forbidden
        };
    }


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
                            ctx.cookies.set('koa:jwt', null, { signed: true }); // TODO: tmp for transition period
                            ctx.throw(401, 'Invalid authentication'); // verify (both!) failed
                        }
                        ctx.throw(e.status||500, e.message); // Internal Server Error
                    }
                }
            }

            // if we had a valid token, the user is now set up as a logged-in user; continue on to
            // subsequent middleware
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

    // get list of reports user can submit for 'submit' menu; 'internal' reports are determined by
    // having an 'page+.html' template, 'public' reports by having an 'index.html' template
    ctx.state.user.projects = {};
    for (const project of await glob(`app-report/${ctx.state.user.db}/*`)) {
        const internal = await fs.pathExists(`${project}/templates/pages/page+.html`);
        if (internal) {
            const menu = project.replace(`app-report/${ctx.state.user.db}/`, '') + ' Internal Form';
            const url = `http://${ctx.host.replace('admin', 'report')}${project.replace('app-report', '')}/*`;
            ctx.state.user.projects[menu.replace('sexual-assault', 'Rape is a Crime')] = url; // TODO: KLUDGE ALERT!
        }
        const external = await fs.pathExists(`${project}/templates/pages/index.html`);
        if (external) {
            const menu = project.replace(`app-report/${ctx.state.user.db}/`, '') + ' Public Form';
            const url = `http://${ctx.host.replace('admin', 'report')}${project.replace('app-report', '')}`;
            ctx.state.user.projects[menu.replace('sexual-assault', 'Rape is a Crime')] = url; // TODO: KLUDGE ALERT!
        }
    }

    // if we don't have db connection for this user's (current) db, get it now (qv login.js)
    // (these will remain in global for entire app, this doesn't happen per request);
    // qv app-report/middleware.js
    const db = ctx.state.user.db;
    if (!global.db[db]) {
        try {
            const connectionString = process.env[`DB_${db.toUpperCase().replace('-', '_')}`];
            if (connectionString == undefined) ctx.throw(404, `No configuration available for organisation ‘${db}’`);
            const client = await MongoClient.connect(connectionString);
            global.db[db] = client.db(client.s.options.dbName);
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

/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */
/* Middleware for The Whistle.                                                C.Veness 2017-2018  */
/*                                                                                                */
/*                                  © 2017-2018 Cambridge University / The Whistle | MIT licence  */
/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

import jwt from 'jsonwebtoken'; // JSON Web Token implementation

import FormGenerator from './form-generator.js';


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

            if (ctx.request.method=='GET' || ctx.request.method=='HEAD') { // redirect to https equivalent
                ctx.response.status = 301;
                ctx.response.redirect(ctx.request.href.replace(/^http/, 'https'));
                return;
            }

            ctx.response.status = 403; // otherwise respond Forbidden
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
                // the jwt cookie is held against the top-level domain, for login interoperability between subdomains
                const domain = ctx.request.hostname.replace(/^admin\.|^report\./, '');

                try {
                    const  payload = jwt.verify(token, process.env.JWT_SECRET_KEY); // throws on invalid token

                    // valid token: accept it...
                    await setupUser(ctx, payload);
                } catch (err) {
                    // verify failed - retry with ignore expire option
                    const options = { signed: true, domain: domain };

                    try {
                        const payload = jwt.verify(token, process.env.JWT_SECRET_KEY, { ignoreExpiration: true });

                        // valid token except for exp: accept it...
                        await setupUser(ctx, payload);

                        // ... and re-issue a replacement token for a further 24 hours
                        delete payload.exp;
                        const replacementToken = jwt.sign(payload, process.env.JWT_SECRET_KEY, { expiresIn: '24h' });
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

            // if we had a valid token, the user is now set up as a logged-in user with details in ctx.state.user
            await next();
        };
    }

}


/**
 * Record user details in ctx.state.user.
 *
 * - expands the cryptic abbreviated roles in the JWT token to full versions
 * - sets up ctx.state.user.projects for list of reports user can access from 'submit' menu
 * - sets up MongoDB connection already set up for the user's organisation database if not already done
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

    const db = ctx.state.user.db; // ≡ organisation

    // get list of reports user can submit for 'submit' menu; it seems a shame to have a separate
    // config file (reports.json) to list these, but I can't see any other way aside from requiring
    // each report to be in a directory of its own, which would be strange for single-file report
    // specs
    ctx.state.user.projects = {};
    try {
        // titles of built forms for current organisation, to display in 'submit' menu
        await FormGenerator.waitForBuilds(); // if someone's got in before form build, wait until done
        const projects = Object.assign({}, FormGenerator.title[db], FormGenerator.title[db.replace(/-test$/, '')]);
        for (const project in projects) {
            const url = `http://${ctx.request.host.replace('admin', 'report')}/${db}/${project}`;
            const title = projects[project];
            const titleSexualAssaultPatch = title.replace('Sexual Assault', 'Rape is a Crime'); // TODO: KLUDGE ALERT! - until GRN naming fixed
            ctx.state.user.projects[titleSexualAssaultPatch + ' – Internal Form'] = url+'/*';
            ctx.state.user.projects[titleSexualAssaultPatch + ' – Public Form'] = url;
        }
    } catch (e) {
        // just ignore it for now, no forms will appear under 'submit' menu
        console.error(e);
    }
}


/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

export default Middleware;

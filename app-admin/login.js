/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */
/* Login handlers (invoked by router to render templates).                    C.Veness 2017-2018  */
/*                                                                                                */
/* GET functions render template pages; POST functions process post requests then redirect.       */
/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

import Scrypt from 'scrypt-kdf';   // scrypt key derivation function
import jwt    from 'jsonwebtoken'; // JSON Web Token implementation

import User from '../models/user.js';


class LoginHandlers {

    /**
     * GET /login - render login page.
     *
     * If user is already logged in, login details are shown in place of login form.
     *
     * Allow url after the 'login', to specify a redirect after a successful login.
     * Allow user=email querystring to show databases without ajax call.
     */
    static async getLogin(ctx) {
        const context = ctx.flash.formdata || {};

        // user=email querystring?
        if (ctx.request.query.user) context.username = ctx.request.query.user;

        if (context.username) {
            // if username set & user has access to more than one org'n, show list of them
            const [ usr ] = await User.getBy('email', context.username);
            if (usr && usr.databases.length>1) context.databases = usr.databases;
        }

        await ctx.render('login', context);
    }


    /**
     * GET /logout - logout user
     */
    static getLogout(ctx) {
        // note cookies are held in top-level domain to enable common login between admin & report
        const domain = ctx.request.hostname.replace('admin.', '');

        // delete the cookie holding the JSON Web Token
        const options = { signed: true, domain: domain };
        ctx.cookies.set('koa:jwt', null, options);
        ctx.cookies.set('koa:jwt', null, { signed: true }); // TODO: tmp for transition period
        ctx.response.redirect('/');
    }


    /* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */


    /**
     * POST /login - process login
     *
     * If user authenticates, create JSON Web Token & record it in a signed cookie for subsequent
     * requests, and record the payload in ctx.state.user.
     *
     * The JWT payload includes the user id, the user’s roles so that authorisation checks can be
     * done without a database query (just initial letters so that the roles in the token are not
     * too obvious), and whether the token can be renewed for a ‘remember-me’ function.
     */
    static async postLogin(ctx) {
        const body = ctx.request.body;

        let [ user ] = await User.getBy('email', body.username); // lookup user

        // always invoke verify() (whether email found or not) to mitigate against timing attacks on login function
        const passwordHash = user ? user.password : '0123456789abcdef'.repeat(8);
        let passwordMatch = null;
        try {
            passwordMatch = await Scrypt.verify(Buffer.from(passwordHash, 'base64'), body.password);
        } catch (e) {
            user = null; // e.g. "Invalid key"
        }

        if (ctx.request.hostname.split('.').length < 3) {
            // as JWT login tokens are held in the full domain (above admin. / report.) to
            // facilitate common logins across admin & report apps, and cookies can not be set on
            // top level domains, for logins to work the hostname must have three levels
            ctx.flash = { _error: 'Domain name must include 3 levels' };
            ctx.response.redirect(ctx.request.url);
            return;
        }

        if (!user || !passwordMatch) {
            // login failed: redisplay login page with login fail message
            const loginfailmsg = 'E-mail / password not recognised';
            ctx.flash = { formdata: body, loginfailmsg: loginfailmsg };
            ctx.response.redirect(ctx.request.url);
            return;
        }

        if (user.databases.length == 0) {
            // user has no rights to any databases???
            const loginfailmsg = 'No databases authorised';
            ctx.flash = { formdata: body, loginfailmsg: loginfailmsg };
            ctx.response.redirect(ctx.request.url);
            return;
        }

        if (user.databases.length > 1 && !body.database) {
            // login submitted without having selected database - re-present with databases listed (not relying on ajax)
            ctx.response.redirect(ctx.request.url + `?user=${body.username}`);
            return;
        }

        // if user has access to just one database, pick it up from user details, otherwise it will
        // have been supplied in the post data
        const db = user.databases.length>1 ? body.database : user.databases[0];

        // submitted credentials validate: create JWT & record it in a cookie to 'log in' user

        const payload = {
            id:       user._id,                                                  // to get user details
            name:     user.username,                                             // make username available without db query
            roles:    user.roles.map(r => r.slice(0, 1).toLowerCase()).join(''), // make roles available without db query (slightly obfuscated)
            db:       db,                                                        // currently selected database
            remember: body['remember-me'] ? true : false,                        // whether token can be renewed
        };
        const token = jwt.sign(payload, process.env.JWT_SECRET_KEY, { expiresIn: '24h' });

        // record token in signed cookie, in top-level domain to be available to both admin. and report. subdomains
        // note in test suite, this is invoked also from report app
        const domain = ctx.request.hostname.replace(/admin\.|report\./, '');
        const options = { signed: true, domain: domain };
        // if 'remember-me', set cookie for 1 week, otherwise set session only
        if (body['remember-me']) options.expires = new Date(Date.now() + 1000*60*60*24*7);

        ctx.cookies.set('koa:jwt', token, options);

        // if we were provided with a redirect URL after the /login, redirect there, otherwise to /
        const href = ctx.request.url=='/login' ? '/' : ctx.request.url.replace('/login', '');
        if (href.match(/^\/-\//)) {
            // kludgy trick for paralegal single-page reporting login: if href starts /-/, redir to report. subdomain
            const hrefReport = `${ctx.request.protocol}://${ctx.request.host.replace('admin', 'report')}${href.replace('/-', '')}`;
            ctx.response.redirect(hrefReport);
            return;
        }
        ctx.response.redirect(href);
    }


    /* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */
    /* Ajax functions                                                                             */
    /* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */


    /**
     * GET /ajax/login/databases?user=email - Return list of databases user has access to
     */
    static async getUserDatabases(ctx) {
        const [ user ] = await User.getBy('email', ctx.request.query.user); // lookup user

        ctx.response.body = { databases: user ? user.databases : [] };
        ctx.response.status = 200; // Ok
    }

}


/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

export default LoginHandlers;

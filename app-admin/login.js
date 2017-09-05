/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */
/* Login handlers (invoked by router to render templates)                                         */
/*                                                                                                */
/* All functions here either render or redirect, or throw.                                        */
/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

'use strict';

const scrypt = require('scrypt');       // scrypt library
const jwt    = require('jsonwebtoken'); // JSON Web Token implementation

const User     = require('../models/user.js');
const Report   = require('../models/report.js');
const Resource = require('../models/resource.js');

const MongoClient = require('mongodb').MongoClient;


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
        const context = {};

        const user = ctx.query.user ? await User.get(ctx.query.user.id) : null;
        if (user) {
            // logged-in user: show current roles as part of confirmation
            context.user.roles = user.roles.join(', '); // for confirmation display
        } else {
            if (ctx.request.query.user) context.username = ctx.request.query.user;  // no db selected
            if (ctx.flash.formdata) context.username = ctx.flash.formdata.username; // failed authentication
            if (context.username) {
                // show list of databases
                const [usr] = await User.getBy('email', context.username);
                if (usr && usr.databases.length>1) context.databases = usr.databases;
            }
        }

        await ctx.render('login', context);
    }


    /**
     * GET /logout - logout user
     */
    static getLogout(ctx) {
        ctx.cookies.set('koa:jwt', null, { signed: true }); // delete the cookie holding the JSON Web Token
        ctx.redirect('/');
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

        let [user] = await User.getBy('email', body.username); // lookup user

        // always invoke verifyKdf (whether email found or not) to mitigate against timing attacks on login function
        const userPassword = user ? user.password : Math.random().toString();
        let passwordMatch = null;
        try {
            passwordMatch = await scrypt.verifyKdf(Buffer.from(user.password, 'base64'), body.password);
        } catch (e) {
            user = null; // e.g. "data is not a valid scrypt-encrypted block"
        }

        if (!user || !passwordMatch) {
            // login failed: redisplay login page with login fail message
            const loginfailmsg = 'E-mail / password not recognised';
            ctx.flash = { formdata: body, loginfailmsg: loginfailmsg };
            ctx.redirect(ctx.url);
            return;
        }

        if (user.databases.length == 0) {
            // user has no rights to any databases???
            const loginfailmsg = 'No databases authorised';
            ctx.flash = { formdata: body, loginfailmsg: loginfailmsg };
            ctx.redirect(ctx.url);
            return;
        }

        if (user.databases.length > 1 && !body.database) {
            // login submitted without having selected database - represent with databases listed (not relying on ajax)
            ctx.redirect(ctx.url + `?user=${body.username}`);
            return;
        }

        // if user has access to just one database, pick it up from user details, otherwise it will
        // have been supplied in the post data
        const db = user.databases.length>1 ? body.database : user.databases[0];

        // if we don't have db connection for this user's (current) db, get it now (qv app.admin.js)
        // (these will remain in global for entire app, this doesn't happen per request)
        if (!global.db[db]) {
            try {
                const connectionString = process.env[`DB_${db.toUpperCase()}`];
                global.db[db] = await MongoClient.connect(connectionString);
            } catch (e) {
                const loginfailmsg = `Invalid database credentials for ‘${db}’`;
                ctx.flash = { formdata: body, loginfailmsg: loginfailmsg };
                ctx.redirect(ctx.url);
                return;
            }
        }

        // init db in case this is first time db is used
        await Report.init(db);
        await Resource.init(db);

        // submitted credentials validate: create JWT & record it in a cookie to 'log in' user

        const payload = {
            id:       user._id,                                                 // to get user details
            name:     user.username,                                            // make username available without db query
            roles:    user.roles.map(r => r.slice(0,1).toLowerCase()).join(''), // make roles available without db query (slightly obfuscated)
            db:       db,                                                       // currently selected database
            remember: body['remember-me'] ? true : false,                       // whether token can be renewed
        };
        const token = jwt.sign(payload, 'koa-sample-app-signature-key', { expiresIn: '24h' });

        // record token in signed cookie; if 'remember-me', set cookie for 1 week, otherwise set session only
        const options = { signed: true };
        if (body['remember-me']) options.expires = new Date(Date.now() + 1000*60*60*24*7);

        ctx.cookies.set('koa:jwt', token, options);

        // if we were provided with a redirect URL after the /login, redirect there, otherwise /
        ctx.redirect(ctx.url=='/login' ? '/' : ctx.url.replace('/login', ''));
    }


    /* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */
    /* Ajax functions                                                                             */
    /* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */


    /**
     * GET /ajax/login/:user/databases - Return list of databases user has access to
     */
    static async getUserDatabases(ctx) {
        const [user] = await User.getBy('email', ctx.request.query.user); // lookup user

        ctx.body = { databases: user ? user.databases : [] };
        ctx.status = 200; // Ok
    }

}


/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

module.exports = LoginHandlers;

/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */
/* Password Reset handlers (invoked by router to render templates)                                */
/*                                                                                                */
/* All functions here either render or redirect, or throw.                                        */
/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

'use strict';

const nodemailer = require('nodemailer');   // sends e-mails from Node.js
const handlebars = require('handlebars');   // logicless templating language
const JsDom      = require('jsdom').JSDOM;  // DOM Document interface in Node!
const htmlToText = require('html-to-text'); // converts html to beautiful text
const fs         = require('mz/fs');        // 'modernised' node api
const crypto     = require('crypto');       // nodejs.org/api/crypto.html
const scrypt     = require('scrypt');       // scrypt library

const User = require('../models/user.js');

// nodemailer transporter
const smtpConfig = {
    host:   process.env.SMTP_HOST,
    port:   process.env.SMTP_PORT,
    secure: false,
    auth:   {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
    }
};
const transporter = nodemailer.createTransport(smtpConfig);

class PasswordResetHandlers {

    /**
     * GET /password/reset-request - render request password reset page
     */
    static async request(ctx) {
        await ctx.render('password-reset-request');
    }


    /**
     * POST /password/reset-request - process request password reset
     *
     * Send e-mail with password reset link
     */
    static async processRequest(ctx) {
        const email = ctx.request.body.email;

        const [user] = await User.getBy('email', email);

        // current timestamp for token expiry in base36
        const now = Math.floor(Date.now()/1000).toString(36);

        // random sha256 hash; 1st 8 chars of hash in base36 gives 42 bits of entropy
        const hash = crypto.createHash('sha256').update(Math.random().toString());
        const rndHash = parseInt(hash.digest('hex'), 16).toString(36).slice(0,8);
        const token = now+'-'+rndHash; // note use timestamp first so it is easier to identify old tokens in db

        // note: do createHash() before checking if user exists to mitigate against timing attacks
        if (!user) { ctx.redirect('/password/reset-request-confirm'); return; }

        // record reset request in db
        await User.update(user._id, { passwordResetRequest: token });

        // get password reset template, completed with generated token
        const templateHtml = await fs.readFile('app-admin/templates/password-reset.email.html', 'utf8');
        const templateHbs = handlebars.compile(templateHtml);
        const html = templateHbs({ firstname: user.firstname, host: ctx.host, token: token });

        // get e-mail subject from <title> element
        const htmlDom = new JsDom(html);
        const subject = htmlDom.window.document.querySelector('title').textContent;

        // prepare e-mail message
        const message = {
            from:    'noreply@thewhistle.org',
            to:      email,
            subject: subject,
            html:    html,
            text:    htmlToText.fromString(html),
        };

        // send out e-mail
        try {
            //const info = await transporter.verify();
            const info = await transporter.sendMail(message);
            console.log('info', info)
        } catch (e) {
            console.log('ERROR', e)
        }


        ctx.redirect('/password/reset-request-confirm');
    }


    /**
     * GET /password/reset-request-confirm - render request password reset confirmation page
     */
    static async requestConfirm(ctx) {
        await ctx.render('password-reset-request-confirm', { host: ctx.host });
    }


    /**
     * GET /password/reset/:token - render password reset page
     */
    static async reset(ctx) {
        const token = ctx.params.token;

        const [ timestamp, hash ] = token.split('-');

        // check token is not expired
        if (Date.now()/1000 - parseInt(timestamp, 36) > 60*60*24) {
            await ctx.render('password-reset', { expired: true });
            return;
        }

        // check token has been recorded
        const [user] = await User.getBy({ passwordResetRequest: token });

        if (!user) {
            await ctx.render('password-reset', { unrecognised: true });
            return;
        }

        await ctx.render('password-reset', { valid: true });
    }


    /**
     * POST /password/reset/:token - process password reset
     */
    static async processReset(ctx) {
        const token = ctx.params.token;

        const [ timestamp, hash ] = token.split('-');

        // check token is not expired
        if (Date.now()/1000 - parseInt(timestamp, 36) > 60*60*24) {
            ctx.redirect('/password/reset/'+token); // easy way to notify!
            return;
        }

        //
        const [user] = await User.getBy('passwordResetRequest', token);
        const password = await scrypt.kdf(ctx.request.body.password, await scrypt.params(0.5));
        await User.update(user._id, { password: password.toString('base64'), passwordResetRequest: null });

        ctx.redirect('/password/reset/confirm');
    }


    /**
     * GET /password/reset/confirm - render password reset confirmation page
     */
    static async resetConfirm(ctx) {
        await ctx.render('password-reset-confirm');
    }

}

/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

module.exports = PasswordResetHandlers;

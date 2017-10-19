/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */
/* Password Reset handlers (invoked by router to render templates).                C.Veness 2017  */
/*                                                                                                */
/* GET functions render template pages; POST functions process post requests then redirect.       */
/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

import nodemailer from 'nodemailer';   // sends e-mails from Node.js
import handlebars from 'handlebars';   // logicless templating language
import jsdom      from 'jsdom';        // DOM Document interface in Node!
import htmlToText from 'html-to-text'; // converts html to beautiful text
import fs         from 'fs-extra';     // fs with extra functions & promise interface
import crypto     from 'crypto';       // nodejs.org/api/crypto.html
import scrypt     from 'scrypt';       // scrypt library

import User from '../models/user.js';

// nodemailer transporter
const smtpConfig = {
    host:   process.env.SMTP_HOST,
    port:   process.env.SMTP_PORT,
    secure: false,
    auth:   {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
    },
};
const transporter = nodemailer.createTransport(smtpConfig);

/*
 * Password reset sequence is:
 * - GET  /password/reset-request
 * - POST /password/reset-request with email; 302 ->
 * - GET  /password/reset-request-confirm
 * - e-mail is sent to 'email' with reset link '/password/reset/{token}'
 * - GET  /password/reset/{token}
 * - POST /password/reset/{token} with password & passwordConfirm; 302 ->
 * - GET  /password/reset/confirm
 */

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

        const [ user ] = await User.getBy('email', email);

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
        const document = new jsdom.JSDOM(html).window.document;
        const subject = document.querySelector('title').textContent;

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
            //const info = await transporter.verify(); TODO: ??
            const info = await transporter.sendMail(message);
            console.info('processRequest: info', info);
        } catch (e) {
            console.error('ERROR', e);
        }

        ctx.set('X-Reset-Token', token); // for testing

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

        if (!await userForResetToken(token)) {
            await ctx.render('password-reset', { badToken: true });
            return;
        }

        await ctx.render('password-reset', { valid: true });
    }


    /**
     * POST /password/reset/:token - process password reset
     */
    static async processReset(ctx) {
        const token = ctx.params.token;

        // check token is good
        const user = await userForResetToken(token);
        if (!user) {
            ctx.redirect('/password/reset/'+token); // use existing notification mechanism!
            return;
        }

        // passwords match?
        if (ctx.request.body.password != ctx.request.body.passwordConfirm) {
            ctx.flash = { _error: 'Passwords don’t match' };
            ctx.redirect('/password/reset/'+token);
            return;
        }

        // set the password and clear the password reset token
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


/**
 * Return whether reset token is valid (requested and not expired), and if so returns user details.
 *
 * @param   {string} token - The reset token to be checked.
 * @returns {Object|boolean} User if token is valid, otherwise null.
 */
async function userForResetToken(token) {
    // a valid token contains a single hyphen
    if (token.split('-').length != 2) return null;

    // the token is a timestamp in base36 and a hash separated by a hyphen
    const [ timestamp, hash ] = token.split('-');

    // check token is not expired
    if (Date.now()/1000 - parseInt(timestamp, 36) > 60*60*24) return null;

    // check token has been recorded (and not used)
    const [ user ] = await User.getBy('passwordResetRequest', token);
    if (!user) return null;

    // all checks out!
    return user;
}

/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

export default PasswordResetHandlers;

/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */
/* Handlers for email verification test.                                           C.Veness 2017  */
/*                                                                                                */
/* GET functions render template pages; POST functions process post requests then redirect.       */
/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

import nodemailer from 'nodemailer';   // sends e-mails from Node.js
import handlebars from 'handlebars';   // logicless templating language
import jsdom      from 'jsdom';        // DOM Document interface in Node!
import htmlToText from 'html-to-text'; // converts html to beautiful text
import fs         from 'fs-extra';     // fs with extra functions & promise interface
import crypto     from 'crypto';       // nodejs.org/api/crypto.html
import dateFormat from 'dateformat';   // Steven Levithan's dateFormat()

import Report from '../models/report.js';

// nodemailer transporter config
const transporter = nodemailer.createTransport({
    host:             process.env.SMTP_HOST,
    secureConnection: false,
    port:             process.env.SMTP_PORT,
    requiresAuth:     true,
    secure:           false,
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
    }
});

class Email {

    /**
     * Process e-mail verification request: generate verification token & send e-mail to requester.
     */
    static async requestVerification(ctx) {

        // current timestamp for token expiry in base36
        const now = Math.floor(Date.now()/1000).toString(36);
        // 1st 8 chars of hash in base36 gives 42 bits of entropy
        const hash = crypto.createHash('sha256').update(ctx.request.body.email);
        const emailHash = parseInt(hash.digest('hex'), 16).toString(36).slice(0,8);
        const token = now+'-'+emailHash; // note use timestamp first so it is easier to identify old tokens in db

        // record email hash in db
        const emailAuth = global.db[ctx.params.database].collection('emailAuth');
        await emailAuth.insertOne({ token });

        // get e-mail template, completed with generated token
        const templateHtml = await fs.readFile('app-report/templates/email/verify.email.html', 'utf8');
        const templateHbs = handlebars.compile(templateHtml);
        const html = templateHbs({ host: ctx.host, token: token });

        // get e-mail subject from <title> element
        const document = new jsdom.JSDOM(html).window.document;
        const subject = document.querySelector('title').textContent;

        // prepare e-mail message
        const message = {
            from:    'chrisv@movable-type.co.uk',
            to:      ctx.request.body.email,
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

        await ctx.render('email/confirm');
    }

    /**
     * E-mail verification: if token is valid & fresh, record e-mail hash as verified.
     */
    static async verify(ctx) {
        const token = ctx.params.token;

        const [ hash, timestamp ] = token.split('-');

        // check token is not expired
        if (Date.now()/1000 - parseInt(timestamp, 36) > 60*60*24) {
            await ctx.render('email/unrecognised');
            return;
        }

        // check token has been recorded
        const emailAuth = global.db[ctx.params.database].collection('emailAuth');
        const auth = await emailAuth.findOne({ token });
        if (auth) {
            // check it hasn't already been used
            if (auth.verified) {
                await ctx.render('email/used', { verified: dateFormat(auth.verified, 'd mmm HH:MM') });
            } else {
                await emailAuth.updateOne({ token: token }, { $set: { verified: new Date() } });
                await ctx.render('email/recognised');
            }
            return;
        }

        await ctx.render('email/unrecognised');
    }

}


/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

export default Email;

/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */
/* Send out Whistle e-mail.                                                   C.Veness 2017-2018  */
/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

import nodemailer         from 'nodemailer';   // sends e-mails from Node.js
import handlebars         from 'handlebars';   // logicless templating language
import { JSDOM }          from 'jsdom';        // JavaScript implementation of DOM and HTML standards
import htmlToText         from 'html-to-text'; // converts html to beautiful text
import fs         from 'fs-extra';     // fs with extra functions & promise interface

import User from '../models/user';

class Mail {

    /**
     * Private getter to return SMTP transporter.
     */
    static get transporter() {
        const smtpConfig = {
            host:   process.env.SMTP_HOST,
            port:   process.env.SMTP_PORT,
            secure: process.env.SMTP_PORT == 465,
            auth:   {
                user: process.env.SMTP_USER,
                pass: process.env.SMTP_PASS,
            },
        };
        return nodemailer.createTransport(smtpConfig);
    }


    /**
     * Send e-mail using template.
     *
     * @param {string} to - E-mail recipient(s).
     * @param {string} template - Handlebars template for e-mail body.
     * @param {string} context - Context for mail-merge into template.
     * @param {Object} ctx - Koa ctx object.
     */
    static async send(to, template, context, ctx) {
        if (global.it) return; // don't send e-mails within mocha tests

        // get password reset template, completed with generated token
        const templateHtml = await fs.readFile(`app-admin/templates/${template}.html`, 'utf8');
        const templateHbs = handlebars.compile(templateHtml);
        const html = templateHbs(context);

        // get e-mail subject from <title> element
        const document = new JSDOM(html).window.document;
        const subject = document.querySelector('title').textContent;

        // prepare e-mail message
        const message = {
            to:      to,
            from:    'noreply@thewhistle.org',
            subject: subject,
            html:    html,
            text:    htmlToText.fromString(html),
        };

        // in dev/staging, send e-mail to logged-in user, with header indicating original recipient
        // (except for password reset request, where there is no logged-in user)
        if (ctx.app.env != 'production' && !ctx.state.user) { console.info(`Mail.send info: ${template} not sent to ${to} from dev env`); return; }
        if (ctx.app.env != 'production') {
            const currentUser = await User.get(ctx.state.user.id);
            Object.assign(message, { to: currentUser.email, headers: { 'X-Orig-To': to } });
        }

        // send out e-mail
        //const info = await transporter.verify(); TODO: ??
        const info = await Mail.transporter.sendMail(message);
        console.info('Mail.send info', 'accepted:', info.accepted, 'response:', info.response);
    }


    /**
     * Send e-mail with supplied html.
     *
     * @param {string} to - E-mail recipient(s).
     * @param {string} subject - E-mail subject line.
     * @param {string} html - HTML content for e-mail body.
     * @param {Object} ctx - Koa ctx object.
     */
    static async sendHtml(to, subject, html, ctx) {
        if (global.it) return; // don't send e-mails within mocha tests

        const message = {
            to:      to,
            from:    'noreply@thewhistle.org',
            subject: subject,
            html:    html,
            text:    htmlToText.fromString(html),
        };

        // in dev/staging, send e-mail to logged-in user, with header indicating original recipient
        if (ctx.app.env != 'production') {
            const currentUser = await User.get(ctx.state.user.id);
            Object.assign(message, { to: currentUser.email, headers: { 'X-Orig-To': to } });
        }

        // send out e-mail
        //const info = await transporter.verify(); TODO: ??
        const info = await Mail.transporter.sendMail(message);
        console.info('Mail.sendHtml info', info);
    }


    /**
     * Send e-mail with supplied (plain-) text.
     *
     * @param {string} to - E-mail recipient(s).
     * @param {string} subject - E-mail subject line.
     * @param {string} text - Text content for plain-text e-mail body.
     * @param {Object} ctx - Koa ctx object.
     */
    static async sendText(to, subject, text, ctx) {
        if (global.it) return; // don't send e-mails within mocha tests

        const message = {
            to:      to,
            from:    'noreply@thewhistle.org',
            subject: subject,
            text:    text,
        };

        // in dev/staging, send e-mail to logged-in user, with header indicating original recipient
        if (ctx.app.env != 'production') {
            const currentUser = await User.get(ctx.state.user.id);
            Object.assign(message, { to: currentUser.email, headers: { 'X-Orig-To': to } });
        }

        // send out e-mail
        //const info = await transporter.verify(); TODO: ??
        const info = await Mail.transporter.sendMail(message);
        console.info('Mail.sendText info', info);
    }
}

/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

export default Mail;

/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */
/* Messages handlers - manage direct SMS messaging functions.                                     */
/*                                                                                                */
/* GET functions render template pages; POST functions process post requests then redirect.       */
/*                                                                                                */
/* Ajax functions set body & status, and should not throw (as that would  invoke the generic      */
/* admin exception handler which would return an html page).                                      */
/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

'use strict';

const fetch          = require('node-fetch');            // window.fetch in node.js
const DOMParser      = require('xmldom').DOMParser;      // DOMParser in node.js
const libphonenumber = require('google-libphonenumber'); // wrapper for Google's libphonenumber

const phoneUtil         = libphonenumber.PhoneNumberUtil.getInstance();
const PhoneNumberFormat = libphonenumber.PhoneNumberFormat;

class MessagesHandlers {

    /**
     * GET /messages - render list-messages page.
     *
     * Results can be filtered with URL query strings eg /messages?from=7973559336. TODO!
     */
    static async list(ctx) {
        for (const msg of global.messages) {
            msg.timestampIso = msg.timestamp.toISOString().replace('T', ' ').replace(/\..+/, '');
            msg.dirn = msg.direction == 'incoming' ? '⇐' : '⇒';
            msg.fromEscaped = encodeURIComponent(msg.From.replace('+', '~'));
            msg.fromFormatted = phoneUtil.format(phoneUtil.parse(msg.From), PhoneNumberFormat.NATIONAL);
        }
        const latest = global.messages.reduce((prevVal, currVal) => Math.max(prevVal, currVal.timestamp), 0);
        const filtered = ctx.query.number ? true : false;
        const h1 = ctx.query.number ? ' with '+libphonenumber.national(ctx.query.number.replace('~', '+')) : '';
        await ctx.render('messages-list', { messages: global.messages, latest, filtered, h1 });
    }


    /**
     * GET /messages/:id - render view-message page
     */
    static async view(ctx) {
        // message details
        const message = await Message.get(ctx.params.id); // TODO: message model
        if (!message) ctx.throw(404, 'Message not found');

        await ctx.render('messages-view', message);
    }


    /**
     * GET /messages/:id/edit - render edit-message page
     */
    static async edit(ctx) {
        // message details
        const message = await Message.get(ctx.params.id); // TODO: message model
        if (!message) ctx.throw(404, 'Message not found');
        if (ctx.flash.formdata) Object.assign(message, ctx.flash.formdata); // failed validation? fill in previous values

        await ctx.render('messages-edit', message);
    }


    /**
     * GET /messages/:id/delete - render delete-message page
     */
    static async delete(ctx) {
        const message = await Message.get(ctx.params.id); // TODO: message model
        if (!message) ctx.throw(404, 'Message not found');

        const context = message;
        await ctx.render('messages-delete', context);
    }


    /* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */
    /* POST processing                                                                            */
    /* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */


    /**
     * POST /messages - process send-message
     */
    static async processSend(ctx) {

        try {
            const toNumber = ctx.query.number.replace('~', '+');

            // TODO: move to env vars
            const account = {
                number:    '+441702683045',
                sid:       'AC10a6741714ea8676530f510830b944ad',
                authToken: 'dac6e2d8e9a484c201908abf13f6b50b',
            };
            const auth = account.sid+':'+account.authToken+'@'; // passing auth credentials in headers doesn't work!
            const url = `https://${auth}api.twilio.com/2010-04-01/Accounts/${account.sid}/Messages`;
            const body = {
                To:   toNumber,
                From: account.number,
                Body: ctx.request.body.message,
            };
            const hdrs = {
                'Content-Type': 'application/x-www-form-urlencoded',
                //'Accept':        ctx.header.accept || '*/*',
                //'Authorization': 'Basic ' + new Buffer(account.sid+':'+account.authToken).toString('base64'), // doesn't work!
            };
            const params = Object.keys(body).map(k => `${encodeURIComponent(k)}=${encodeURIComponent(body[k])}`).join('&');

            const response = await fetch(url, { method: 'POST', body: params, headers: hdrs });

            const responseText = await response.text();
            const responseXml = new DOMParser().parseFromString(responseText, 'application/xml');

            const msg = {
                direction: 'outgoing',
                timestamp: new Date(),
                From:      toNumber,
                Body:      ctx.request.body.message,
            };
            global.messages.push(msg);

            // stay on same page, but with new message displayed
            ctx.redirect(ctx.url);

        } catch (e) {
            console.error(e);
            // stay on same page to report error (with current filled fields)
            ctx.flash = { formdata: ctx.request.body, _error: e.message };
            ctx.redirect(ctx.url);
        }
    }


    /**
     * POST /messages/:id/edit - process edit-message
     */
    static async processEdit(ctx) {
        if (!ctx.state.user.roles.includes('admin')) return ctx.redirect('/login'+ctx.url);

        // update message details
        if ('firstname' in ctx.request.body) {
            try {

                ctx.request.body.Active = ctx.request.body.Active ? true : false;

                await Message.update(ctx.params.id, ctx.request.body); // TODO: message model

                // return to list of messages
                ctx.redirect('/messages');

            } catch (e) {
                // stay on same page to report error (with current filled fields)
                ctx.flash = { formdata: ctx.request.body, _error: e.message };
                ctx.redirect(ctx.url);
            }
        }
    }


    /**
     * POST /messages/:id/delete - process delete message
     */
    static async processDelete(ctx) {
        if (!ctx.state.user.roles.includes('admin')) return ctx.redirect('/login'+ctx.url);

        try {

            await Message.delete(ctx.params.id); // TODO: message model

            // return to list of messages
            ctx.redirect('/messages');

        } catch (e) {
            // stay on same page to report error
            ctx.flash = { _error: e.message };
            ctx.redirect(ctx.url);
        }
    }


    /* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */
    /* Ajax functions                                                                             */
    /* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */


    /**
     * GET /ajax/messages/latest-timestamp - Timestamp of most recently received message (for ajax
     * call to automatically update messages list), as ISO timestamp.
     */
    static async ajaxMessageLatestTimestamp(ctx) {
        const latest = global.messages.reduce((prevVal, currVal) => Math.max(prevVal, currVal.timestamp), 0);
        ctx.status = 200;
        ctx.body = { latest: { timestamp: new Date(latest).valueOf() } };
        ctx.body.root = 'messages';
    }

}


/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

module.exports = MessagesHandlers;

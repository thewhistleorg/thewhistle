/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */
/* Messages handlers - manage direct SMS messaging functions.                 C.Veness 2017-2018  */
/*                                                                                                */
/* GET functions render template pages; POST functions process post requests then redirect.       */
/*                                                                                                */
/* Ajax functions set body & status, and should not throw (as that would  invoke the generic      */
/* admin exception handler which would return an html page).                                      */
/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

import { PhoneNumberUtil, PhoneNumberFormat } from 'google-libphonenumber'; // wrapper for Google's libphonenumber
import fetch                                  from 'node-fetch';            // window.fetch in node.js
import { DOMParser }                          from 'xmldom';                // DOMParser in node.js

const phoneUtil = PhoneNumberUtil.getInstance();

import Message from '../models/message.js';

class MessagesHandlers {

    /**
     * GET /messages - render list-messages page.
     *
     * Results can be filtered with URL query strings eg /messages?from=7973559336. TODO!
     */
    static async list(ctx) {
        const db = ctx.state.user.db;

        const messages = await Message.getAll(db);

        for (const msg of messages) {
            msg.timestampIso = msg.timestamp.toISOString().replace('T', ' ').replace(/\..+/, '');
            msg.dirn = msg.direction == 'incoming' ? '⇐' : '⇒';
            msg.fromEscaped = encodeURIComponent(msg.From.replace('+', '~'));
            msg.fromFormatted = phoneUtil.format(phoneUtil.parse(msg.From), PhoneNumberFormat.NATIONAL);
        }
        messages.sort((a, b) => a.timestamp < b.timestamp ? 1 : -1);
        const latest = messages.reduce((prevVal, currVal) => Math.max(prevVal, currVal.timestamp), 0);
        const filtered = ctx.query.number ? true : false;
        const number = ctx.query.number ? ctx.query.number.replace('~', '+') : '';
        const forNumber = number ? phoneUtil.format(phoneUtil.parse(number, 'GB'), PhoneNumberFormat.NATIONAL) : '';
        const h1 = number ? ' with '+forNumber : '';
        await ctx.render('messages-list', { messages: messages, latest, filtered, h1 });
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
            const exception = responseXml.getElementsByTagName('RestException');
            if (exception.length > 0) throw new Error(exception[0].childNodes[1].childNodes[0].data); // !!

            const msg = {
                direction: 'outgoing',
                timestamp: new Date(),
                From:      toNumber,
                Body:      ctx.request.body.message,
            };
            const insertId = await Message.insert('test-grn', msg);

            ctx.set('X-Insert-Id', insertId); // for testing

            // stay on same page, but with new message displayed
            ctx.redirect(ctx.url);

        } catch (e) {
            // stay on same page to report error (with current filled fields)
            ctx.flash = { formdata: ctx.request.body, _error: e.message };
            ctx.redirect(ctx.url);
        }
    }


    /**
     * POST /messages/:id/delete - process delete message
     */
    static async processDelete(ctx) {
        if (!ctx.state.user.roles.includes('admin')) return ctx.redirect('/login'+ctx.url);

        try {

            await Message.delete('test-grn', ctx.params.id);

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
        const db = ctx.state.user.db;

        const messages = await Message.getAll(db); // TODO: just get latest! (this is hangover code!)
        const latest = messages.reduce((prevVal, currVal) => Math.max(prevVal, currVal.timestamp), 0);

        ctx.status = 200;
        ctx.body = { latest: { timestamp: new Date(latest).valueOf() } };
        ctx.body.root = 'messages';
    }

}


/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

export default MessagesHandlers;

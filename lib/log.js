/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */
/* Log access and errors to MongoDB capped collection.                        C.Veness 2017-2018  */
/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

import useragent  from 'useragent'; // parse browser user agent string

import Mail from '../lib/mail.js';
import Db   from '../lib/db.js';


class Log {

    /**
     * Log an access to the log-access capped collection.
     *
     * @param {Object} ctx - Koa context (response status is expected to be in ctx.response.status).
     * @param {number} time - duration of the request.
     */
    static async access(ctx, time) {
        // don't log development environment (note: if testing of logging required, can check for referer=mocha)
        if (ctx.app.env == 'development') return;
        // don't log notifications/last-update requests (log would be overwhelmed by them!)
        if (ctx.request.url == '/ajax/notifications/last-update') return;

        const request = {
            env:      ctx.app.env,
            method:   ctx.request.method,
            host:     ctx.request.host,
            url:      ctx.request.url,
            ip:       ctx.request.ip,
            referrer: ctx.request.headers.referer,
            status:   ctx.response.status,
            ms:       Math.ceil(time),
        };

        const ua = useragent.parse(ctx.request.headers['user-agent']);
        request.ua = Object.assign({}, ua, { os: ua.os }); // trigger on-demand parsing of os

        if (ctx.state.user) {
            request.db = ctx.state.user.db;
            request.user = ctx.state.user.name;
        }
        if (ctx.request.host.split('.')[0] == 'report') {
            const path0 = ctx.request.url.split('/')[1];
            request.db = path0=='ajax' || path0=='spec' ? ctx.request.url.split('/')[2] : path0; // org comes after /ajax & /spec
        }
        if (ctx.response.header.location) {
            request.redir = ctx.response.header.location;
        }

        // logging uses capped collection log-access (size: 1000×1e3, max: 1000)
        const logCollection = await Db.collection('users', 'log-access');
        await logCollection.insertOne(request);
    }


    /**
     * Log an error to the log-error capped collection.
     *
     * For status 500 errors, Chris & Louis are notified by e-mail.
     *
     * @param {Object} ctx - Koa context (response status is expected to be in ctx.response.status).
     * @param {Object} err - the Error object.
     */
    static async error(ctx, err) {
        // don't log development environment (but display status 500 errors)
        if (ctx.app.env == 'development') { if (ctx.response.status==500) console.error(err); return; }

        // TODO: record/display err.message? [esp for pseudo-500 validation errors]

        const request = {
            env:    ctx.app.env,
            method: ctx.request.method,
            host:   ctx.request.host,
            url:    ctx.request.url,
            ip:     ctx.request.ip,
            status: ctx.response.status,
        };

        const ua = useragent.parse(ctx.request.headers['user-agent']);
        request.ua = Object.assign({}, ua, { os: ua.os }); // trigger on-demand parsing of os

        if (ctx.state.user) {
            request.db = ctx.state.user.db;
            request.user = ctx.state.user.name;
        }
        if (ctx.request.host.split('.')[0] == 'report') {
            const path0 = ctx.request.url.split('/')[1];
            request.db = path0=='ajax' || path0=='spec' ? ctx.request.url.split('/')[2] : path0; // org comes after /ajax & /spec
        }
        if (ctx.response.status==500) {
            request.stack = err.stack;
        }

        // logging uses capped collection log-error (size: 1000×4e3, max: 1000)
        const logCollection = await Db.collection('users', 'log-error');

        await logCollection.insertOne(request);

        // e-mail notification to Chris & Louis
        try {
            const to = 'cdv23@cam.ac.uk, lmcs2@cam.ac.uk';
            if (ctx.response.status==500) await Mail.sendText(to, 'The Whistle 500 error', err.stack);
        } catch (e) {
            console.error('log', e);
        }
    }
}


export default Log;

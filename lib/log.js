/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */
/* Log access and errors to MongoDB capped collection.                        C.Veness 2017-2018  */
/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

import useragent  from 'useragent'; // parse browser user agent string

import Mail from '../lib/mail.js';


class Log {

    /**
     * Log an access to the log-access capped collection.
     *
     * @param {Object} ctx - Koa context (response status is expected to be in ctx.status).
     * @param {number} time - duration of the request.
     */
    static async access(ctx, time) {
        // don't log development environment (note: if testing of logging required, can check for referer=mocha)
        if (ctx.app.env == 'development') return;
        // don't log notifications/last-update requests (log would be overwhelmed by them!)
        if (ctx.url == '/ajax/notifications/last-update') return;

        const request = {
            env:      ctx.app.env,
            method:   ctx.method,
            host:     ctx.host,
            url:      ctx.url,
            ip:       ctx.ip,
            referrer: ctx.headers.referer,
            status:   ctx.response.status,
            ms:       Math.ceil(time),
        };

        const ua = useragent.parse(ctx.headers['user-agent']);
        request.ua = Object.assign({}, ua, { os: ua.os }); // trigger on-demand parsing of os

        if (ctx.state.user) {
            request.db = ctx.state.user.db;
            request.user = ctx.state.user.name;
        }
        if (ctx.host.split('.')[0] == 'report') {
            const path0 = ctx.url.split('/')[1];
            request.db = path0=='ajax' || path0=='spec' ? ctx.url.split('/')[2] : path0; // org comes after /ajax & /spec
        }
        if (ctx.response.header.location) {
            request.redir = ctx.response.header.location;
        }

        // logging uses capped collection log-access (size: 1000×1e3, max: 1000)
        const logCollection = global.db.users.collection('log-access');
        await logCollection.insertOne(request);
    }


    /**
     * Log an error to the log-error capped collection.
     *
     * For status 500 errors, Chris is notified by e-mail.
     *
     * @param {Object} ctx - Koa context (response status is expected to be in ctx.status).
     * @param {Object} err - the Error object.
     */
    static async error(ctx, err) {
        // don't log development environment (but display status 500 errors)
        if (ctx.app.env == 'development') { if (ctx.status==500) console.error(err); return; }

        const request = {
            env:    ctx.app.env,
            method: ctx.method,
            host:   ctx.host,
            url:    ctx.url,
            ip:     ctx.ip,
            status: ctx.response.status,
        };

        const ua = useragent.parse(ctx.headers['user-agent']);
        request.ua = Object.assign({}, ua, { os: ua.os }); // trigger on-demand parsing of os

        if (ctx.state.user) {
            request.db = ctx.state.user.db;
            request.user = ctx.state.user.name;
        }
        if (ctx.host.split('.')[0] == 'report') {
            const path0 = ctx.url.split('/')[1];
            request.db = path0=='ajax' || path0=='spec' ? ctx.url.split('/')[2] : path0; // org comes after /ajax & /spec
        }
        if (ctx.status==500) {
            request.stack = err.stack;
        }

        // logging uses capped collection log-error (size: 1000×4e3, max: 1000)
        const logCollection = global.db.users.collection('log-error');

        await logCollection.insertOne(request);

        // e-mail notification
        try {
            if (ctx.status==500) await Mail.sendText('cdv23@cam.ac.uk', 'The Whistle 500 error', err.stack);
        } catch (e) {
            console.error('log', e);
        }
    }
}


export default Log;

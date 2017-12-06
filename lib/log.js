/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */
/* Log access and errors to MongoDB capped collection.                             C.Veness 2017  */
/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

import useragent  from 'useragent'; // parse browser user agent string

import Mail from '../lib/mail.js';


/**
 * Log an access or an error to the log-access or log-error capped collections.
 *
 * For status 500 errors, Chris is notified by e-mail.
 *
 * @param {Object} ctx - Koa context (response status is expected to be in ctx.status).
 * @param {string} type - 'access' or 'error'.
 * @param {number} t1 - for 'access', the start time of the request.
 * @param {number} t2 - for 'access', the end time of the request.
 * @param {Object} e - for 'error', the Error object.
 */
async function log(ctx, type, t1, t2, e) {
    // don't log development environment (note: if testing of logging required, can check for referer=mocha)
    if (ctx.app.env == 'development') return;


    const request = {
        env:     ctx.app.env,
        method:  ctx.method,
        host:    ctx.host,
        url:     ctx.url,
        ip:      ctx.ip,
        referer: ctx.headers.referer,
        status:  ctx.response.status,
    };

    const ua = useragent.parse(ctx.headers['user-agent']);
    request.ua = Object.assign({}, ua, { os: ua.os }); // trigger on-demand parsing of os

    if (ctx.state.user) {
        request.db = ctx.state.user.db;
        request.user = ctx.state.user.name;
    }
    if (ctx.response.header.location) {
        request.redir = ctx.response.header.location;
    }
    if (e && ctx.status==500) {
        request.stack = e.stack;
    }
    if (type == 'access') {
        request.ms = Math.ceil(t2-t1);
    }

    // logging uses capped collections log-access (size: 1000×1e3, max: 1000) & log-error (size: 1000×4e3, max: 1000)
    const logCollection = global.db.users.collection('log-'+type);

    await logCollection.insertOne(request);

    // e-mail notification
    if (ctx.state==500) await Mail.sendText('cdv23@cam.ac.uk', 'The Whistle 500 error', e.stack);
}

export default log;

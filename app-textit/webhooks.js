/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */
/* API handlers - TextIt webhooks.                                                 C.Veness 2017  */
/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

import chrono from 'chrono-node';


class Webhooks {

    static getIndex(ctx) {
        ctx.body = { message: 'This is The Whistle TextIt webhook API' };
        ctx.status = 200; // Ok
    }

    /**
     * @api {post} /parse/when Parse date/time
     * @apiName    GetParseWhen
     * @apiGroup   Parse
     *
     * @apiParam   ...

     * @apiSuccess (Success 2xx) 200/Created ...
     */
    static postParseWhen(ctx) {
        const when = ctx.request.method=='GET' ? chrono.parseDate(ctx.request.query.when) : chrono.parseDate(ctx.request.body.text);
        console.info('postParseWhen', ctx.request.body.text, chrono.parseDate(ctx.request.query.when), chrono.parse(ctx.request.query.when)[0]);
        ctx.body = { datetime: when };
        ctx.body.root = 'when';
        ctx.status = 200; // Ok
    }

}


/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

export default Webhooks;

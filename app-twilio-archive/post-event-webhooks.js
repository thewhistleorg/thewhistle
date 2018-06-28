/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */
/* API handlers - Twilio post webhooks.                                            C.Veness 2017  */
/*                                                                                                */
/* Twilio is configured to POST to e.g. twilio.thewhistle.org/message after it receives an SMS    */
/* message.                                                                                       */
/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

import Message from '../models/message.js';


class MessagesHandlers {

    /**
     * @api {post} /messages Create new message
     * @apiName    PostMessages
     * @apiGroup   Messages
     *
     * @apiParam   ...                       [as per get].
     * @apiHeader  Authorization             Basic Access Authentication token.
     * @apiHeader  [Accept=application/json] application/json, application/xml, text/yaml, text/plain.
     * @apiHeader  Content-Type              application/x-www-form-urlencoded.
     * @apiSuccess (Success 2xx) 201/Created Details of newly created message.
     * @apiError   401/Unauthorized          Invalid JWT auth credentials supplied.
     * @apiError   403/Forbidden             Admin auth required.
     */
    static async postMessages(ctx) {
        const db = 'grn-test'; // TODO: for now!

        const msgId = await Message.insert(db, Object.assign({ direction: 'incoming', timestamp: new Date() }, ctx.request.body));

        // TOOD: response should only be on 1st message of dialogue
        ctx.body = { Message: 'Thank you for your message; we will get back to you shortly' };
        ctx.body.root = 'Response';
        ctx.status = 200; // Ok
        ctx.set('X-Insert-Id', msgId);
    }

    static postFail(ctx) {
        console.error('postFail', ctx.request.body);
    }

}


/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

export default MessagesHandlers;

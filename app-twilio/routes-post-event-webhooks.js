/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */
/* Twilio post webhooks routes.                                                    C.Veness 2017  */
/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

import Router from 'koa-router'; // router middleware for koa
const router = new Router();

import webhooks from './post-event-webhooks.js';


router.post('/messages',                  webhooks.postMessages);       // record received SMS message
router.post('/fail',                      webhooks.postFail);           // record failure notification


/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

export default router.middleware();

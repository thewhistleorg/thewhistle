/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */
/* TextIt webhooks routes.                                                         C.Veness 2017  */
/*                                                                                                */
/*                                       © 2017 Cambridge University / The Whistle | MIT licence  */
/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

/* eslint space-in-parens: off */

import Router from 'koa-router'; // router middleware for koa
const router = new Router();

import webhooks from './webhooks.js';


router.get( '/',           webhooks.getIndex);
router.post('/parse/when', webhooks.postParseWhen);
router.get( '/parse/when', webhooks.postParseWhen); // for easier testing


/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

export default router.middleware();

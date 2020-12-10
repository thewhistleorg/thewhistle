/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */
/* Routing for ajax calls.                                                    C.Veness 2017-2018  */
/*                                                                                                */
/* This holds app-specific ajax calls (none specified in this sample app), and passes through     */
/* other generic requests to the API.                                                             */
/*                                                                                                */
/*                                  © 2017-2018 Cambridge University / The Whistle | MIT licence  */
/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

import Router from 'koa-router'; // router middleware for koa
const router = new Router();

import handlers from './ajax-handlers.js';


router.get('/ajax/:db/aliases/new',    handlers.getNewAlias); // note means 'new' cannot be used as a name
router.get('/ajax/:db/aliases/:alias', handlers.getAlias);    // currently just used to verify if name exists

router.get('/ajax/geocode',            handlers.geocode);     // geocode an address

router.get('/ajax/:db/:project/submitted-values', handlers.submittedValues); // previously submitted values for field


/*
 * Return 404 for anything unrecognised
 */
router.all(/\/ajax\/(.*)/, handlers.ajax404); // TODO!


/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

export default router.middleware();

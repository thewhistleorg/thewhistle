/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */
/* 'Publish' app routes.                                                           C.Veness 2018  */
/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

import Router from 'koa-router'; // router middleware for koa

const router = new Router();


import handlers from './handlers.js';

router.get('/', async function(ctx) { await ctx.render('index'); }); // home page

router.get('/metrics.html',                         handlers.getMetricsList); //
router.get('/supply.html',                          handlers.getSupplyList);  //
router.get('/metrics.json',                         handlers.getMetricsList); // TODO
router.get('/supply.json',                          handlers.getSupplyList);  // TODO

router.get('/:org/:project/wikirate/metrics/:year', handlers.getMetrics);     //
router.get('/:org/:project/wikirate/supply/:year',  handlers.getSupply);      //

/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

export default router.middleware();

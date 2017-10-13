/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */
/* Route to handle root element: return uri's for available resources & note on authentication.   */
/*                                                                                 C.Veness 2017  */
/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

'use strict';

const router = require('koa-router')(); // router middleware for koa


router.get('/', function getRoot(ctx) {
    // root element just returns uri's for principal resources (in preferred format)
    const resources = { messages: { _uri: '/messages' } };
    const info = 'The Whistle prototyping API';
    ctx.body = { info: info, resources: resources };
    ctx.body.root = 'api';
});


/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

module.exports = router.middleware();

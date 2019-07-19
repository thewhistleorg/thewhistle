/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */
/* Route to handle root element: return uri's for available resources & note on authentication.   */
/*                                                                                 C.Veness 2017  */
/*                                                                                                */
/*                                       © 2017 Cambridge University / The Whistle | MIT licence  */
/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

import Router from 'koa-router'; // router middleware for koa
const router = new Router();


router.get('/', function getRoot(ctx) {
    // root element just returns uri's for principal resources (in preferred format)
    const resources = { messages: { _uri: '/messages' } };
    const info = 'The Whistle prototyping API';
    ctx.body = { info: info, resources: resources };
    ctx.body.root = 'api';
});


/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

export default router.middleware();

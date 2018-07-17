/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */
/* Set up database connections for unit tests.                                C.Veness 2017-2018  */
/*                                                                                                */
/* Because of the way 'before' works, this is best defined once & require'd within each separate  */
/* test, rather than being defined within each one. It only gets invoked once on calling          */
/* 'mocha test/unit/*.js'!                                                                        */
/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

import Db from '../../lib/db.js';


before(async function() {
    this.timeout(10e3); // 10 sec
});

export default before;

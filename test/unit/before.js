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

    try {
        global.db = {};
        await Db.connect('users');
        await Db.connect('grn-test');
    } catch (e) {
        console.error(e.message);
        process.exit(1);
    }
});

export default before;

/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */
/* Set up database connections for unit tests.                                     C.Veness 2017  */
/*                                                                                                */
/* Because of the way 'before' works, this is best defined once & require'd within each separate  */
/* test, rather than being defined within each one. It only gets invoked once on calling          */
/* 'mocha test/unit/*.js'!                                                                        */
/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

'use strict';

const MongoClient = require('mongodb').MongoClient;

before(async function() {
    this.timeout(10e3); // 10 sec
    try {
        const userDb = await MongoClient.connect(process.env['DB_USERS']);
        const testDb = await MongoClient.connect(process.env['DB_TEST_CAM']);
        global.db = { users: userDb, 'test-cam': testDb };
    } catch (e) {
        console.error(e.message);
        process.exit(1);
    }
});

module.export = before;

/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */
/* Auto identifier unit tests                                                                     */
/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

'use strict';

const expect = require('chai').expect; // BDD/TDD assertion library

const autoIdentifier = require('../../lib/auto-identifier.js');

const test = it; // just an alias

describe('Auto identifier', function() {
    let id=null, id2=null;
    test('generate space-separated name-pair', function() {
        id = autoIdentifier();
        expect(id).to.be.a('string');
        expect(id).to.match(/[a-z]+ [a-z]+/);
    });
    test('distinct', function() {
        id2 = autoIdentifier();
        expect(id2).to.not.equal(id);
    });
});

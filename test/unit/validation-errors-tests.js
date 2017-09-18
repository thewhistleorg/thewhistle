/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */
/* ValidationErrors unit tests                                                                    */
/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

'use strict';

const expect = require('chai').expect; // BDD/TDD assertion library

const validationErrors = require('../../lib/validation-errors.js');

const test = it; // just an alias

const rules = {
    name:     'required',
    age:      'type=number required min=4 max=17',
    guardian: 'required minlength=6',
    reported: 'type=date required min=2001-01-01',
};

describe('Validation errors', function() {

    describe('example', function() {
        test('required', function() {
            const errors = validationErrors({}, rules);
            expect(errors).to.be.an('array');
            expect(errors).to.have.length(4); // one for each field
        });
        test('number type', function() {
            const body = { name: 'Adèle', age: 'nine', guardian: 'Rochester', reported: '2001-01-01' };
            const errors = validationErrors(body, rules);
            expect(errors).to.be.an('array');
            expect(errors).to.have.length(1);
            expect(errors[0]).to.equal('“age” must be a number');
        });
        test('min number', function() {
            const body = { name: 'Adèle', age: '1', guardian: 'Rochester', reported: '2001-01-01' };
            const errors = validationErrors(body, rules);
            expect(errors).to.be.an('array');
            expect(errors).to.have.length(1);
            expect(errors[0]).to.equal('“age” must have a minimum value of 4');
        });
        test('minlength', function() {
            const body = { name: 'Adèle', age: '9', guardian: '–', reported: '2001-01-01' };
            const errors = validationErrors(body, rules);
            expect(errors).to.be.an('array');
            expect(errors).to.have.length(1);
            expect(errors[0]).to.equal('“guardian” must have a minimum length of 6');
        });
        test('min date', function() {
            const body = { name: 'Adèle', age: '9', guardian: 'Rochester', reported: '1999-01-01' };
            const errors = validationErrors(body, rules);
            expect(errors).to.be.an('array');
            expect(errors).to.have.length(1);
            expect(errors[0]).to.equal('“reported” must have a minimum value of 2001-01-01');
        });

        // TODO: more tests!
    });

});

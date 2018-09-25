/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */
/* Form generator unit tests.                                                      C.Veness 2018  */
/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

import { expect } from 'chai';           // BDD/TDD assertion library
import fs         from 'fs-extra';       // fs with extra functions & promise interface
import handlebars from 'koa-handlebars'; // handlebars templating

import FormGenerator from '../../lib/form-generator.js';

const test = it; // just an alias

describe('Form generator', function() {
    // this.timeout(4e3); // 4 sec

    before(function() {
        // set up global.renderer for FormGenerator.build() (normally done in app-report.js)
        global.renderer = handlebars.Renderer();
    });

    describe('exists', function() {
        test('grn-test/rape-is-a-crime exists', async function() {
            expect(await FormGenerator.exists('grn-test', 'rape-is-a-crime')).to.be.true;
        });

        test('unknown project doesn’t exist', async function() {
            expect(await FormGenerator.exists('grn-test', 'no-such-project')).to.be.false;
        });
    });

    describe('parse spec', function() {
        test('build', async function() {
            const spec = await FormGenerator.spec('grn-test', 'rape-is-a-crime');
            expect(spec).to.be.an('object');
            expect(spec.pages.p1).to.be.an('array');
        });
    });

    describe('build', function() {
        test('build', async function() {
            await FormGenerator.build('grn-test', 'rape-is-a-crime');
            expect(await fs.exists('.generated-reports/grn-test/rape-is-a-crime-1.html')).to.be.true;
            // TODO: anything useful to test here?
        });
    });

    describe('built', function() {
        test('built', async function() {
            expect(await FormGenerator.built('grn-test', 'rape-is-a-crime')).to.be.true;
        });
    });

});

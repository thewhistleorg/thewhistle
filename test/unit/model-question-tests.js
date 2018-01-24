/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */
/* Question model unit tests.                                                      C.Veness 2018  */
/*                                                                                                */
/* Note these tests do not mock out database components, but operate on the live 'test-cam' db.   */
/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

import chai   from 'chai';   // BDD/TDD assertion library
import dotenv from 'dotenv'; // load environment variables from a .env file into process.env
const expect = chai.expect;

dotenv.config();

import Question from '../../models/question.js';

const db = 'test-cam';

import './before.js'; // set up database connections

describe(`Question model (${db})`, function() {

    let questionId = null;

    it('adds question', async function() {
        questionId = await Question.insert(db, 'test-project', '1a', 'A question I’m answering for myself', 'A question I’m answering for someone else');
        expect(questionId.constructor.name).to.equal('ObjectID');
    });

    it('sees question', async function() {
        const questions = await Question.get(db, 'test-project');
        const [ question ] = questions.filter(q => q._id.toString() == questionId);
        expect(question.project).to.equal('test-project');
        expect(question.questionNo).to.equal('1a');
        expect(question.self).to.equal('A question I’m answering for myself');
        expect(question.other).to.equal('A question I’m answering for someone else');
    });

    it('updates question', async function() {
        await Question.update(db, questionId, '99', 'A question for me', 'A question for someone else');
        const questions = await Question.get(db, 'test-project');
        const [ question ] = questions.filter(q => q._id.toString() == questionId);
        expect(question.project).to.equal('test-project');
        expect(question.questionNo).to.equal('99');
        expect(question.self).to.equal('A question for me');
        expect(question.other).to.equal('A question for someone else');
    });

    it('deletes question', async function() {
        questionId = await Question.delete(db, questionId);
    });

});

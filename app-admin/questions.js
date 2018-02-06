/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */
/* Questions handlers - manage adding, editing, deleting users who have access to the app.        */
/*                                                                                 C.Veness 2018  */
/*                                                                                                */
/* GET functions render template pages; POST functions process post requests then redirect.       */
/*                                                                                                */
/* Ajax functions set body & status, and should not throw (as that would  invoke the generic      */
/* admin exception handler which would return an html page).                                      */
/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

import glob from 'glob-promise'; // match files using the patterns the shell uses

import Question from '../models/question.js';
import log      from '../lib/log';


class QuestionsHandlers {

    /**
     * GET /questions - list of projects to serve as links to individual questions pages.
     */
    static async projects(ctx) {
        const projectFolders = await glob(`app-report/${ctx.state.user.db}/*`);

        const proj = projectFolders.map(p => ({
            project: p.replace(`app-report/${ctx.state.user.db}/`, ''),
            url:     p.replace(`app-report/${ctx.state.user.db}/`, '/questions/'),
        }));

        await ctx.render('questions-projects', { projects: proj });
    }


    /**
     * GET /questions/:project - Render report questions page for given project.
     */
    static async list(ctx) {
        const db = ctx.state.user.db;
        const project = ctx.params.project;

        const questions = await Question.get(db, project);

        await ctx.render('questions', { project, questions });
    }


    /* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */
    /* Ajax functions                                                                             */
    /* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */


    /**
     * POST /ajax/questions/:project - Add new question
     */
    static async ajaxPost(ctx) {
        const db = ctx.state.user.db;
        const project = ctx.params.project;
        const { question, self, other } = ctx.request.body;

        try {
            const id = await Question.insert(db, project, question, self, other);
            ctx.status = 201; // Created
            ctx.body = {};
            ctx.set('X-Insert-Id', id); // for integration tests
        } catch (e) {
            await log(ctx, 'error', null, null, e);
            ctx.status = 500; // Internal Server Error
            ctx.body = e;
        }
        ctx.body.root = 'questions';
    }


    /**
     * PUT /ajax/questions/:id - Update question
     */
    static async ajaxPut(ctx) {
        const db = ctx.state.user.db;
        const id = ctx.params.id;
        const { question, self, other } = ctx.request.body;

        try {
            await Question.update(db, id, question, self, other);
            ctx.status = 200; // Ok
            ctx.body = {};
        } catch (e) {
            await log(ctx, 'error', null, null, e);
            ctx.status = 500; // Internal Server Error
            ctx.body = e;
        }
        ctx.body.root = 'questions';
    }


    /**
     * DELETE /ajax/questions/:id - Delete question
     */
    static async ajaxDelete(ctx) {
        const db = ctx.state.user.db;
        const id = ctx.params.id;

        try {
            await Question.delete(db, id);
            ctx.status = 200;
            ctx.body = {};
        } catch (e) {
            await log(ctx, 'error', null, null, e);
            ctx.status = 500; // Internal Server Error
            ctx.body = e;
        }
        ctx.body.root = 'questions';
    }

}

/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

export default QuestionsHandlers;

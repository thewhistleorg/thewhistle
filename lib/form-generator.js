/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */
/* Form Generator - build forms from specs (including generated html, parsed spec, & internal     */
/* data structures for mapping html input names to descriptive names).                            */
/*                                                                                 C.Veness 2018  */
/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

import fetch        from 'node-fetch';             // window.fetch in node.js
import jsYaml       from 'js-yaml';                // YAML parser/writer for JavaScript
import $RefParser   from 'json-schema-ref-parser'; // parse, resolve, and dereference JSON Schema $ref pointers
import jsonSchema   from 'jsonschema';             // JSON schema validator
import dotProp      from 'dot-prop';               // get/set properties from nested objects using dot paths
import markdown     from 'markdown-it';            // markdown parser
import Debug        from 'debug';                  // small debugging utility
import util         from 'util';                   // nodejs.org/api/util.html
import process      from 'process';                // nodejs.org/api/process.html
import fs           from 'fs-extra';               // nodejs.org/api/fs.html
import globCallback from 'glob';                   // match files using the patterns the shell uses
import { JSDOM }    from 'jsdom';                  // JavaScript implementation of DOM and HTML standards

const glob = util.promisify(globCallback);

const debug  = Debug('app:forms'); // debug form build

const md = markdown({ html: true });

import FormSpecification from '../models/form-specification.js';


const title = {}; // title of each (built) form
const forms = {}; // internal structures for built forms


let schema = null;
let layout = null;

let allBuilt = false;


class FormGenerator {

    /**
     * Checks whether given reporting form exists.
     *
     * @param   {string} org - Organisation report is for.
     * @param   {string} project - Project (aka campaign).
     * @returns true if the form exists, false otherwise.
     */
    static async exists(org, project) {
        // if it's already built, we know it exists
        if (title[org] && title[org][project]) return true;

        // otherwise it exists if we've got a (valid) spec for it
        try {
            await FormGenerator.spec(org, project);
            return true;
        } catch (e) {
            return false;
        }
    }


    /**
     * Parses the org/project form specification, and return a JavaScript object from the JSON/YAML
     * spec. Any $ref references in the form spec will be processed.
     *
     * Evaluating a spec may fail for the following reasons:
     *  - no spec found for org/project (db/file/http)     - throws ReferenceError
     *  - spec is not a valid JSON Schema                  - throws SyntaxError
     *  - spec does not validate against the report schema - throws EvalError
     * 'instanceof' can be used to identify which case was the cause of an exception.
     *
     * @param   {string} org - Organisation report is for.
     * @param   {string} project - Project (aka campaign).
     * @returns {Object|null} The form specification as a JavaScript object, or null if not found.
     */
    static async spec(org, project) {
        debug('FormGenerator.spec', org, project);
        // first time a build is invoked, load the schema and the overall layout (better here than
        // slowing down app startup)
        if (!schema) schema = await $RefParser.dereference('lib/form-specification-schema.yaml');
        if (!layout) layout = await fs.readFile('app-report/templates/layout.html', 'utf8');

        // dereference the json/yaml - this processes all $ref pointers and returns a JavaScript object
        try {

            const resolver = FormGenerator.resolver(org, project);
            const spec = await $RefParser.dereference(`${org}/${project}`, { resolve: resolver });
            // validate the spec against the form schema (note: this is for file/http; db should already be validated)
            const valid = jsonSchema.validate(spec, schema);
            if (valid.errors.length > 0) throw new EvalError(`Form schema ${org}/${project} validation errors: ${valid.errors.join('; ')}`);

            return spec;

        } catch (e) {
            // not found?
            if (e instanceof ReferenceError) throw e; // not found: simply re-throw it
            // invalid JSON?
            if (/not a valid JSON Schema$/.test(e.message)) throw new SyntaxError(e.message); // TODO: check details for message
            // invalid schema?
            if (e instanceof EvalError) throw e; // re-throw it (e.message already set)
            // otherwise, re-throw it
            console.error('ERR FormGenerator.spec', org, project, e);
            throw e;
        }
    }


    /**
     * Validate a revision to a form spec. This is done before saving specs to the database, so that
     * saved specs are always valid.
     *
     * @param   {string} org - Organisation report is for.
     * @param   {string} project - Project (aka campaign).
     * @param   {string} pageToReplace - Updated page which is to be saved to database.
     * @param   {string} newSpec - Revised spec for updated page.
     * @returns true on successful validation.
     * @throws  YAMLException on invalid JSON/YAML.
     * @throws  EvalError on non-validating spec.
     */
    static async preValidate(org, project, pageToReplace, newSpec) {
        debug('FormGenerator.preValidate', org+'/'+project, 'p:'+pageToReplace, newSpec);

        if (!schema) schema = await $RefParser.dereference('lib/form-specification-schema.yaml');

        const specText = pageToReplace=='' ? newSpec : (await FormSpecification.getSpec(org, project, '')).specification;

        const specJson = jsYaml.safeLoad(specText);

        // do a limited de-referencing, to have the spec in a single text, but with the relevant
        // page replaced by newSpec

        for (const p in specJson.pages) {
            const ref = specJson.pages[p].$ref;
            if (ref == undefined) continue;     // inline definition rather than $ref e.g. [] placeholder
            if (ref.startsWith('#/')) continue; // it's already in the same document
            const page = ref; // in db specs with references to separate documents, the $ref is simply the page
            specJson.pages[p].$ref = `#/${project}|${page}`;
            if (page == pageToReplace) {
                // add new page-to-replace into the spec
                specJson[`${project}|${page}`] = jsYaml.safeLoad(newSpec);
            } else {
                // add the existing page into the overall spec
                const existingPageSpec = await FormSpecification.getSpec(org, project, page);
                const pageSpec = jsYaml.safeLoad(existingPageSpec.specification);
                specJson[`${project}|${page}`] = pageSpec;
            }
        }
        const specDereferenced = await $RefParser.dereference(specJson);
        const valid = jsonSchema.validate(specDereferenced, schema);

        if (valid.errors.length > 0) {
            // form specification add/edit pages use errpartialraw template to preserve message
            // formatting, so wrap errors in html
            const html = `
                <div class="error-msg">Form schema ${org}/${project} validation errors: 
                  <ul><li>${valid.errors.join('</li><li>')}</li></ul>
                </div>`;
            throw new EvalError(html);
        }
        return true;
    }


    /**
     * Returns resolvers to dereference YAML $ref references within form specs held in mongodb
     * collections, in local file system, or in remote http urls.
     *
     * With the facility to hold form specs in the database, there is probably little use for the
     * file or http resolvers, but there is no reason to remove them.
     *
     * @param   {string} org - Organisation report is for.
     * @param   {string} project - Project (aka campaign).
     * @returns {Object} The form specification as a JavaScript object.
     */
    static resolver(org, project) {

        const resolve = {
            db: {
                order:   1,
                canRead: true,
                read:    async function readDb(file) {
                    // for db, file.url is project/page prefixed by cwd(!)
                    const [ page ] =  file.url.split('/').slice(-1);
                    debug('resolver/db >', org, project, page);
                    const formSpecs = await FormSpecification.getBy(org, 'project', project);
                    // TODO: formSpec is array of all pages!
                    const [ formSpec ] = formSpecs.filter(spec => spec.page == (page==project ? '' : page));

                    if (formSpec) debug('resolver/db ✓', org, project, page);
                    if (formSpec) return formSpec.specification;

                    // not in the database
                    debug('resolver/db ✗', org, project, page);
                    throw new ReferenceError(`Specification ${org}/${project} not found`);
                },
            },
            file: {
                order:   2,
                canRead: true,
                read:    async function readFile(file) {
                    // if 'org' is the test version, convert it to canonical organisation name
                    // TODO: only if '-test' version doesn't exist in public/spec?
                    org = org.replace(/-test$/, '');
                    const page = file.url.replace('\\', '/').match(/([^/]+)\/*$/)[1]; // final element of file.url
                    const path = `${process.cwd()}/public/spec/${org}/${page}`;
                    debug('resolver/file >', org, project, path);
                    try { // file includes extension? (happens with referenced file)
                        const spec = await fs.readFile(`${path}`, 'utf8');
                        debug('resolver/file ✓', org, project, path);
                        return spec;
                    } catch (e) { /* carry on */ }
                    try { // top-level: local JSON file
                        const spec = await fs.readFile(`${path}.json`, 'utf8');
                        debug('resolver/file ✓', org, project, path);
                        return spec;
                    } catch (e) { /* carry on */ }
                    try { // top-level: local YAML file
                        const spec = await fs.readFile(`${path}.yaml`, 'utf8');
                        debug('resolver/file ✓', org, project, path);
                        return spec;
                    } catch (e) { /* carry on */ }

                    // nope, nothing here either
                    debug('resolver/file ✗', org, project, path);
                    throw new ReferenceError(`Specification ${org}/${path} not found`);
                },
            },
            http: {
                order:   3,
                canRead: true,
                read:    async function readHttp(file) {
                    // TODO: convert '-test' to canonical?
                    debug('resolver/http >', org, project, file.url);
                    // have we got an env var RPT_ORG_NAME specifying a remote location?
                    const location = process.env[`RPT_${org.toUpperCase().replace(/-/g, '_')}`];
                    if (!location) debug('resolver/http ✗', org, project, file.url);
                    if (!location) throw new ReferenceError(`Specification ${org}/${file.url} not found`); // nope!

                    // does it exist remotely? (in the location given by env var RPT_ORG_NAME)
                    const fullSpecUrl = `${location}/${org}/${project}`;
                    const jsonSpecUrl = `${location}/${org}/${project}.json`;
                    const yamlSpecUrl = `${location}/${org}/${project}.yaml`;
                    const fullSpec = await fetch(fullSpecUrl, { method: 'GET' });
                    if (fullSpec.ok) return await fullSpec.text();
                    const jsonSpec = await fetch(jsonSpecUrl, { method: 'GET' });
                    if (jsonSpec.ok) return await jsonSpec.text();
                    const yamlSpec = await fetch(yamlSpecUrl, { method: 'GET' });
                    if (yamlSpec.ok) return await yamlSpec.text();

                    // really nothing
                    debug('resolver/http ✗', org, project, file.url);
                    throw new ReferenceError(`Specification ${org}/${file.url} not found`);
                },
            },
        };

        return resolve;
    }


    /**
     * Build all form specifications. This is invoked (asynchronously) on app startup.
     */
    static async buildAll() {
        // get all available organisations from db connection string environment variables
        const organisations = Object.keys(process.env)
            .filter(env => env.slice(0, 3)=='DB_' && env!='DB_USERS')
            .map(db => db.slice(3).toLowerCase().replace(/_/g, '-'));

        // look for form specifications held in the database
        for (const org of organisations) {
            const formSpecs = await FormSpecification.getAll(org);
            // we may have spec divided into many pages, so use a set to get unique list of projects
            const projects = new Set(formSpecs.map(spec => spec.project));
            // build all projects for this organisation
            for (const project of projects) {
                try {
                    await FormGenerator.build(org, project);
                    console.info(`Form db:${org}/${project} built`);
                } catch (e) {
                    const msg = e instanceof ReferenceError ? 'Specification not found' : e.message;
                    console.error(`ERR building form spec ${org}/${project}:`, msg);
                }
            }
        }

        // look for form specifications held in the local filesystem, noting that '-test' org's
        // use the canonical organisation name for the form specs
        const canonicalOrgs = new Set(organisations.map(org => org.replace(/-test$/, '')));
        for (const org of canonicalOrgs) {
            for (const submitLists of await glob(`public/spec/${org}/submit-list.json`)) {
                const projects = JSON.parse(await fs.readFile(submitLists, 'utf8'));
                for (const project in projects) {
                    try {
                        await FormGenerator.build(org, project);
                        console.info(`Form fs:${org}/${project} built`);
                    } catch (e) {
                        const msg = e instanceof ReferenceError ? 'Specification not found' : e.message;
                        console.error(`ERR building form spec ${org}/${project}:`, msg);
                    }
                }
            }
        }

        allBuilt = true;
    }


    /**
     * Returns only after all form specs have been built.
     */
    static async waitForBuilds() {
        while (!allBuilt) {
            await sleep(10); // sleep 10ms and then check again
        }
    }


    /**
     * Checks whether given reporting form is already built.
     *
     * @param   {string} org - Organisation report is for.
     * @param   {string} project - Project (aka campaign).
     * @returns true if the form has been built, false otherwise.
     */
    static built(org, project) {
        // when a form is successfully built, it's recorded in FormGenerator.title
        if (title[org] && title[org][project]) return true;

        // otherwise it's not been built
        return false;
    }


    /**
     * Returns titles of built forms, for 'submit' menu (very simple, just avoids use of global).
     */
    static get title() {
        return title;
    }


    /**
     * Returns internal structures for built forms (very simple, just avoids use of global).
     */
    static get forms() {
        return forms;
    }


    static async getPartialInputNames(filename) {
        const names = new Set();
        const html = await fs.readFile(`app-report/templates/partials/${filename}.html`, 'utf8');
        const dom = new JSDOM(html);
        const document = dom.window.document;
        const inputs = document.querySelectorAll('input, textarea, select');
        for (let i = 0; i < inputs.length; i++) {
            if (!inputs[i].name.endsWith('-nostore')) {
                names.add(inputs[i].name);
            }
        }
        return Array.from(names);
    }

    static async getPartials(pageSpec) {
        const ret = {};
        for (let i = 0; i < pageSpec.length; i++) {
            if (pageSpec[i].partial) {
                ret[pageSpec[i].partial.name] = await FormGenerator.getPartialInputNames(pageSpec[i].partial.name);
            }
        }
        return ret;
    }


    static hasRecaptcha(index) {
        for (let i = 0; i < index.length; i++) {
            if (index[i].input) {
                if (index[i].input.type === 'recaptcha-button') {
                    return true;
                }
            }
        }
        return false;
    }


    /**
     * Generates HTML for specified incident submission report, and build internal structures for
     * processing submitted data into 'prettified' format to be recorded in the database.
     *
     * The generated HTML will be written to .generated-files/<org>/<project>; the internal data
     * structures are recorded in FormGenerator.forms.
     *
     * The form will be built even if it has already been built, in order that externally hosted
     * form specs can be updated without restarting the app.
     *
     * @param {string} org - Organisation report is for.
     * @param {string} project - Project (aka campaign).
     * @throws Errors from spec()
     */
    static async build(org, project) {
        debug('FormGenerator.build', org, project);
        const t1 = Date.now();

        // initialise FormGenerator.forms, where info about inputs, steps, & defaults is held
        forms[`${org}/${project}`] = { inputs: {}, steps: {}, defaults: {}, partials: {} };
        const spec = await FormGenerator.spec(org, project);

        let singlePageRpt = '';
        const flash = '{{> flash}}\n';
        const notworking = '{{> notworking}}';
        let finalNext = '';

        forms[`${org}/${project}`].recaptcha = FormGenerator.hasRecaptcha(spec.pages.index);

        for (const p in spec.pages) {
            debug('build ----------------------------------------------', p);

            const page = p.match(/^p[0-9]+$/) ? p.slice(1) : p; // strip initial 'p' from numeric pages

            forms[`${org}/${project}`].inputs[page] = {};

            const prev = dotProp.get(spec, `options.pages.${p}.prev`)==false ? '' : '{{> back}}\n';
            const step = dotProp.get(spec, `options.pages.${p}.step`)==false ? '' : '{{> step}}\n';
            const nextText = dotProp.get(spec, `options.pages.${p}.next`) || 'Submit and continue';
            const next = dotProp.get(spec, `options.pages.${p}.next`)==false ? '' : `{{> continue text='${nextText}' accesskey='c' }}\n`;
            if (dotProp.get(spec, `options.pages.${p}.next`)) finalNext = next; // kludgy way to pick up final page 'next' button!

            const bodyHtml = FormGenerator.transformBody(org, project, page, spec.pages[p], null);
            const formMethod = dotProp.get(spec, `options.pages.${p}.method`) || 'post';
            const formEnctype = dotProp.get(spec, `options.pages.${p}.enctype`) || 'application/x-www-form-urlencoded';
            const pageTitle = dotProp.get(spec, `options.pages.${p}.title`) || dotProp.get(spec, 'title') || 'The Whistle Incident Report';

            const html = layout
                .replace(/{{page-title}}/g, pageTitle)
                .replace('{{{@body}}}', prev + step + flash + bodyHtml + next + notworking)
                .replace('{{form-method}}', formMethod)
                .replace('{{form-enctype}}', formEnctype);

            try {
                await fs.writeFile(`.generated-reports/${org}/${project}-${page}.html`, html);
            } catch (e) {
                switch (e.code) {
                    case 'ENOENT': // presumably directory does not exist
                        await fs.mkdir(`.generated-reports/${org}`);
                        await fs.writeFile(`.generated-reports/${org}/${project}-${page}.html`, html);
                        break;
                    default: // ??
                        throw e;
                }
            }
            await global.renderer.compileTemplate(`${process.cwd()}/.generated-reports/${org}/${project}-${page}.html`);

            if (!isNaN(page)) singlePageRpt += bodyHtml;

            if (dotProp.get(spec, `options.pages.${p}.step`) != false) forms[`${org}/${project}`].steps[page] = { page: page };

            forms[`${org}/${project}`].partials[page] = await FormGenerator.getPartials(spec.pages[p]);

        }

        // note for single page report, in principle we could use yaml options.pages['*'] to
        // manage back, step, flash,  next: would that be worthwhile, or can we just use these
        // fixed options?
        const singlePageHtml = layout
            .replace(/{{page-title}}/g, dotProp.get(spec, 'title') || 'The Whistle Incident Report')
            .replace('{{{@body}}}', flash + singlePageRpt + finalNext + notworking)
            .replace('{{form-method}}', 'post')
            .replace('{{form-enctype}}', 'multipart/form-data');
        await fs.writeFile(`.generated-reports/${org}/${project}-+.html`, singlePageHtml);
        await global.renderer.compileTemplate(`${process.cwd()}/.generated-reports/${org}/${project}-+.html`);

        if (!title[org]) title[org] = {};
        title[org][project] = spec.title;

        const t2 = Date.now();
        debug('build ----------------------------------------------', org, project);
        debug('forms', util.inspect(forms[`${org}/${project}`], { depth: null, colors: true }));
        debug('build ==============================================', Math.ceil(t2-t1)+'ms');
    }


    /**
     * Returns the given text, with any instance of '!{x}{y}' (where x and y are strings)
     * replaced with HTML which displays x as normal text and y as a tooltip, which
     * displays when the user hovers over x.
     *
     * @param {String} text - Text to go into HTML that has been generated using markdown
     *
     * @returns {String} - The given text, with tooltips appropriately inserted.
     */
    static addTooltips(text) {
        return text.replace(/!{[\s\S]*}{[\s\S]*}/gi, function (match) {
            const midPosition = match.indexOf('}');
            const mainText = match.substring(2, midPosition);
            const tooltipText = match.substring(midPosition + 2, match.length - 1);
            return `<span style="cursor:default; border-bottom: 1px dotted #000;" data-tippy="${tooltipText}">${mainText}<sup>i</sup></span>`;
        });
    }


    /**
     * Transforms the JSON (/YAML) form spec for given page into HTML.
     *
     * @param   {string} org - Organisation report is for.
     * @param   {string} project - Project (aka campaign).
     * @param   {string} page - Page number (or name).
     * @param   {string} json - The JSON specification to be transformed
     * @param   {Object|null} parent - for recursive call to handle subsidiary inputs, the parent input.
     * @returns {string} HTML for this report page (or subsidiary section).
     */
    static transformBody(org, project, page, json, parent) {
        let html = '';
        const topLevel = !parent;

        for (const item of json) {
            // the spec is an array of objects which each have a single property, so the item type
            // is the key of the first property
            const itemType = Object.keys(item)[0];
            switch (itemType) {
                case 'text':
                    if (typeof item[itemType] == 'object') {
                        // object containing wrap/class/text items, and/or alternative texts:
                        // separate out wrap/class/text from alternate texts
                        const { wrap, class:cssClass, text, ...alternateTexts } = item[itemType];
                        if (Object.keys(alternateTexts).length == 0) {
                            // regular 'text' object with simple 'text' attribute (no alternate texts)
                            html += `<${wrap||'p'} class="${cssClass?cssClass+' ':''}">${text}</${wrap||'p'}>\n`;
                        } else {
                            // parameterised option texts: assume any one 'text' will depend on only one variable!
                            const keys = Object.keys(alternateTexts).map(v => v.split(':')[0]);
                            const [ key ] = [ ...new Set(keys) ];
                            const vals = Object.keys(alternateTexts).map(v => v.split(':')[1]);
                            const texts = Object.values(alternateTexts);
                            for (let i=0; i<vals.length; i++) {
                                // a handlebars helper sets 'show'/'hide' classes according to previously entered information
                                const classAttr = `class="${cssClass?cssClass+' ':''}{{show ${key} '${vals[i]}'}}"`;
                                // the data- attribute is used to show/hide alternate texts on same page as determining question
                                const dataAttr = `data-${key}="${vals[i]}"`;
                                // the html is either a <p>, or else an element determined by the 'wrap' option
                                html += `<${wrap||'p'} ${classAttr} ${dataAttr}>${texts[i]}</${wrap||'p'}>\n`;
                            }
                        }
                        break;
                    } else {
                        // plain text item
                        html += FormGenerator.addTooltips(md.render(item[itemType]) + '\n');
                    }
                    break;
                case 'html':
                    html += item[itemType];
                    break;
                case 'input':
                    const input = item[itemType];
                    if (input['no-store']) input.name += '-nostore';
                    // invoke the 'transformInput' function to handle the input: top-level inputs
                    // other than buttons get wrapped in <ul> elements
                    if (topLevel && !input.type.endsWith('button')) html += `<ul class="question-${input.name}">\n`;
                    html += FormGenerator.transformInput(org, project, page, input, parent);
                    if (topLevel && !input.type.endsWith('button')) html += '</ul>\n';
                    break;
                case 'partial':
                    html += `{{> ${item[itemType].name}}}`;
            }
        }
        //Links shouldn't open in the same window
        html = html.replace(new RegExp('<a ', 'g'), '<a target="_blank" ');
        return html;
    }

    static transformSubsidiary(org, project, page, subsidiary, input, name) {
        const [ option ] = subsidiary.filter(s => s.option); // we should only have one 'option' property!
        const hide = option && option.option=='show' ? '' : ' hide'; // TODO: handle multiple options
        const [ cssClass ] = subsidiary.filter(s => s.class);
        let ret = `<div class="subsidiary ${cssClass && cssClass.class ? cssClass.class : ''}${hide} ${name.replace(new RegExp(' ', 'g'), '_')}-subsidiary">\n`;
        ret += FormGenerator.transformBody(org, project, page, subsidiary, input);
        ret += '</div>\n';
        return ret;
    }

    /**
     * Processes information from the form specification, returning HTML for a specified branch
     *
     * @param {string}      org     - Form organisation
     * @param {string}      project - Form project
     * @param {string}      page    - Current page name or number
     * @param {Object}      input   - Parent input object
     * @param {Object|null} parent  - for recursive call to handle subsidiary inputs, the parent input.
     * @param {Object}      attrs   - Input attributes
     * @param {boolean}     inBox   - True if the branch is shown directly under the radio button or checkbox.
     *                                False if the branch is shown after all linked radio buttons and checkboxes.
     * @param {string}      key     - Input value
     *
     * @returns {string} - HTML for the branch being processed
     */
    static transformBranch(org, project, page, input, parent, attrs, inBox, key) {
        //Can't have spaces in the key, since it is used in a class name
        const inputVal = key.replace(new RegExp(' ', 'g'), '_');
        let classList = attrs.name + '-' + inputVal + '-branch';
        if (!(input.attributes && input.attributes.split(' ').contains('checked'))) {
            //Branch is hidden unless input is checked by default
            classList += ' hide';
        }

        let ret = inBox ? `<div class="${classList}">\n` : `</ul><ul class="${classList}">\n`;

        ret += FormGenerator.transformBody(org, project, page, input.branch.body, parent) + '\n';

        if (inBox) {
            ret += '</div>';
        }

        return ret;
    }




    /**
     * Transforms the JSON (/YAML) form spec for given input into HTML, and record details (in
     * FormGenerator.forms) for processing the input submitted data into 'prettified' format to be
     * recorded in the database.
     *
     * @param   {string} org - Organisation report is for.
     * @param   {string} project - Project (aka campaign).
     * @param   {string} page - Page number (or name).
     * @param   {Object} input - The input to be transformed.
     * @param   {Object|null} parent - for recursive call to handle subsidiary inputs, the parent -
     *   for radio/checkboxes, this will be hierarchically above the current input, for select
     *   inputs, it will be adjacent to the input.
     * @returns {string}
     */
    static transformInput(org, project, page, input, parent) {
        const rptPage = forms[`${org}/${project}`].inputs[page];
        let html = '';

        const topLevel = !parent;
        const fullName = parent ? `${parent.name}-${input.name}` : `${input.name}`;
        const subsidiaryOfSelect = !topLevel && parent.type=='select';
        // note for radio/checkboxes, the subsidiary input name is dependent on the selected option;
        // for selects, the subsidiary input name is constant

        // get relevant label for radio/checkbox input, or for select

        // ... convert top level 'options' nodeList to array so that we can filter it (nodeLists
        // don't have a filter() method)
        const topLevelOptions = topLevel ? [] : [ ...Object.values(parent.options) ];
        // note for radio/checkboxes, parent.options is the array of objects from form spec
        // representing each option; for selects, it is a simple array of labels (= submitted values)

        // ... filter top level options to just parent of this input (no-op for select)
        const [ parentOption ] = topLevelOptions.filter(option  => {
            return option && option.subsidiary
                && option.subsidiary.filter(el => el.input && el.input.name == input.name).length>0;
        });
        // ... parentOption is an object containing the label and the subsidiary, inter alia
        const parentOptionLabelRadioCheckbox = topLevel||subsidiaryOfSelect ? '' : parentOption.label;
        const parentOptionLabelSelect = topLevel ? '' :  parent.label;
        const parentOptionLabel = subsidiaryOfSelect ? parentOptionLabelSelect : parentOptionLabelRadioCheckbox;
        switch (input.type) {
            case 'text':
            case 'number':
            case 'tel':
            case 'url':
            case 'email':
            case 'hidden':
            case 'textbox':
                // set FormGenerator.forms mapping
                if (topLevel) {
                    rptPage[input.name] = { label: input.label || input.placeholder || '' };
                } else {
                    if (subsidiaryOfSelect) {
                        const options = {};
                        for (const [ , val ] of Object.entries(parent.options)) {
                            options[val.label] = fullName;
                        }
                        rptPage[parent.name].subsidiary = options;
                    } else { // radio/checkbox
                        if (!rptPage[parent.name].subsidiary) rptPage[parent.name].subsidiary = {};
                        rptPage[parent.name].subsidiary[parentOptionLabel] = fullName;
                    }
                }
                // output html
                if (input.type == 'textbox') {
                    if (topLevel) html += '<li>\n';
                    if (input.label) html += `<label for="${fullName}">${input.label}</label>`;
                    html += `<textarea name="${fullName}" id="${fullName}" ${input.required ? 'required' : ''} class="pure-input-1">{{${fullName}}}</textarea>\n`;
                    if (topLevel) html += '</li>\n';
                } else { // text, number, tel, url, email, hidden
                    if (input.label) html += `<label for="${fullName}">${input.label}</label>`;
                    html += `<input type="${input.type}" name="${fullName}" id="${fullName}" value="{{${fullName}}}" placeholder="${input.placeholder||''}" ${input.required ? 'required' : ''} class="${input.class||'pure-input-1'}">\n`;
                }
                break;
            case 'radio':
            case 'checkbox':
                if (!input.options) throw new Error(`page ‘${page}’ – ${input.name} has no options`); // not checked for by schema
                // set FormGenerator.forms mapping
                rptPage[input.name] = Object.assign(rptPage[input.name] || {}, { label: input.label }); // TODO TODO: p7 don't zap previous radio button entry!
                // output html
                html += `{{#checked ${input.name}}}\n`;
                for (const [ key, val ] of Object.entries(input.options)) {
                    // key gets concatenated with input.name to make the input id; val is the option object
                    const label = typeof val == 'string' ? val : val.label;
                    const attrs = {
                        type:  input.type,
                        name:  input.name,
                        id:    `${input.name}-${key}`,
                        value: label, // TODO: value key or label?
                    };
                    if (input.attributes) { // eg ??
                        for (const attr of input.attributes.split(' ')) {
                            const [ v, k ] = attr.split('=');
                            attrs[v] = k || 'true';
                        }
                    }
                    if (val.attributes) {   // eg used-before:n=checked, on-behalf-of:self=checked
                        for (const attr of val.attributes.split(' ')) {
                            const [ v, k ] = attr.split('=');
                            attrs[v] = k || 'true';
                            if (attr == 'checked') {
                                // record initially checked options to enable alternate texts to work
                                // on same page as input determining alternate text selection
                                forms[`${org}/${project}`].defaults[input.name] = val.label;
                            }
                        }
                    }
                    const attributes = [ ...Object.entries(attrs) ].map(([ attrKey, attrVal ]) => `${attrKey}="${attrVal}"`);

                    html += '<li>\n';
                    html += `  <input ${attributes.join(' ')} ${input.required ? 'required' : ''}>\n`;
                    html += `  <label for="${input.name}-${key}">${md.render(label)}</label>\n`;

                    // does this input have a subsidiary div for supplementary information?
                    if (val.subsidiary) {
                        html += FormGenerator.transformSubsidiary(org, project, page, val.subsidiary, input, val.label);
                    }
                    if (val.branch) {
                        if (val.branch['in-box']) {
                            html += FormGenerator.transformBranch(org, project, page, val, parent, attrs, true, key) + '</li>\n';
                        } else {
                            html += '</li>\n' + FormGenerator.transformBranch(org, project, page, val, parent, attrs, false, key);
                        }
                    } else {
                        html += '</li>\n';
                    }
                }
                html += '{{/checked}}\n';
                break;
            case 'select':
                // set FormGenerator.forms mapping
                if (topLevel) {
                    rptPage[input.name] = { label: input.label!=undefined ? input.label : parent.label };
                } else {
                    if (!rptPage[parent.name].subsidiary) rptPage[parent.name].subsidiary = {};
                    rptPage[parent.name].subsidiary[parentOptionLabel] = fullName;
                }
                // output html
                if (topLevel) html += '<li>\n';
                html += `  <select name="${fullName}" id="${fullName}">\n`;
                html += `  {{#selected ${fullName}}}\n`;
                let optionSubsidiaries = '';
                for (const [ , val ] of Object.entries(input.options)) {
                    html += `    <option>${val.label==null?'':val.label}</option>\n`;
                    if (val.subsidiary) {
                        optionSubsidiaries += FormGenerator.transformSubsidiary(org, project, page, val.subsidiary, input, val.label);
                    }
                }
                html += '  {{/selected}}\n';
                html += '  </select>\n';
                html += optionSubsidiaries;
                // does this input have a subsidiary div for supplementary information?
                if (input.subsidiary) {
                    html += FormGenerator.transformSubsidiary(org, project, page, input.subsidiary, input, 'select-any');
                }
                if (topLevel) html += '</li>\n';
                break;
            case 'recaptcha-button':
                input.class += ' g-recaptcha';
                const sitekey = process.env.RECAPTCHA_SITE_KEY;
                if (!sitekey) throw new Error('No environment variable found for ReCAPTCHA site key');
                html += `<button type="submit" name="${input.name||''}" value="${input.value||''}" accesskey="${input.accesskey||''}" class="${input.class||''}"`;
                html += ` data-sitekey="${sitekey}"`;
                html += ' data-callback="reCaptchaSubmitCallback"';
                html += '>\n';
                html += `${input.text}\n`;
                html += '</button>\n';
                break;
            case 'button':
                html += `<button type="button" name="${input.name||''}" value="${input.value||''}" accesskey="${input.accesskey||''}" class="${input.class||''}"`;
                if (input.data) {
                    for (const [ key, val ] of Object.entries(input.data)) html += ` data-${key}="${val}"`;
                }
                html += '>\n';
                html += `${input.text}\n`;
                html += '</button>\n';
                break;
                // note if we should ever require a submit button besides the standard 'submit & continue',
                // then it should be by means of a 'submit' element which generates <button type="submit">
            case 'pdf-button':
                // generate a button wrapped in an <a> which will download a PDF summary; handlebars will drop in the report id
                html += `<a href="/${org}/${project}/pdf/{{@koa.session.sessionId}}"><button type="button">Download</button></a>`;
                break;
            case 'library-date':
                html += htmlLibraryDate; // TODO: ${input.name} [date]
                break;
            case 'library-24hours':
                html += htmlLibrary24hours; // TODO: ${input.name} [date]
                break;
            case 'library-file':
                html += '<li>\n';
                if (input.label) html += `<label for="${fullName}">${md.render(input.label)}</label>`;
                html += htmlLibraryFile; // TODO: ${input.name} [documents]
                html += '</li>\n';
                break;
        }

        debug(`input${topLevel?' ':'>'}`, fullName, `<${input.type}>`, topLevel?input.label:parentOptionLabel+'(...)');
        return html;
    }

}


/*
 * Template HTML for library-date
 */
const htmlLibraryDate = `
    <table class="inline">
        <tr class="field-label">
            <td>DD</td>
            <td>MMM</td>
            <td>YYYY</td>
        </tr>
        <tr>
            <td>
                <select name="date.day" id="date.day" class="w4">
                    {{#selected date.day}}
                    {{#incidentDate.days}}
                    <option value="{{this}}">{{this}}</option>
                    {{/incidentDate.days}}
                    {{/selected}}
                </select>
            </td>
            <td>
                <select name="date.month" id="date.month" class="w5">
                    {{#selected date.month}}
                    {{#incidentDate.months}}
                    <option value="{{this}}">{{this}}</option>
                    {{/incidentDate.months}}
                    {{/selected}}
                </select>
            </td>
            <td>
                <select name="date.year" id="date.year" class="w6">
                    {{#selected date.year}}
                    {{#incidentDate.years}}
                    <option value="{{this}}">{{this}}</option>
                    {{/incidentDate.years}}
                    {{/selected}}
                </select>
            </td>
        </tr>
    </table>
`;


/*
 * Template HTML for library-24hours
 */
const htmlLibrary24hours = `
    <select name="date.time" id="date.time">
        <option></option>
        {{#selected date.time}}
        {{#incidentDate.hours}}
        <option value="{{this}}">{{this}}</option>
        {{/incidentDate.hours}}
        {{/selected}}
    </select>
`;


/*
 * Template HTML for library-file
 */
const htmlLibraryFile = `
    <input type="file" name="documents" id="document0" value="0" class="upload-file" multiple>
`;


/**
 * Sleeps for ms milliseconds.
 *
 * @param {number} ms - Number of milliseconds to sleep before returning.
 *
 * @example
 *   await sleep(100);
 */
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}


/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

export default FormGenerator;

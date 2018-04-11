*sexual-assault* / *rape-is-a-crime* form wizard
================================================

The final aim is to have an interactive tool for designing forms, along the lines of 
[Typeform](https://www.typeform.com/) or [textit](https://textit.in/).

The architecture would probably be that the interactive tool would generate an intermediate format
form specification, probably in JSON. This specification would then be processed to generate html 
pages.

The first stage of this would be to design the form specification, and build tools to transform form
specifications to html. This could be used by relatively non-technical people to specify forms 
(perhaps using YAML for legibility); it could be validated according to 
[json schema](http://json-schema.org), and the transform process would mean the resulting forms 
would be fairly robust (JavaScript would be fixed and well tested, and HTML would be templated 
hence little possibility for malformed HTML).

Once that transformation tool is functional, work could be put into the interactive tool – though 
that would be a much larger project.

In addition to HTML generation, if projects are to be updated (e.g. moving questions from one page 
to another), then if CSV export is to include questions, data migration tools would have to be 
developed so that already submitted reports would conform to the same structure as new reports.

The challenge
-------------

The existing [rape-is-a-crime](https://report.thewhistle.org/grn/rape-is-a-crime) report is quite 
sophisticated.

The YAML form spec would for instance have to encapsulate subsidiary questions, which are 
dynamically displayed and hidden as options are selected.

In addition to the complexity of the HTML, there is a considerable amount of front-end JavaScript 
for the rape-is-a-crime report which is highly tailored to that report (some 300 lines of code in 
[report.js](../../public/js/report/report.js)).

Some mechanism will be required for the dynamic ‘myself / someone else’ texts.

It might also be desirable to encapsulate the mapping between HTML input field names and the 
descriptive names which are displayed on the report details page (the use of descriptive names in 
the HTML might be technically possible but may not be desirable).

Ultimately, we should consider how control flow could be incorporated – but it would probably be 
necessary to implement it before trying to work out how to specify such an implementation.

Initial trials
--------------

These are possible YAML specs for the rape-is-a-crime form.

The basic approach is that each page comprises a sequence of (markdown) `text` elements, and `input` 
elements. The `input` elements may have subsidiary parts which will be conditionally displayed below
the input element. The `text` elements may be an object with alternative wordings for e.g. reporting 
on behalf of ‘self’ / ‘other’.

- [sexual-assault-0](sexual-assault-0.yaml) (intro)
- [sexual-assault-1](sexual-assault-1.yaml) (used-before)
- [sexual-assault-2](sexual-assault-2.yaml) (on-behalf-of / survivor-gender/age)
- [sexual-assault-3](sexual-assault-3.yaml) (when / still-happening)
- [sexual-assault-4](sexual-assault-4.yaml) (where)
- [sexual-assault-5](sexual-assault-5.yaml) (who)
- [sexual-assault-6](sexual-assault-6.yaml) (description)
- [sexual-assault-7](sexual-assault-7.yaml) (action-taken)
- [sexual-assault-8](sexual-assault-8.yaml) (extra-notes)

If we preferred to have the full form in a single file, YAML allows multiple documents in a single
file by separating them with `---` lines (comments could indicate which page each document is).

Note that once we have a build step to transform JSON form specs to HTML, the generated HTML won’t
be included in the git repository, but will be generated as an `npm` `postinstall` hook.

Detailed questions
------------------

### 1: used-before

- Y: how to represent the ✓ / ✗ which is displayed (using ajax) to indicate if an alias is available?
- N: how to indicate the alias should be displayed?
- N: how to indicate the ‘generate another random alias’ function?

### 2: on-behalf-of

- this will need to set a variable for ‘self’ / ‘other’ variant question forms

### 2: survivor-age

- complex behaviour where selecting radio button clears select value, selecting age clears radio
  button

### 3: when

- the exact date is complex, would probably be better served by a library function than by some 
  complex specification
  
### 4: where

- subsidiary for 'yes' is initially displayed, unlike most other subsidiary blocks

### 6: description

- this page needs `enctype="multipart/form-data"`; other pages should have no enctype
- more consideration will be required for the file upload functionality

### 7: action-taken

- for checkbox rather than radio, subsidiary block depends on whether checkbox is checked, not on 
  other radio values

Common library code
-------------------

There is some code ([app.js](../../app-report/test-grn/sexual-assault/app.js), 
[routes.js](../../app-report/test-grn/sexual-assault/routes.js)) which is currently within the GRN 
Sexual Assault project but which should be applicable to all projects; this could perhaps be 
refactored in some way, otherwise will have to be generated from library JavaScript when a project 
is initialised.

[handlers.js](../../app-report/test-grn/sexual-assault/handlers.js) will also require redesign; the 
`prettifyReport` function is specific to a project; all other code should be generic, I think. 
`prettifyReport` may become redundant with the information captured within the JSON/YAML form spec.

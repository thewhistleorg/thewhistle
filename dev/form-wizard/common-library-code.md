Form Wizard Common Library Code
===============================

This code is taken from the GRN Sexual Assault project, but should be common to all projects.


app.js
------

````
!!!include(../../app-report/test-grn/sexual-assault/app.js)!!!
````


routes.js
---------

````
!!!include(../../app-report/test-grn/sexual-assault/routes.js)!!!
````


handlers.js
-----------

This will need restructuring: the `prettifyReport` function is specific to a project; all other code
should be generic, I think.

````
!!!include(../../app-report/test-grn/sexual-assault/handlers.js)!!!
````

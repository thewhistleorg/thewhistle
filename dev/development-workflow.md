The Whistle development workflow
================================

The Whistle development workflow uses:

- workflow based on [GitHub Flow](https://guides.github.com/introduction/flow/)
- continuous integration using [CircleCI](https://circleci.com/)
- [Heroku GitHub integration](https://devcenter.heroku.com/articles/github-integration) for automatic 
  builds and [review apps](https://devcenter.heroku.com/articles/github-integration-review-apps)

The [GitHub Flow](https://guides.github.com/introduction/flow/) is a straightforward workflow that
keeps things simple, and leverages the GitHub pull request mechanism for code review and conversation 
about proposed changes. Essentially the master branch always reflects the production environment, 
and all development is done on topic branches.

Continuous integration tests are performed using [CircleCI](https://circleci.com/) (it is widely used, 
offers good GitHub integration and Node.js support, and has a free tier which applies for private 
GitHub repositories and should be adequate for The Whistle).

[Heroku auto-deployment](https://devcenter.heroku.com/articles/github-integration#automatic-deploys) 
means that a push to the GitHub master branch will automatically be built and released on the Heroku 
staging site (promotion to production is manual).

Heroku [review apps](https://devcenter.heroku.com/articles/github-integration-review-apps) will 
create temporary disposable test apps for any pull request that’s opened on the GitHub repository. 
This means that functionality of proposed changes in git development branches can be evaluated live.

In more detail
--------------

### Review apps

New or changed functionality which will require review is done on topic branches.

A new topic branch should always be branched from master (after having updated the local master to 
match the GitHub master, of course):

    $ git checkout master && git pull --rebase origin
    $ git checkout -b my-new-development

In order to minimise merge conflicts, it is worth regularly pulling the current master into the 
topic branch using

    $ git checkout master && git pull --rebase origin && git rebase master my-new-development

Always pull using rebase in order to keep the commit history clean of spurious merge commits.

Note that use of a graphical mergetool such as Perforce 
[p4merge](https://www.perforce.com/products/helix-apps/merge-diff-tool-p4merge) makes life _much_ 
easier dealing with merge conflicts! It’s also well worth it just as a difftool for checking what 
has been updated prior to committing.

Note that during local development, database connection details are held in the `.env` file, which 
is _not_ checked in to the repository.

#### Deployment

When development is sufficiently mature for review, the topic branch can be pushed to GitHub, using:

    $ git push -u origin my-new-development

Then on GitHub [open a pull request](https://help.github.com/articles/creating-a-pull-request/) to 
merge that branch into master. Opening the pull request will automatically create a Heroku review app.

The review app is named after the GitHub pull request number: for e.g. pull request #99, the Heroku 
app would be named `thewhistle-staging-pr-99`. This would be available at 
http://thewhistle-staging-pr-99.herokuapp.com.

The review app will require the `DB_USERS` and `DB_TEST` environment variables set, and potentially 
the `SMTP_*` environment variables, if e-mails are to be sent from the review app. 

Also since a subdomain cannot be specified when running the review app, the `SUBAPP` environment 
variable will have to be set to either _admin_ or _report_ as appropriate.

    $ heroku config:set SUBAPP=report --app thewhistle-staging-pr-99

...and similarly for DB\_USERS and DB\_TEST environment variables.

Current values can be obtained from

    $ heroku config --app thewhistle-staging

GitHub pull request comments can be used for discussion about the proposed development. 

#### Merge to master

Once review is complete, it can be merged to master and deployed to staging with:

    $ git checkout master && git pull --rebase origin && git rebase master my-new-development
    $ git checkout master && git merge my-new-development
    $ npm test
    $ git push origin master
    $ git branch -d my-new-development
    $ git push -d origin my-new-development

Always run a final test before pushing in order to avoid CI failures. Always garbage collect the 
merged topic branch.

If other clones of the repository have the topic branch, they can then delete it by using `git fetch 
--all --prune`.

Note that topic branches are always merged into master, not vice versa (topic branches are rebased 
from master).

When any commit (either a simple commit or a merge commit of topic branch) is pushed to the GitHub 
repository `master`, it will be automatically deployed to the staging app 
([admin.staging.thewhistle.org](http://admin.staging.thewhistle.org) / 
[report.staging.thewhistle.org](report.staging.thewhistle.org)) for final testing.

When final verification is complete, the staging app can be promoted to production.

### Don’t rewrite history

Forced pushes (`git push --force`) are essentially verboten. If – and only if – there is complete 
confidence that no one else has accessed the updated repo (fetched, pulled, or cloned), and that no 
one had pushed since the last pull, then a forced push might be acceptable – but this should be 
exceptional, and pre-arranged with all members of the team – on force of court martial!

Information Security Risk Assessment
====================================

Information security is practice of preventing unauthorised access, use, disclosure, disruption, 
modification, inspection, recording or destruction of information; the primary focus is the balanced 
protection of the confidentiality, integrity and availability (‘CIA’) of data.

*Controls* mitigate *vulnerabilities* which may be exploited by *threats*.


Threats
-------

The Whistle is a hosted web application, so threats relate to the confidentiality, integrity and 
availability (‘CIA’) of the hosted application and its data; there is currently no application 
running on personal computers or mobile devices.

Identified threats relevant to The Whistle

- Unauthorised physical access to data
  - e.g. local login to data server, physical removal of hard disk drives
- Unauthorised network access to data at rest
  - e.g. remote login to data server
- Network access to data in transit
  - e.g. WiFi eavesdropping, ‘man-in-middle’ attacks
- Unauthorised application access to data
  - e.g. passwords obtained by WiFi eavesdropping, session hijacking, etc
- Unauthorised use of data (validly accessed)
  - e.g. employees distributing confidential downloaded reports
- Malicious modification or deletion of data
  - e.g. SQL injection attacks
- Unauthorised access to source code
  - could compromise IP rights or expose security weaknesses
- Denial of service
  - e.g. malicious DDoS attacks
- Hosting failure (application or data)
  - e.g. hardware failure, power failure, storms, floods, earthquakes, etc which can take out 
    physical infrastructure
- Malicious use of server e.g. sending spam or spreading infections
  - achieved through installing malware on the server
- Regression bugs resulting in restricted access to or use of system
  - web applications under continued development are at risk of introducing bugs which impact
    existing functionality
- Developer unavailability
  - if familiarity with the codebase is limited to a few personnel, unavailability might impact
    responsiveness to issues or enhancement requests


Vulnerabilities
---------------

For a web application, vulnerabilities fall into three groups:

- Application
  - exploiting weaknesses in the coding of the application
- Network
  - exploiting weaknesses in the network infrastructure (independent of the application)
- Physical/social
  - gaining physical access to raw file systems, or maliciously exploiting authorised 
    application/network access


Controls
--------

- Application physical hosting (via Heroku) on [Amazon AWS](https://aws.amazon.com)
  - providing [physical security](https://www.heroku.com/policy/security#physsec) benefits of AWS 
    data centres: “Heroku utilizes ISO 27001 and FISMA certified AWS data centers managed by Amazon 
    ... Physical  access is strictly controlled ...  Authorized staff must pass two-factor 
    authentication no fewer  than three times to access data center floors.”

- Application hosted on [Heroku](https://www.heroku.com)
  - Heroku [Network Security](https://www.heroku.com/policy/security) includes 
    [Firewalls](https://www.heroku.com/policy/security#firewalls), 
    [DDoS Mitigation](https://www.heroku.com/policy/security#ddos),
    [Spoofing and Sniffing Protections](https://www.heroku.com/policy/security#spoofing), and
    [Port Scanning](https://www.heroku.com/policy/security#portscan) protection.

- Databases hosted on [mLab](https://mlab.com)
  - mLab uses [Salted Challenge Response Authentication Mechanism](https://docs.mongodb.com/v3.6/core/security-scram) 
    (SCRAM) for authentication
  - mLab uses Amazon AWS, so application⇔database communications operate within Amazon’s secure 
    internal network
  - mLab uses Amazon AWS, providing [physical security](https://www.heroku.com/policy/security#physsec) 
    benefits of AWS data centres
  - for further security of data at rest, mLab offers the option to use 
    [Amazon EBS encryption](http://docs.aws.amazon.com/AWSEC2/latest/UserGuide/EBSEncryption.html)

- Data held in MongoDB databases
  - SQL injection attacks are not possible
  - no [operations allowing JavaScript expressions](https://docs.mongodb.com/manual/faq/fundamentals/#javascript)
    are used; see also [OWASP](https://www.owasp.org/index.php/Testing_for_NoSQL_injection)

- Partner organisations’ data held in entirely separate databases, with independent connection 
  parameters
  - partners can be given full access to their data without having any visibility of other 
    organisations’ data

- Backups retained for failure recovery
  - current ad-hoc backup procedures should be ugraded to paid-for mLab (encrypted) backups

- Heroku ephemeral environment for application (re-initialised daily from git repository)
  - any breach of security resulting in placement of malicious code on the server would be removed
    within 24 hours

- Database connection parameters held in environment variables, never stored on file system
  - unauthorised access to the application server file system will not expose db connection parameters

- HTTPS (HTTP over SSL) encryption addresses unauthorised access to data in transit
  - protects against WiFi eavesdropping, ‘man-in-middle’ attacks
  - HTTP requests are redirected to HTTPS
  - HTTP Strict-Transport-Security response header ensures HTTP cannot be used

- Passwords hashed with scrypt (best-of-class key derivation function)

- Password reset function only available through e-mailed password reset facility
  - only login account e-mail holder is able to (re)set passwords

- Jason Web Tokens ([JWT](https://jwt.io)) used for session management
  - given the stateless nature of the internet, any login facility has to be managed using 
    client-side browser-based session tokens; JWT is the most secure method of achieving this

- Signed cookies used (with rotated keys)
  - [Keygrip](https://www.npmjs.com/package/keygrip) is used for signed cookies to prevent tampering,
    using a rotating credential system.

- Lusca application security library used to protect against a range of attacks
  - The Whistle gets ‘A’ grade from [Security Headers](https://securityheaders.com/?q=admin.thewhistle.org&followRedirects=on)
  - The Whistle gets ‘A+’ grade from [Qualys SSL Labs](https://www.ssllabs.com/ssltest/analyze.html?d=admin.thewhistle.org)
  - [Content-Security-Policy](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Content-Security-Policy),
    [X-Content-Type-Options](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/X-Content-Type-Options), 
    [HTTP Strict-Transport-Security](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Strict-Transport-Security), 
    [Referrer-Policy](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Referrer-Policy), 
    [X-Frame-Options](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/X-Frame-Options), 
    [X-XSS-Protection](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/X-XSS-Protection)
    headers are enabled

- Extensive test suite with continuous integration (CI) controls
  - [CI](https://circleci.com) ensures code updates do not get deployed if any test in the test suite fails
  - [coverage reports](https://www.npmjs.com/package/istanbul) give assurance of test coverage

- Source code management implemented using GitHub
  - traceability of all code updates
  - ability to roll back changes to previous commits

- Review apps
  - provide opportunity for full team to review and test new functionality without pushing to live 
    production environment

- Deployment by Heroku/GitHub integration
  - Heroku automatically builds and releases (if the build is successful) pushes to the GitHub repo
  - in the case of issues surviving CI tests, Heroku offers ability to roll back to specific commit

- Clear, well documented/commented code easy to hand on to new developers


Threat / Control matrix
-----------------------

CIA | Threat                                      | Control(s)
--- | ---                                         | ---
CIA | unauthorised physical access to data        | mLab/AWS hosting
CIA | unauthorised network access to data at rest | mLab/AWS hosting; db connection in env vars
C-– | network access to data in transit           | https
CI– | unauthorised application access to data     | lusca; hashed passwords; password reset; JWT
C-– | unauthorised use of data (validly accessed) | —
–I– | malicious modification or deletion of data  | mongodb databases; mLab hosting; separate org’n databases; backups
C-– | unauthorised access to source code          | Heroku/AWS hosting
–-A | denial of service                           | Heroku hosting
–-A | hosting failure (application or data)       | mLab/AWS hosting
–I– | malicious use of server                     | Heroku hosting ephemeral environment
–-A | regression bugs                             | CI test suite; review apps; source-code management; Heroku rollback
–-A | developer unavailability                    | maintainable code


Partner own hosting
-------------------

If partner organisations preferred to host the application and/or the database themselves, they 
would have to take on responsibility for all controls deriving from Heroku, mLab, and Amazon AWS
hosting services.

'use strict';

/*
  NOTE: This is the End-2-end test.
  - before every test: it creates a git repo in a temp directory
  - test cases set pre-conditions. Eg.: commit messages, add files
  - test cases run corp-semantic-release
  - test cases will verify the state of Git
  - after every test, temp dir and git repo are deleted.
*/

let expect = require('chai').expect;
let shell = require('shelljs');
let fs = require('fs');
let writeFileSync = fs.writeFileSync;
let temp = require('temp').track();

let counter = 0;    // Used to create unique content to trigger git changes, to trigger semver bumps.


describe('corp-semantic-release', function() {
  // temp dir created for testing.
  // New git repo will be created here
  let tempDir;

  beforeEach(function() {
    tempDir = temp.path({prefix: 'corp-sem-rel-'});

    shell.config.silent = !process.env.npm_config_debug;
    shell.rm('-rf', tempDir);
    shell.mkdir(tempDir);
    shell.cp(__dirname + '/testData/package.json', tempDir);

    shell.cd(tempDir);

    shell.exec('git init');

    // travis ci needs it
    shell.exec('git config user.email "leonardo@example.com"');
    shell.exec('git config user.name "Leonardo C"');
  });

  afterEach(function() {
    shell.cd(__dirname);
    shell.rm('-rf', tempDir);
    tempDir = null;
  });


  it('should not change anything in dry mode', function() {
    commitFeat();
    const out = semanticRelease(`-d -v`);

    expect(out).to.include('YOU ARE RUNNING IN DRY RUN MODE');

    // clean work directory
    const gitStatus = shell.exec('git status').stdout;
    expect(gitStatus).to.match(/nothing to commit, working (directory|tree) clean/);
  });


  it('should bump minor version, create CHANGELOG.md file and semantic tag correctly', function() {
    commitFeat();
    semanticRelease();
    const expectedVersion = '1.0.0';

    // check Semantic Tag
    expectedGitTag(expectedVersion);

    // Verify CHANGELOG.md
    let changelog = shell.exec('cat CHANGELOG.md').stdout;
    expect(changelog).to.include(`# ${expectedVersion} (${today})`);
    expect(changelog).to.include('### Features\n\n');
    expect(changelog).to.include('my first feature');

    expectedVersionInPackageJson(expectedVersion);
  });


  it('should run pre-commit script and pass the version number to the npm script', function() {
    commitFeat();
    const out = semanticRelease(`-v --pre-commit set-version`);

    expect(out).to.include('this is my pre-commit script v1.0.0');
  });


  it('should run pre-commit script and pass the version number to a node script referenced by the npm script', function() {
    commitFeat();
    shell.exec('rm package.json');
    shell.cp(__dirname + '/testData/package_precommit.json', tempDir + '/package.json');
    shell.cp(__dirname + '/testData/precommit.js', tempDir);

    const out = semanticRelease(`-v --pre-commit set-version`);

    expect(out).to.include('Inside precommit.js, version is v1.0.0');
  });


  it('should bump Major version due to Breaking Change and append contents to CHANGELOG.md', function() {
    // pre-conditions
    shell.cp(__dirname + '/testData/CHANGELOG.md', tempDir);
    commitFeat();
    semanticRelease();

    const expectedVersion = '2.0.0';

    // actions
    commitFixWithBreakingChange();
    semanticRelease();

    // verify
    let changelog = shell.exec('cat CHANGELOG.md').stdout;

    expect(changelog).to.include('### BREAKING CHANGES\n\n* This should bump major');
    expect(changelog).to.include(`# [2.0.0](https://any.git.host/owner-name/repo-name/compare/v1.0.0...v${expectedVersion}) (${today})`);
    expect(changelog).to.match(/\* issue in the app \(\[[a-z0-9]{7}\]\(.*\)/);

    expectedVersionInPackageJson(expectedVersion);
  });


  it('should generate a changelog for BitBucket with link references', function() {
    // pre-conditions
    shell.cp(__dirname + '/testData/CHANGELOG.md', tempDir);
    commitFeat();
    semanticRelease(`--changelogpreset angular-bitbucket`);

    const expectedVersion = '2.0.0';

    // actions
    commitFixWithBreakingChange();
    semanticRelease(`--changelogpreset angular-bitbucket`);

    // verify
    let changelog = shell.exec('cat CHANGELOG.md').stdout;

    expect(changelog).to.include('### BREAKING CHANGES\n\n* This should bump major');
    expect(changelog).to.include(`# [2.0.0](https://any.git.host/projects/owner-name/repos/repo-name/compare/diff?` +
      `targetBranch=refs%2Ftags%2Fv1.0.0&sourceBranch=refs%2Ftags%2Fv${expectedVersion}) (${today})`);
    expect(changelog).to.match(/\* issue in the app \(\[[a-z0-9]{7}\]\(.*\)/);

    expectedVersionInPackageJson(expectedVersion);
  });


  it('should detect release is not necessary', function() {
    commitNonReleaseTypes();
    const out = semanticRelease(`-v`);

    expect(out).to.include('Release is not necessary at this point');

    // clean work directory
    const gitStatus = shell.exec('git status').stdout;
    expect(gitStatus).to.match(/nothing to commit, working (directory|tree) clean/);
  });


  it('should NOT make any change when we run multiple times and there are no relevant commits', function() {
    commitWithMessage('initial commit');
    semanticRelease();
    const expectedVersion = '0.0.1';

    const gitStatus = shell.exec('git status').stdout;
    expect(gitStatus).to.match(/nothing to commit, working (directory|tree) clean/);

    // no changes expected, no tags expected
    const gitTag = shell.exec('git tag | cat').stdout;
    expect(gitTag).to.equal('');
    expectedVersionInPackageJson(expectedVersion);


    // Then when I run again...
    semanticRelease();
    expectedVersionInPackageJson(expectedVersion);
    expect(gitTag).to.equal('');
    expectedVersionInPackageJson(expectedVersion);
  });


  it('should NOT make any change when we run multiple times and after a first minor release', function() {
    let out;
    let gitTag;
    commitWithMessage('feat(accounts): commit 1');
    commitFixWithMessage('fix(exampleScope): add extra config');

    semanticRelease();
    const expectedVersion = '1.0.0';

    // version 1.0.0 expected
    gitTag = shell.exec('git tag | cat').stdout;
    expect(gitTag).to.equal(`v${expectedVersion}\n`);
    expectedVersionInPackageJson(expectedVersion);

    // then run again. The same version 1.0.0 expected
    out = semanticRelease(`-v`);
    gitTag = shell.exec('git tag | cat').stdout;
    expect(gitTag).to.equal(`v${expectedVersion}\n`);
    expectedVersionInPackageJson(expectedVersion);
    expect(out).to.include('Release is not necessary at this point');

    // run once more. The same version 1.0.0 expected
    out = semanticRelease(`-v`);
    gitTag = shell.exec('git tag | cat').stdout;
    expect(gitTag).to.equal(`v${expectedVersion}\n`);
    expectedVersionInPackageJson(expectedVersion);
    expect(out).to.include('Release is not necessary at this point');
  });

  it('should only run if branch is master', function() {
    commitWithMessage('feat(accounts): commit 1');
    shell.exec('git checkout -b other-branch');

    const out = semanticRelease(`-v -d --post-success "echo foo"`);

    expect(out).not.to.include('Skipping post-success command');
    expect(out).to.include('You can only release from the master branch. Use option --branch to specify branch name.');

    shell.exec('git checkout master');
    const outMaster = semanticRelease(`-v -d --post-success "echo foo"`);
    expect(outMaster).to.include('Skipping post-success command');
    expect(outMaster).to.include('>>> Your release branch is: master');
  });


  it('should inform user if package.json does not exist', function() {
    commitWithMessage('feat(accounts): commit 1');
    shell.exec('rm package.json');

    const out = semanticRelease(`-v -d`);

    expect(out).to.include('Cant find your package.json');
  });


  it('should inform user if name is not present in package.json', function() {
    commitWithMessage('feat(accounts): commit 1');
    shell.exec('rm package.json');
    shell.cp(__dirname + '/testData/package_noname.json', tempDir + '/package.json');

    const out = semanticRelease(`-v -d`);

    expect(out).to.include('Minimum required fields in your package.json are name and version');
  });


  it('should generate a changelog for 1 release by default', function() {
    commitFeat();
    semanticRelease();
    expectedGitTag('1.0.0');

    // Verify CHANGELOG.md starts with '<a name="1.0.0"></a>'
    let changelog = shell.exec('cat CHANGELOG.md').stdout;
    expect(changelog.indexOf('<a name="1.0.0"></a>')).to.equal(0);

    // Now clear the contents of the changelog, add another feature and release. We should only see the new release in the changelog.
    shell.exec('echo > CHANGELOG.md');
    commitFeat();
    semanticRelease();
    expectedGitTag('1.1.0');

    changelog = shell.exec('cat CHANGELOG.md').stdout;
    expect(changelog.indexOf('<a name="1.1.0"></a>')).to.equal(0);

    // Old information is not regenerated, which means by default only 1 release is generated
    expect(changelog).not.to.include('<a name="1.0.0"></a>');
  });


  it('should allow a changelog to be generated for all releases', function() {
    commitFeat();
    semanticRelease();

    let changelog = shell.exec('cat CHANGELOG.md').stdout;
    expect(changelog.indexOf('<a name="1.0.0"></a>')).to.equal(0);  // First item in file

    // Now clear the contents of the changelog, add another feature and re-generate all releases
    shell.exec('echo > CHANGELOG.md');
    changelog = shell.exec('cat CHANGELOG.md').stdout;
    expect(changelog).to.equal('\n');

    commitFeat();
    semanticRelease(`--releasecount 0`);    // regenerate ALL releases (0 = all)
    expectedGitTag('1.1.0');

    changelog = shell.exec('cat CHANGELOG.md').stdout;
    expect(changelog.indexOf('<a name="1.1.0"></a>')).to.equal(0);  // First item in file

    // Old information HAS been re-generated
    expect(changelog).to.include('<a name="1.0.0"></a>');
  });


  it('should replace an existing changelog when re-generating it for all releases', function() {
    shell.exec('echo foo bar > CHANGELOG.md');
    let changelog = shell.exec('cat CHANGELOG.md').stdout;
    expect(changelog).to.equal('foo bar\n');

    // Don't clear the contents of the changelog, add another feature and re-generate all releases
    commitFeat();
    semanticRelease();
    expectedGitTag('1.0.0');

    changelog = shell.exec('cat CHANGELOG.md').stdout;
    expect(changelog).to.include('<a name="1.0.0"></a>');
    expect(changelog).to.include('foo bar');

    commitFeat();
    semanticRelease(`-r 0`);    // regenerate ALL releases (0 = all)
    expectedGitTag('1.1.0');

    changelog = shell.exec('cat CHANGELOG.md').stdout;
    expect(changelog).to.include('<a name="1.1.0"></a>');
    expect(changelog).to.include('<a name="1.0.0"></a>');
    expect(changelog).not.to.include('foo bar');
  });


  it('should generate the specified number of releases', function() {
    // Add two features, clear the log, add another feature then generate 2 releases (this one and the previous one)
    commitFeat();
    semanticRelease();
    expectedGitTag('1.0.0');

    commitFeat();
    semanticRelease();
    expectedGitTag('1.1.0');

    let changelog = shell.exec('cat CHANGELOG.md').stdout;
    expect(changelog).to.include('<a name="1.1.0"></a>');
    expect(changelog).to.include('<a name="1.0.0"></a>');

    // Replace the log with junk, then append 2 releases
    shell.exec('echo foo bar > CHANGELOG.md');
    changelog = shell.exec('cat CHANGELOG.md').stdout;
    expect(changelog).to.equal('foo bar\n');

    commitFeat();
    semanticRelease(`--releasecount 2`);
    expectedGitTag('1.2.0');

    changelog = shell.exec('cat CHANGELOG.md').stdout;
    expect(changelog).to.include('<a name="1.2.0"></a>');
    expect(changelog).to.include('<a name="1.1.0"></a>');
    expect(changelog).not.to.include('<a name="1.0.0"></a>');
    expect(changelog).to.include('foo bar');
  });


  it('should only run post-success script when the git push command is successful', function() {
    commitFeat();
    const out = semanticRelease(`--post-success do-publish -v`);

    expect(out).to.include('and exited with code 128');
    expect(out).not.to.include('Skipping git push');
    expect(out).not.to.include('Skipping post-success command');
  });

  it('should not run post-success script in dry mode', function() {
    commitFeat();
    const out = semanticRelease(`--post-success "npm run dopublish" -d`);

    expect(out).to.include('Skipping git push');
    expect(out).to.include('Skipping post-success command');
  });


  // ####### Helpers ######

  // function getBranchName() {
  //   var branch = shell.exec('git branch').stdout;
  //   return branch;
  // }

  function semanticRelease(params) {
    let result = shell.exec(`node ${__dirname}/../src/index.js ${params || ''}`);
    return result.stdout;
  }

  function commitFeat() {
    writeFileSync('feat.txt', counter++);    // Produce a unique change to the file
    return commitWithMessage('feat: my first feature');
  }

  function commitNonReleaseTypes() {
    writeFileSync('docs.txt', counter++);
    commitWithMessage('docs: commit 01');

    writeFileSync('styles.txt', counter++);
    commitWithMessage('styles: commit 02');

    writeFileSync('chore.txt', counter++);
    commitWithMessage('chore: commit 03');
  }

  function commitFixWithMessage(msg) {
    writeFileSync('fix.txt', counter++);
    commitWithMessageMultiline(`-m "${msg}"`);
  }

  function commitFixWithBreakingChange() {
    writeFileSync('fix.txt', counter++);
    const msg = '-m "fix: issue in the app" -m "BREAKING CHANGE:" -m "This should bump major"';

    commitWithMessageMultiline(msg);
  }

  function commitWithMessage(msg) {
    return shell.exec(`git add --all && git commit -m "${msg}"`).stdout;
  }

  function commitWithMessageMultiline(msg) {
    shell.exec(`git add --all && git commit ${msg}`);
  }

  const today = new Date().toISOString().substring(0, 10);


  function expectedGitTag(expectedVersion) {
    // check for new commit
    let gitLog = shell.exec('git log | cat').stdout;
    expect(gitLog).to.include(`chore(release): v${expectedVersion}`);

    let gitTag = shell.exec('git tag | cat').stdout;
    expect(gitTag).to.include('v' + expectedVersion);
  }

  function expectedVersionInPackageJson(expectedVersion) {
    let newVersion = require(tempDir + '/package.json').version;
    expect(newVersion).to.equal(expectedVersion);
  }
});

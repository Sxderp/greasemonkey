describe('bg/user-script-registry', () => {
  afterEach(done => {
    let req = indexedDB.deleteDatabase('greasemonkey');
    req.onsuccess = event => {
      UserScriptRegistry._loadUserScripts().then(done);
    };
    req.onerror = event => {
      console.error('delete error;', event, event.result);
    };
  });

  function isOk(uuid) {
    assert.isOk(UserScriptRegistry.scriptByUuid(uuid), 'Script not found');
  }
  function isNotOk(uuid) {
    expect(() => UserScriptRegistry.scriptByUuid(uuid), 'Script wrongly found')
        .to.throw('Could not find installed user script with uuid');
  }

  it('can save and load a script', async () => {
    let newUuid = 'foobar';
    let userScript = new EditableUserScript(
        {'uuid': newUuid, 'name': 'footnote'});
    isNotOk(newUuid);
    await UserScriptRegistry._saveUserScript(userScript);
    isOk(newUuid);
    await UserScriptRegistry._loadUserScripts();
    isOk(newUuid);
  });

  it('fails when saving two scripts of the same name', async () => {
    let newUuid1 = 'defcon1';
    let userScript1 = new EditableUserScript(
        {'uuid': 'defcon1', 'name': 'conflict1'});
    await UserScriptRegistry._saveUserScript(userScript1);
    isOk(newUuid1);

    let newUuid2 = 'defcon2';
    let userScript2 = new EditableUserScript(
        {'uuid': newUuid2, 'name': 'conflict1'});

    let canary = true;
    try {
      await UserScriptRegistry._saveUserScript(userScript2);
      canary = false;
    } catch (e) {
      expect(e.name, 'Bad error thrown').to.equal('ConstraintError');
    } finally {
      assert.isOk(canary, 'No errors were thrown!');
    }
  });

  it('can uninstall a script', async () => {
    let newUuid = 'foobar';
    let userScript = new EditableUserScript(
        {'uuid': newUuid, 'name': 'exponential'});
    isNotOk(newUuid);
    await UserScriptRegistry._saveUserScript(userScript);
    isOk(newUuid);
    await onUserScriptUninstall({'uuid': userScript.uuid});
    isNotOk(newUuid);
  });
});

describe('bg/value-store', () => {
  let storeName = 'gmTests';

  function cleanup() { return ValueStore.deleteStore(storeName); }
  let count = 0;
  before(() => {
    console.time('all');
  });
  beforeEach(async () => {
    await cleanup();
    console.time('t' + (++count));
  });
  // Cleanup the stores one more time.
  afterEach(() => {
    console.timeEnd('t' + count);
  });
  after(() => {
    console.timeEnd('all');
    return cleanup();
  });

  it('can set and retrieve a value', () => {
    let testKey = 'gmFoo';
    let testValue = 'gmValue';

    console.time('t1, setValue');
    return ValueStore.setValue(storeName, testKey, testValue)
        .then(isSet => {
          console.timeEnd('t1, setValue');
          assert.equal(isSet, true, 'Failed to set value');
          console.time('t1, getValue');
          return ValueStore.getValue(storeName, testKey);
        }).then(value => {
          console.timeEnd('t1, getValue');
          assert.equal(value, testValue, 'Failed to get value');
        });
  });

  it('can delete a value', () => {
    let testKey = 'gmBar';
    let testValue = 'gmValue';

    console.time('t2, setValue');
    return ValueStore.setValue(storeName, testKey, testValue)
        .then(isSet => {
          console.timeEnd('t2, setValue');
          assert.equal(isSet, true, 'Failed to set value');
          console.time('t2, deleteValue');
          return ValueStore.deleteValue(storeName, testKey);
        }).then(isDeleted => {
          console.timeEnd('t2, deleteValue');
          assert.equal(isDeleted, true, 'Failed to delete value');
          console.time('t2, getValue');
          return ValueStore.getValue(storeName, testKey);
        }).then(value => {
          console.timeEnd('t2, getValue');
          assert.isUndefined(value, 'Value has a result, was not deleted');
        });
  });

  it('can list all keys', () => {
    let testKeys = ['gmBaz1', 'gmBaz2', 'gmBaz3'];
    let testValue = 'gmValue';
    let setPromises = [
      ValueStore.setValue(storeName, testKeys[0], testValue),
      ValueStore.setValue(storeName, testKeys[1], testValue),
      ValueStore.setValue(storeName, testKeys[2], testValue),
    ];

    console.time('t3, setValues');
    return Promise.all(setPromises)
        .then(isSets => {
          console.timeEnd('t3, setValues');
          expect(isSets, 'Failed to set values')
              .to.have.members([true, true, true]);
          console.time('t3, listValues');
          return ValueStore.listValues(storeName);
        }).then(storeKeys => {
          console.timeEnd('t3, listValues');
          expect(storeKeys, 'Listed keys do not match provided keys')
              .to.have.members(testKeys);
        });
  });
});

import Promise from 'dojo-shim/Promise';
import * as registerSuite from 'intern!object';
import * as assert from 'intern/chai!assert';

import createApp, {
	StoreLike
} from 'src/createApp';

import { stub as stubStoreFactory } from '../../fixtures/store-factory';
import storeInstanceFixture from '../../fixtures/store-instance';
import {
	createStore,
	createWidget,
	invert,
	rejects,
	strictEqual
} from '../../support/createApp';

const { toAbsMid } = require;

registerSuite({
	name: 'createApp (stores)',

	'#getStore': {
		'no registered store'() {
			return rejects(createApp().getStore('foo'), Error);
		},

		'provides registered store'() {
			const expected = createStore();

			const app = createApp();
			app.registerStore('foo', expected);

			return strictEqual(app.getStore('foo'), expected);
		}
	},

	'#hasStore': {
		'no registered store'() {
			assert.isFalse(createApp().hasStore('foo'));
		},

		'registered store'() {
			const app = createApp();
			app.registerStore('foo', createStore());

			assert.isTrue(app.hasStore('foo'));
		}
	},

	'#identifyStore': {
		'store instance has not been registered'() {
			assert.throws(() => {
				createApp().identifyStore(createStore());
			}, Error, 'Could not identify store');
		},

		'store instance has been registered'() {
			const store = createStore();
			const app = createApp();
			app.registerStore('foo', store);
			assert.equal(app.identifyStore(store), 'foo');
		},

		'called with a registered non-store instance'() {
			const app = createApp();
			const widget = createWidget();
			app.registerWidget('foo', widget);
			assert.throws(() => {
				app.identifyStore(<any> widget);
			}, Error, 'Could not identify store');
		}
	},

	'#registerStore': {
		'store may only be registered once'() {
			const store = createStore();
			const app = createApp();
			app.registerStore('foo', store);

			assert.throws(
				() => app.registerStore('bar', store),
				Error,
				'Could not add store, already registered as store with identity foo'
			);
		},

		'destroying the returned handle': {
			'deregisters the action'() {
				const store = createStore();
				const app = createApp();

				const handle = app.registerStore('foo', store);
				handle.destroy();

				assert.isFalse(app.hasStore('foo'));
				assert.doesNotThrow(() => app.registerStore('foo', store));
			},

			'a second time has no effect'() {
				const store = createStore();

				const app = createApp();
				const handle = app.registerStore('foo', store);
				handle.destroy();
				handle.destroy();

				assert.isFalse(app.hasStore('foo'));
			}
		}
	},

	'#registerStoreFactory': {
		'hasStore returns true after'() {
			const app = createApp();
			app.registerStoreFactory('foo', createStore);

			assert.isTrue(app.hasStore('foo'));
		},

		'factory is not called until the store is needed'() {
			let called = false;

			const app = createApp();
			app.registerStoreFactory('foo', function(): StoreLike {
				called = true;
				return createStore();
			});

			assert.isFalse(called);

			app.hasStore('foo');
			assert.isFalse(called);

			const promise = app.getStore('foo');
			assert.isFalse(called);

			return promise.then(() => {
				assert.isTrue(called);
			});
		},

		'factory is only called once'() {
			let count = 0;
			const expected = createStore();

			const app = createApp();
			app.registerStoreFactory('foo', function(): StoreLike {
				count++;
				return expected;
			});

			return Promise.all([
				strictEqual(app.getStore('foo'), expected),
				strictEqual(app.getStore('foo'), expected)
			]).then(() => {
				assert.equal(count, 1);
			});
		},

		'factory may return a promise': {
			'should resolve with the store'() {
				const expected = createStore();

				const app = createApp();
				app.registerStoreFactory('foo', () => Promise.resolve(expected));

				return strictEqual(app.getStore('foo'), expected);
			},

			'rejections are propagated'() {
				const expected = new Error();

				const app = createApp();
				app.registerStoreFactory('foo', () => Promise.reject(expected));

				return strictEqual(invert(app.getStore('foo')), expected);
			}
		},

		'the produced store must be unique'() {
			const store = createStore();
			const app = createApp();
			app.registerStore('foo', store);
			app.registerStoreFactory('bar', () => store);

			return rejects(app.getStore('bar'), Error, 'Could not add store, already registered as store with identity foo');
		},

		'destroying the returned handle': {
			'deregisters the factory'() {
				const app = createApp();
				const handle = app.registerStoreFactory('foo', createStore);
				handle.destroy();

				assert.isFalse(app.hasStore('foo'));
			},

			'prevents a pending store instance from being registered'() {
				const store = createStore();
				let fulfil: () => void;
				const promise = new Promise((resolve) => {
					fulfil = () => resolve(store);
				});

				const app = createApp();
				const handle = app.registerStoreFactory('foo', () => promise);

				app.getStore('foo');
				handle.destroy();
				fulfil();

				return new Promise((resolve) => setTimeout(resolve, 10)).then(() => {
					assert.throws(() => app.identifyStore(store));
				});
			},

			'deregisters the store if it has already been created'() {
				const app = createApp();
				const handle = app.registerStoreFactory('foo', createStore);

				return app.getStore('foo').then(() => {
					handle.destroy();

					assert.isFalse(app.hasStore('foo'));
				});
			},

			'a second time has no effect'() {
				const app = createApp();
				const handle = app.registerStoreFactory('foo', createStore);

				return app.getStore('foo').then(() => {
					handle.destroy();
					handle.destroy();

					assert.isFalse(app.hasStore('foo'));
				});
			}
		}
	},

	'#loadDefinition': {
		'registers multiple'() {
			const expected = {
				foo: createStore(),
				bar: createStore()
			};

			const app = createApp();
			app.loadDefinition({
				stores: [
					{
						id: 'foo',
						factory: () => expected.foo
					},
					{
						id: 'bar',
						factory: () => expected.bar
					}
				]
			});

			assert.isTrue(app.hasStore('foo'));
			assert.isTrue(app.hasStore('bar'));

			return Promise.all([
				strictEqual(app.getStore('foo'), expected.foo),
				strictEqual(app.getStore('bar'), expected.bar)
			]);
		},

		'requires factory or instance option'() {
			assert.throws(() => {
				createApp().loadDefinition({
					stores: [
						{
							id: 'foo'
						}
					]
				});
			}, TypeError, 'Store definitions must specify either the factory or instance option');
		},

		'with factory option': {
			'can be a method'() {
				const expected = createStore();

				const app = createApp();
				app.loadDefinition({
					stores: [
						{
							id: 'foo',
							factory: () => expected
						}
					]
				});

				return strictEqual(app.getStore('foo'), expected);
			},

			'can be a module identifier'() {
				const expected = createStore();
				stubStoreFactory(() => expected);

				const app = createApp({ toAbsMid });
				app.loadDefinition({
					stores: [
						{
							id: 'foo',
							factory: '../../fixtures/store-factory'
						}
					]
				});

				return strictEqual(app.getStore('foo'), expected);
			},

			'cannot get store if identified module has no default factory export'() {
				const app = createApp({ toAbsMid });
				app.loadDefinition({
					stores: [
						{
							id: 'foo',
							factory: '../../fixtures/no-factory-export'
						}
					]
				});

				return rejects(app.getStore('foo'), Error, 'Could not resolve \'../../fixtures/no-factory-export\' to a store factory function');
			},

			'factory is not called until the store is needed'() {
				const called = {
					foo: false,
					bar: false
				};
				stubStoreFactory(() => {
					called.bar = true;
					return createStore();
				});

				const app = createApp({ toAbsMid });
				app.loadDefinition({
					stores: [
						{
							id: 'foo',
							factory() {
								called.foo = true;
								return createStore();
							}
						},
						{
							id: 'bar',
							factory: '../../fixtures/store-factory'
						}
					]
				});

				assert.isFalse(called.foo);
				assert.isFalse(called.bar);

				const promise = app.getStore('foo');
				assert.isFalse(called.foo);

				return promise.then(() => {
					assert.isTrue(called.foo);
					assert.isFalse(called.bar);

					const promise = app.getStore('bar');
					assert.isFalse(called.bar);
					return promise;
				}).then(() => {
					assert.isTrue(called.bar);
				});
			},

			'factory may return a promise': {
				'should resolve with the store'() {
					const expected = {
						foo: createStore(),
						bar: createStore()
					};
					stubStoreFactory(() => {
						return Promise.resolve(expected.bar);
					});

					const app = createApp({ toAbsMid });
					app.loadDefinition({
						stores: [
							{
								id: 'foo',
								factory: () => Promise.resolve(expected.foo)
							},
							{
								id: 'bar',
								factory: '../../fixtures/store-factory'
							}
						]
					});

					return Promise.all([
						strictEqual(app.getStore('foo'), expected.foo),
						strictEqual(app.getStore('bar'), expected.bar)
					]);
				},

				'rejections are propagated'() {
					const expected = {
						foo: new Error(),
						bar: new Error()
					};
					stubStoreFactory(() => {
						return Promise.reject(expected.bar);
					});

					const app = createApp({ toAbsMid });
					app.loadDefinition({
						stores: [
							{
								id: 'foo',
								factory: () => Promise.reject(expected.foo)
							},
							{
								id: 'bar',
								factory: '../../fixtures/store-factory'
							}
						]
					});

					return Promise.all([
						strictEqual(invert(app.getStore('foo')), expected.foo),
						strictEqual(invert(app.getStore('bar')), expected.bar)
					]);
				}
			},

			'factory is passed a shallow copy of the options'() {
				const expected = {
					foo: { foo: 'expected' },
					bar: { bar: 'expected '}
				};
				const actual = {
					foo: { foo: 'unexpected' },
					bar: { bar: 'unexpected' }
				};
				stubStoreFactory((options) => {
					(<any> actual).bar = options;
					return createStore();
				});

				const app = createApp({ toAbsMid });
				app.loadDefinition({
					stores: [
						{
							id: 'foo',
							factory(options) {
								(<any> actual).foo = options;
								return createStore();
							},
							options: expected.foo
						},
						{
							id: 'bar',
							factory: '../../fixtures/store-factory',
							options: expected.bar
						}
					]
				});

				return Promise.all([
					app.getStore('foo'),
					app.getStore('bar')
				]).then(() => {
					assert.deepEqual(actual.foo, expected.foo);
					assert.notStrictEqual(actual.foo, expected.foo);
					assert.deepEqual(actual.bar, expected.bar);
					assert.notStrictEqual(actual.bar, expected.bar);
				});
			}
		},

		'with instance option': {
			'can be an instance'() {
				const expected = createStore();

				const app = createApp();
				app.loadDefinition({
					stores: [
						{
							id: 'foo',
							instance: expected
						}
					]
				});

				return strictEqual(app.getStore('foo'), expected);
			},

			'can be a module identifier'() {
				const app = createApp({ toAbsMid });
				app.loadDefinition({
					stores: [
						{
							id: 'foo',
							instance: '../../fixtures/store-instance'
						}
					]
				});

				return strictEqual(app.getStore('foo'), storeInstanceFixture);
			},

			'cannot get store if identified module has no default instance export'() {
				const app = createApp({ toAbsMid });
				app.loadDefinition({
					stores: [
						{
							id: 'foo',
							instance: '../../fixtures/no-instance-export'
						}
					]
				});

				return rejects(app.getStore('foo'), Error, 'Could not resolve \'../../fixtures/no-instance-export\' to a store instance');
			},

			'options option is not allowed'() {
				assert.throws(() => {
					createApp().loadDefinition({
						stores: [
							{
								id: 'foo',
								instance: createStore(),
								options: {}
							}
						]
					});
				}, TypeError, 'Cannot specify options when store definition points directly at an instance');
			}
		}
	}
});

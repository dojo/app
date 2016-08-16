import Promise from 'dojo-shim/Promise';
import * as registerSuite from 'intern!object';
import * as assert from 'intern/chai!assert';

import createApp, {
	CombinedRegistry,
	StoreLike
} from 'src/createApp';

import { stub as stubActionFactory } from '../../fixtures/action-factory';
import actionInstanceFixture from '../../fixtures/action-instance';
import {
	createAction,
	createStore,
	invert,
	isCombinedRegistry,
	rejects,
	strictEqual
} from '../../support/createApp';

const { toAbsMid } = require;

registerSuite({
	name: 'createApp (actions)',

	'#getAction': {
		'no registered action'() {
			return rejects(createApp().getAction('foo'), Error);
		},

		'provides registered action'() {
			const expected = createAction();

			const app = createApp();
			app.registerAction('foo', expected);

			return strictEqual(app.getAction('foo'), expected);
		}
	},

	'#hasAction': {
		'no registered action'() {
			assert.isFalse(createApp().hasAction('foo'));
		},

		'registered action'() {
			const app = createApp();
			app.registerAction('foo', createAction());

			assert.isTrue(app.hasAction('foo'));
		}
	},

	'#identifyAction': {
		'action instance has not been registered'() {
			assert.throws(() => {
				createApp().identifyAction(createAction());
			}, Error, 'Could not identify action');
		},

		'action instance has been registered'() {
			const action = createAction();
			const app = createApp();
			app.registerAction('foo', action);
			assert.equal(app.identifyAction(action), 'foo');
		},

		'called with a registered non-action instance'() {
			const app = createApp();
			const store = createStore();
			app.registerStore('foo', store);
			assert.throws(() => {
				app.identifyAction(<any> store);
			}, Error, 'Could not identify action');
		}
	},

	'#registerAction': {
		'action may only be registered once'() {
			const action = createAction();
			const app = createApp();
			app.registerAction('foo', action);

			assert.throws(
				() => app.registerAction('bar', action),
				Error,
				'Could not add action, already registered as action with identity foo'
			);
		},

		'immediately calls configure() on the action'() {
			let called = false;
			const action = createAction();
			action.configure = () => { called = true; };

			const app = createApp();
			app.registerAction('foo', action);

			assert.isTrue(called);
		},

		'action.configure() is passed a combined registry'() {
			let registry: CombinedRegistry = null;
			const action = createAction();
			action.configure = (actual: CombinedRegistry) => { registry = actual; };

			const app = createApp();
			app.registerAction('foo', action);

			isCombinedRegistry(registry);
		},

		'registerAction() does not throw if action.configure() throws'() {
			const action = createAction();
			action.configure = () => { throw new Error(); };

			const app = createApp();
			assert.doesNotThrow(() => {
				app.registerAction('foo', action);
			});
		},

		'getAction() rejects if action.configure() throws'() {
			const expected = new Error();
			const action = createAction();
			action.configure = () => { throw expected; };

			const app = createApp();
			app.registerAction('foo', action);

			return strictEqual(invert(app.getAction('foo')), expected);
		},

		'getAction() rejects if action.configure() returns a rejected promise'() {
			const expected = new Error();
			const action = createAction();
			action.configure = () => Promise.reject(expected);

			const app = createApp();
			app.registerAction('foo', action);

			return strictEqual(invert(app.getAction('foo')), expected);
		},

		'getAction() remains pending until action.configure() returns a fulfilled promise'() {
			let fulfil: Function;
			const promise = new Promise<void>((resolve) => {
				fulfil = resolve;
			});

			const action = createAction();
			action.configure = () => promise;

			const app = createApp();
			app.registerAction('foo', action);

			let gotAction = false;
			const actionPromise = app.getAction('foo').then((action) => {
				gotAction = true;
			});
			return Promise.race([actionPromise, new Promise<void>((resolve) => setTimeout(resolve, 10))]).then(() => {
				assert.isFalse(gotAction);
				fulfil();
				return actionPromise;
			}).then(() => {
				assert.isTrue(gotAction);
			});
		},

		'destroying the returned handle': {
			'deregisters the action'() {
				const action = createAction();
				const app = createApp();

				const handle = app.registerAction('foo', action);
				handle.destroy();

				assert.isFalse(app.hasAction('foo'));
				assert.doesNotThrow(() => app.registerAction('bar', action));
			},

			'a second time has no effect'() {
				const action = createAction();

				const app = createApp();
				const handle = app.registerAction('foo', action);

				handle.destroy();
				handle.destroy();

				assert.isFalse(app.hasAction('foo'));
			}
		}
	},

	'#registerActionFactory': {
		'hasAction returns true after'() {
			const app = createApp();
			app.registerActionFactory('foo', createAction);

			assert.isTrue(app.hasAction('foo'));
		},

		'factory is not called until the action is needed'() {
			let called = false;

			const app = createApp();
			app.registerActionFactory('foo', () => {
				called = true;
				return createAction();
			});

			assert.isFalse(called);

			app.hasAction('foo');
			assert.isFalse(called);

			const promise = app.getAction('foo');
			assert.isFalse(called);

			return promise.then(() => {
				assert.isTrue(called);
			});
		},

		'factory is only called once'() {
			let count = 0;
			const expected = createAction();

			const app = createApp();
			app.registerActionFactory('foo', () => {
				count++;
				return expected;
			});

			return Promise.all([
				strictEqual(app.getAction('foo'), expected),
				strictEqual(app.getAction('foo'), expected)
			]).then(() => {
				assert.equal(count, 1);
			});
		},

		'factory may return a promise': {
			'should resolve with the action'() {
				const expected = createAction();

				const app = createApp();
				app.registerActionFactory('foo', () => Promise.resolve(expected));

				return strictEqual(app.getAction('foo'), expected);
			},

			'rejections are propagated'() {
				const expected = new Error();

				const app = createApp();
				app.registerActionFactory('foo', () => Promise.reject(expected));

				return strictEqual(invert(app.getAction('foo')), expected);
			}
		},

		'factory is passed a combined registry'() {
			let registry: CombinedRegistry = null;

			const app = createApp();
			app.registerActionFactory('foo', (actual) => {
				registry = actual;
				return createAction();
			});

			return app.getAction('foo').then(() => {
				isCombinedRegistry(registry);
			});
		},

		'calls configure() on the action'() {
			let called = false;
			const action = createAction();
			action.configure = () => { called = true; };

			const app = createApp();
			app.registerActionFactory('foo', () => action);

			return app.getAction('foo').then(() => {
				assert.isTrue(called);
			});
		},

		'action.configure() is passed a combined registry'() {
			let registry: CombinedRegistry = null;
			const action = createAction();
			action.configure = (actual: CombinedRegistry) => { registry = actual; };

			const app = createApp();
			app.registerActionFactory('foo', () => action);

			return app.getAction('foo').then(() => {
				isCombinedRegistry(registry);
			});
		},

		'getAction() rejects if action.configure() throws'() {
			const expected = new Error();
			const action = createAction();
			action.configure = () => { throw expected; };

			const app = createApp();
			app.registerActionFactory('foo', () => action);

			return strictEqual(invert(app.getAction('foo')), expected);
		},

		'getAction() rejects if action.configure() returns a rejected promise'() {
			const expected = new Error();
			const action = createAction();
			action.configure = () => Promise.reject(expected);

			const app = createApp();
			app.registerActionFactory('foo', () => action);

			return strictEqual(invert(app.getAction('foo')), expected);
		},

		'getAction() remains pending until action.configure() returns a fulfilled promise'() {
			let fulfil: Function;
			const promise = new Promise<void>((resolve) => {
				fulfil = resolve;
			});

			const action = createAction();
			action.configure = () => promise;

			const app = createApp();
			app.registerActionFactory('foo', () => action);

			let gotAction = false;
			let againGotAction = false;
			const actionPromise = app.getAction('foo').then((action) => {
				gotAction = true;
			});
			const anotherActionPromise = app.getAction('foo').then((action) => {
				againGotAction = true;
			});
			return Promise.race([
				actionPromise,
				anotherActionPromise,
				new Promise<void>((resolve) => setTimeout(resolve, 10))
			]).then(() => {
				assert.isFalse(gotAction);
				assert.isFalse(againGotAction);
				fulfil();
				return Promise.all([actionPromise, anotherActionPromise]);
			}).then(() => {
				assert.isTrue(gotAction);
				assert.isTrue(againGotAction);
			});
		},

		'the produced action must be unique'() {
			const action = createAction();
			const app = createApp();
			app.registerAction('foo', action);
			app.registerActionFactory('bar', () => action);

			return rejects(app.getAction('bar'), Error, 'Could not add action, already registered as action with identity foo');
		},

		'destroying the returned handle': {
			'deregisters the factory'() {
				const app = createApp();
				const handle = app.registerActionFactory('foo', createAction);
				handle.destroy();

				assert.isFalse(app.hasAction('foo'));
			},

			'prevents a pending action instance from being registered'() {
				const action = createAction();
				let fulfil: () => void;
				const promise = new Promise((resolve) => {
					fulfil = () => resolve(action);
				});

				const app = createApp();
				const handle = app.registerActionFactory('foo', () => promise);

				app.getAction('foo');
				handle.destroy();
				fulfil();

				return new Promise((resolve) => setTimeout(resolve, 10)).then(() => {
					assert.throws(() => app.identifyAction(action));
				});
			},

			'deregisters the action if it has already been created'() {
				const app = createApp();
				const handle = app.registerActionFactory('foo', createAction);

				return app.getAction('foo').then(() => {
					handle.destroy();

					assert.isFalse(app.hasAction('foo'));
				});
			},

			'a second time has no effect'() {
				const action = createAction();

				const app = createApp();
				const handle = app.registerActionFactory('foo', () => action);

				return app.getAction('foo').then(() => {
					handle.destroy();
					handle.destroy();

					assert.isFalse(app.hasAction('foo'));
				});
			}
		}
	},

	'#loadDefinition': {
		'registers multiple'() {
			const expected = {
				foo: createAction(),
				bar: createAction()
			};

			const app = createApp();
			app.loadDefinition({
				actions: [
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

			assert.isTrue(app.hasAction('foo'));
			assert.isTrue(app.hasAction('bar'));

			return Promise.all([
				strictEqual(app.getAction('foo'), expected.foo),
				strictEqual(app.getAction('bar'), expected.bar)
			]);
		},

		'getAction() calls configure() on the action'() {
			let called = false;
			const action = createAction();
			action.configure = () => { called = true; };

			const app = createApp();
			app.loadDefinition({
				actions: [
					{
						id: 'foo',
						factory: () => action
					}
				]
			});

			return app.getAction('foo').then(() => {
				assert.isTrue(called);
			});
		},

		'action.configure() is passed a combined registry'() {
			let registry: CombinedRegistry = null;
			const action = createAction();
			action.configure = (actual: CombinedRegistry) => { registry = actual; };

			const app = createApp();
			app.loadDefinition({
				actions: [
					{
						id: 'foo',
						factory: () => action
					}
				]
			});

			return app.getAction('foo').then(() => {
				isCombinedRegistry(registry);
			});
		},

		'getAction() rejects if action.configure() throws'() {
			const expected = new Error();
			const action = createAction();
			action.configure = () => { throw expected; };

			const app = createApp();
			app.loadDefinition({
				actions: [
					{
						id: 'foo',
						factory: () => action
					}
				]
			});

			return strictEqual(invert(app.getAction('foo')), expected);
		},

		'getAction() rejects if action.configure() returns a rejected promise'() {
			const expected = new Error();
			const action = createAction();
			action.configure = () => Promise.reject(expected);

			const app = createApp();
			app.loadDefinition({
				actions: [
					{
						id: 'foo',
						factory: () => action
					}
				]
			});

			return strictEqual(invert(app.getAction('foo')), expected);
		},

		'getAction() remains pending until action.configure() returns a fulfilled promise'() {
			let fulfil: Function;
			const promise = new Promise<void>((resolve) => {
				fulfil = resolve;
			});

			const action = createAction();
			action.configure = () => promise;

			const app = createApp();
			app.loadDefinition({
				actions: [
					{
						id: 'foo',
						factory: () => action
					}
				]
			});

			let gotAction = false;
			const actionPromise = app.getAction('foo').then((action) => {
				gotAction = true;
			});
			return Promise.race([actionPromise, new Promise<void>((resolve) => setTimeout(resolve, 10))]).then(() => {
				assert.isFalse(gotAction);
				fulfil();
				return actionPromise;
			}).then(() => {
				assert.isTrue(gotAction);
			});
		},

		'with stateFrom option': {
			'refers to a store that is not registered'() {
				const app = createApp();
				app.loadDefinition({
					actions: [
						{
							id: 'foo',
							factory: createAction,
							stateFrom: 'store'
						}
					]
				});

				return rejects(app.getAction('foo'), Error);
			},

			'passes the resolved store to the action factory'() {
				const action = createAction();
				let received: StoreLike = null;

				const store = createStore();

				const app = createApp();
				app.registerStore('store', store);
				app.loadDefinition({
					actions: [
						{
							id: 'foo',
							factory(_: any, store: StoreLike) {
								received = store;
								return action;
							},
							stateFrom: 'store'
						}
					]
				});

				return app.getAction('foo').then(() => {
					assert.strictEqual(received, store);
				});
			},

			'stateFrom may be an actual store, rather than a store identifier'() {
				const action = createAction();
				let received: StoreLike = null;

				const store = createStore();

				const app = createApp();
				app.loadDefinition({
					actions: [
						{
							id: 'foo',
							factory(_: any, store: StoreLike) {
								received = store;
								return action;
							},
							stateFrom: store
						}
					]
				});

				return app.getAction('foo').then(() => {
					assert.strictEqual(received, store);
				});
			},

			'overrides the default action store'() {
				const action = createAction();
				let received: StoreLike = null;

				const defaultActionStore = createStore();
				const app = createApp({ defaultActionStore });

				const store = createStore();
				app.loadDefinition({
					actions: [
						{
							id: 'foo',
							factory(_: any, store: StoreLike) {
								received = store;
								return action;
							},
							stateFrom: store
						}
					]
				});

				return app.getAction('foo').then(() => {
					assert.strictEqual(received, store);
				});
			}
		},

		'with state option': {
			'state is added to the defined store before factory is called'() {
				let calls: string[] = [];
				let addArgs: any[][] = [];

				const store = createStore();
				(<any> store).add = (...args: any[]) => {
					calls.push('add');
					addArgs.push(args);
					return Promise.resolve();
				};

				const state = { foo: 'bar' };

				const app = createApp();
				app.loadDefinition({
					actions: [
						{
							id: 'foo',
							factory() {
								calls.push('factory');
								return createAction();
							},
							state,
							stateFrom: store
						}
					]
				});

				return app.getAction('foo').then(() => {
					assert.deepEqual(calls, ['add', 'factory']);
					assert.deepEqual(addArgs, [[{ foo: 'bar' }, { id: 'foo' }]]);
				});
			},

			'state is added to the default store before factory is called'() {
				let calls: string[] = [];
				let addArgs: any[][] = [];

				const store = createStore();
				(<any> store).add = (...args: any[]) => {
					calls.push('add');
					addArgs.push(args);
					return Promise.resolve();
				};

				const state = { foo: 'bar' };

				const app = createApp();
				app.defaultActionStore = store;
				app.loadDefinition({
					actions: [
						{
							id: 'foo',
							factory() {
								calls.push('factory');
								return createAction();
							},
							state
						}
					]
				});

				return app.getAction('foo').then(() => {
					assert.deepEqual(calls, ['add', 'factory']);
					assert.deepEqual(addArgs, [[{ foo: 'bar' }, { id: 'foo' }]]);
				});
			},

			'the factory is called even if adding state fails'() {
				let calls: string[] = [];

				const store = createStore();
				(<any> store).add = (...args: any[]) => {
					calls.push('add');
					return Promise.reject(new Error());
				};

				const state = { foo: 'bar' };

				const app = createApp();
				app.loadDefinition({
					actions: [
						{
							id: 'foo',
							factory() {
								calls.push('factory');
								return createAction();
							},
							state,
							stateFrom: store
						}
					]
				});

				return app.getAction('foo').then(() => {
					assert.deepEqual(calls, ['add', 'factory']);
				});
			},

			'the factory is called even if there is no store to add state to'() {
				let calls: string[] = [];

				const app = createApp();
				app.loadDefinition({
					actions: [
						{
							id: 'foo',
							factory() {
								calls.push('factory');
								return createAction();
							},
							state: { foo: 'bar' }
						}
					]
				});

				return app.getAction('foo').then(() => {
					assert.deepEqual(calls, ['factory']);
				});
			}
		},

		'requires factory or instance option'() {
			assert.throws(() => {
				createApp().loadDefinition({
					actions: [
						{
							id: 'foo'
						}
					]
				});
			}, TypeError, 'Action definitions must specify either the factory or instance option');
		},

		'with factory option': {
			'can be a method'() {
				const expected = createAction();

				const app = createApp();
				app.loadDefinition({
					actions: [
						{
							id: 'foo',
							factory: () => expected
						}
					]
				});

				return strictEqual(app.getAction('foo'), expected);
			},

			'can be a module identifier'() {
				const expected = createAction();
				stubActionFactory(() => expected);

				const app = createApp({ toAbsMid });
				app.loadDefinition({
					actions: [
						{
							id: 'foo',
							factory: '../../fixtures/action-factory'
						}
					]
				});

				return strictEqual(app.getAction('foo'), expected);
			},

			'cannot get action if identified module has no default factory export'() {
				const app = createApp({ toAbsMid });
				app.loadDefinition({
					actions: [
						{
							id: 'foo',
							factory: '../../fixtures/no-factory-export'
						}
					]
				});

				return rejects(app.getAction('foo'), Error, 'Could not resolve \'../../fixtures/no-factory-export\' to an action factory function');
			},

			'factory is not called until the action is needed'() {
				const called = {
					foo: false,
					bar: false
				};
				stubActionFactory(() => {
					called.bar = true;
					return createAction();
				});

				const app = createApp({ toAbsMid });
				app.loadDefinition({
					actions: [
						{
							id: 'foo',
							factory() {
								called.foo = true;
								return createAction();
							}
						},
						{
							id: 'bar',
							factory: '../../fixtures/action-factory'
						}
					]
				});

				assert.isFalse(called.foo);
				assert.isFalse(called.bar);

				const promise = app.getAction('foo');
				assert.isFalse(called.foo);

				return promise.then(() => {
					assert.isTrue(called.foo);
					assert.isFalse(called.bar);

					const promise = app.getAction('bar');
					assert.isFalse(called.bar);
					return promise;
				}).then(() => {
					assert.isTrue(called.bar);
				});
			},

			'factory may return a promise': {
				'should resolve with the action'() {
					const expected = {
						foo: createAction(),
						bar: createAction()
					};
					stubActionFactory(() => {
						return Promise.resolve(expected.bar);
					});

					const app = createApp({ toAbsMid });
					app.loadDefinition({
						actions: [
							{
								id: 'foo',
								factory: () => Promise.resolve(expected.foo)
							},
							{
								id: 'bar',
								factory: '../../fixtures/action-factory'
							}
						]
					});

					return Promise.all([
						strictEqual(app.getAction('foo'), expected.foo),
						strictEqual(app.getAction('bar'), expected.bar)
					]);
				},

				'rejections are propagated'() {
					const expected = {
						foo: new Error(),
						bar: new Error()
					};
					stubActionFactory(() => {
						return Promise.reject(expected.bar);
					});

					const app = createApp({ toAbsMid });
					app.loadDefinition({
						actions: [
							{
								id: 'foo',
								factory: () => Promise.reject(expected.foo)
							},
							{
								id: 'bar',
								factory: '../../fixtures/action-factory'
							}
						]
					});

					return Promise.all([
						strictEqual(invert(app.getAction('foo')), expected.foo),
						strictEqual(invert(app.getAction('bar')), expected.bar)
					]);
				}
			},

			'factory is passed a combined registry'() {
				let registries: { foo: CombinedRegistry, bar: CombinedRegistry } = {
					foo: null,
					bar: null
				};
				stubActionFactory((registry: CombinedRegistry) => {
					registries.bar = registry;
					return createAction();
				});

				const app = createApp({ toAbsMid });
				app.loadDefinition({
					actions: [
						{
							id: 'foo',
							factory(registry) {
								registries.foo = registry;
								return createAction();
							}
						},
						{
							id: 'bar',
							factory: '../../fixtures/action-factory'
						}
					]
				});

				return Promise.all([
					app.getAction('foo'),
					app.getAction('bar')
				]).then(() => {
					isCombinedRegistry(registries.foo);
					isCombinedRegistry(registries.bar);
				});
			},

			'if a default action store is provided, and no stateFrom option, the factory is passed the default store'() {
				const action = createAction();
				let received: StoreLike = null;

				const defaultActionStore = createStore();
				const app = createApp({ defaultActionStore });

				app.loadDefinition({
					actions: [
						{
							id: 'foo',
							factory(_: any, store: StoreLike) {
								received = store;
								return action;
							}
						}
					]
				});

				return app.getAction('foo').then(() => {
					assert.strictEqual(received, defaultActionStore);
				});
			}
		},

		'with instance option': {
			'can be an instance'() {
				const expected = createAction();

				const app = createApp();
				app.loadDefinition({
					actions: [
						{
							id: 'foo',
							instance: expected
						}
					]
				});

				return strictEqual(app.getAction('foo'), expected);
			},

			'can be a module identifier'() {
				const app = createApp({ toAbsMid });
				app.loadDefinition({
					actions: [
						{
							id: 'foo',
							instance: '../../fixtures/action-instance'
						}
					]
				});

				return strictEqual(app.getAction('foo'), actionInstanceFixture);
			},

			'cannot get action if identified module has no default instance export'() {
				const app = createApp({ toAbsMid });
				app.loadDefinition({
					actions: [
						{
							id: 'foo',
							instance: '../../fixtures/no-instance-export'
						}
					]
				});

				return rejects(app.getAction('foo'), Error, 'Could not resolve \'../../fixtures/no-instance-export\' to an action instance');
			},

			'stateFrom option is not allowed'() {
				assert.throws(() => {
					createApp().loadDefinition({
						actions: [
							{
								id: 'foo',
								instance: createAction(),
								stateFrom: 'store'
							}
						]
					});
				}, TypeError, 'Cannot specify stateFrom option when action definition points directly at an instance');
			},

			'state option is not allowed'() {
				assert.throws(() => {
					createApp().loadDefinition({
						actions: [
							{
								id: 'foo',
								instance: createAction(),
								state: {}
							}
						]
					});
				}, TypeError, 'Cannot specify state option when action definition points directly at an instance');
			},

			'only configures action when getAction() is called'() {
				let called = false;
				const action = createAction();
				action.configure = () => { called = true; };

				const app = createApp();
				app.loadDefinition({
					actions: [
						{
							id: 'foo',
							instance: action
						}
					]
				});

				assert.isFalse(called);
				return app.getAction('foo').then(() => {
					assert.isTrue(called);
				});
			}
		}
	}
});

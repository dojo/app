import Promise from 'dojo-shim/Promise';
import * as registerSuite from 'intern!object';
import * as assert from 'intern/chai!assert';
import { Require } from 'dojo-interfaces/loader';
declare const require: Require;

import createApp, {
	ActionFactoryOptions,
	RegistryProvider,
	StoreLike
} from 'src/createApp';

import { stub as stubActionFactory } from '../../fixtures/action-factory';
import actionInstanceFixture from '../../fixtures/action-instance';
import {
	createAction,
	createStore,
	invert,
	rejects,
	strictEqual
} from '../../support/createApp';
import { defer } from '../../support/util';

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

		'calls configure() on the action when it is needed'() {
			let called = false;
			const action = createAction();
			action.configure = () => { called = true; };

			const app = createApp();
			app.registerAction('foo', action);

			assert.isFalse(called);
			return app.getAction('foo').then(() => {
				assert.isTrue(called);
			});
		},

		'action is only configured once'() {
			let count = 0;
			const action = createAction();
			action.configure = () => { count++; };

			const app = createApp();
			app.registerAction('foo', action);

			return Promise.all([
				app.getAction('foo'),
				app.getAction('foo')
			]).then(() => {
				assert.equal(count, 1);
			});
		},

		'action.configure() is passed the registryProvider'() {
			let registry: RegistryProvider;
			const action = createAction();
			action.configure = (actual: RegistryProvider) => { registry = actual; };

			const app = createApp();
			app.registerAction('foo', action);

			return app.getAction('foo').then(() => {
				assert.strictEqual(registry, app.registryProvider);
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

		'factory is called with an options object that has a registryProvider property'() {
			let actual: ActionFactoryOptions;

			const app = createApp();
			app.registerActionFactory('foo', (options) => {
				actual = options;
				return createAction();
			});

			return app.getAction('foo').then(() => {
				assert.strictEqual(actual.registryProvider, app.registryProvider);
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

		'action.configure() is passed the registryProvider'() {
			let registry: RegistryProvider;
			const action = createAction();
			action.configure = (actual: RegistryProvider) => { registry = actual; };

			const app = createApp();
			app.registerActionFactory('foo', () => action);

			return app.getAction('foo').then(() => {
				assert.strictEqual(registry, app.registryProvider);
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
				const { resolve, promise } = defer();

				const app = createApp();
				const handle = app.registerActionFactory('foo', () => promise);

				app.getAction('foo');
				handle.destroy();
				resolve(action);

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

		'action.configure() is passed the registryProvider'() {
			let registry: RegistryProvider;
			const action = createAction();
			action.configure = (actual: RegistryProvider) => { registry = actual; };

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
				assert.strictEqual(registry, app.registryProvider);
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

			'factory is passed a store reference in its stateFrom option'() {
				const expected = createStore();
				let actual: StoreLike;

				const app = createApp();
				app.registerStore('store', expected);
				app.loadDefinition({
					actions: [
						{
							id: 'foo',
							factory(options) {
								actual = options.stateFrom!;
								return createAction();
							},
							stateFrom: 'store'
						}
					]
				});

				return app.getAction('foo').then(() => {
					assert.strictEqual(actual, expected);
				});
			},

			'stateFrom may be an actual store, rather than a store identifier'() {
				const expected = createStore();
				let actual: StoreLike;

				const app = createApp();
				app.loadDefinition({
					actions: [
						{
							id: 'foo',
							factory(options) {
								actual = options.stateFrom!;
								return createAction();
							},
							stateFrom: expected
						}
					]
				});

				return app.getAction('foo').then(() => {
					assert.strictEqual(actual, expected);
				});
			},

			'overrides the default action store'() {
				const expected = createStore();
				let actual: StoreLike;

				const defaultActionStore = createStore();
				const app = createApp({ defaultActionStore });
				app.loadDefinition({
					actions: [
						{
							id: 'foo',
							factory(options) {
								actual = options.stateFrom!;
								return createAction();
							},
							stateFrom: expected
						}
					]
				});

				return app.getAction('foo').then(() => {
					assert.strictEqual(actual, expected);
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

			'factory is always passed registryProvider options'() {
				let fooOptions: ActionFactoryOptions;
				let barOptions: ActionFactoryOptions;
				stubActionFactory((options) => {
					barOptions = options;
					return createAction();
				});

				const app = createApp({ toAbsMid });
				app.loadDefinition({
					actions: [
						{
							id: 'foo',
							factory(options) {
								fooOptions = options;
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
					assert.strictEqual(fooOptions.registryProvider, app.registryProvider);
					assert.strictEqual(barOptions.registryProvider, app.registryProvider);
				});
			},

			'if a default action store is provided, and no stateFrom option, the factory is passed the default store'() {
				const action = createAction();
				let received: StoreLike;

				const defaultActionStore = createStore();
				const app = createApp({ defaultActionStore });

				app.loadDefinition({
					actions: [
						{
							id: 'foo',
							factory(options) {
								received = options.stateFrom!;
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

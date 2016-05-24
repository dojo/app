import { Handle } from 'dojo-core/interfaces';
import Promise from 'dojo-core/Promise';
import * as registerSuite from 'intern!object';
import * as assert from 'intern/chai!assert';

import App, {
	ActionLike,
	CombinedRegistry,
	Identifier,
	StoreLike,
	WidgetLike
} from 'src/App';

import { stub as stubActionFactory } from '../fixtures/action-factory';
import { stub as stubStoreFactory } from '../fixtures/store-factory';
import { stub as stubWidgetFactory } from '../fixtures/widget-factory';

const { toAbsMid } = require;

function rejects(promise: Promise<any>, errType: Function, msg?: string): Promise<void> {
	return promise.then(() => {
		throw new Error('Promise should have rejected');
	}, (err: any) => {
		assert.throws(() => { throw err; }, errType);
		if (msg) {
			assert.strictEqual(err.message, msg);
		}
	});
}

function invert(promise: Promise<any>): Promise<any> {
	return promise.then((value) => {
		throw value;
	}, (err) => {
		return err;
	});
}

function strictEqual(promise: Promise<any>, expected: any): Promise<void> {
	return promise.then((actual: any) => {
		assert.strictEqual(actual, expected);
	});
}

function isCombinedRegistry(registry: CombinedRegistry): void {
	assert.isFunction(registry.getAction);
	assert.isFunction(registry.hasAction);
	assert.isFunction(registry.getStore);
	assert.isFunction(registry.hasStore);
	assert.isFunction(registry.getWidget);
	assert.isFunction(registry.hasWidget);
}

function createAction() {
	return <ActionLike> {
		register (registry: Object) {}
	};
}

function createStore() {
	return <StoreLike> {};
}

function createWidget() {
	return <WidgetLike> {};
}

registerSuite({
	name: 'App',

	'#getAction': {
		'no registered action'() {
			return rejects(new App().getAction('foo'), Error);
		},

		'provides registered action'() {
			const expected = createAction();

			const app = new App();
			app.registerAction('foo', expected);

			return strictEqual(app.getAction('foo'), expected);
		}
	},

	'#hasAction': {
		'no registered action'() {
			assert.isFalse(new App().hasAction('foo'));
		},

		'registered action'() {
			const app = new App();
			app.registerAction('foo', createAction());

			assert.isTrue(app.hasAction('foo'));
		}
	},

	'#registerAction': {
		'calls register() on the action'() {
			let called = false;
			const action = createAction();
			action.register = () => { called = true; };

			const app = new App();
			app.registerAction('foo', action);

			assert.isTrue(called);
		},

		'action.register() is passed a combined registry'() {
			let registry: CombinedRegistry = null;
			const action = createAction();
			action.register = (actual: CombinedRegistry) => { registry = actual; };

			const app = new App();
			app.registerAction('foo', action);

			isCombinedRegistry(registry);
		},

		'destroying the returned handle': {
			'deregisters the action'() {
				const app = new App();
				const handle = app.registerAction('foo', createAction());

				handle.destroy();
				assert.isFalse(app.hasAction('foo'));
			},

			'destroys the action.register() handle, if any'() {
				let destroyed = false;
				const nested = { destroy() { destroyed = true; } };
				const action = createAction();
				action.register = () => nested;

				const handle = new App().registerAction('foo', action);
				handle.destroy();

				assert.isTrue(destroyed);
			},

			'a second time has no effect'() {
				let destroyed = false;
				const nested = { destroy() { destroyed = true; } };
				const action = createAction();
				action.register = () => nested;

				const app = new App();
				const handle = app.registerAction('foo', action);

				handle.destroy();
				destroyed = false;
				handle.destroy();

				assert.isFalse(app.hasAction('foo'));
				assert.isFalse(destroyed);
			}
		}
	},

	'#registerActionFactory': {
		'hasAction returns true after'() {
			const app = new App();
			app.registerActionFactory('foo', createAction);

			assert.isTrue(app.hasAction('foo'));
		},

		'factory is not called until the action is needed'() {
			let called = false;

			const app = new App();
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

			const app = new App();
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

				const app = new App();
				app.registerActionFactory('foo', () => Promise.resolve(expected));

				return strictEqual(app.getAction('foo'), expected);
			},

			'rejections are propagated'() {
				const expected = new Error();

				const app = new App();
				app.registerActionFactory('foo', () => Promise.reject(expected));

				return strictEqual(invert(app.getAction('foo')), expected);
			}
		},

		'factory is passed a combined registry'() {
			let registry: CombinedRegistry = null;

			const app = new App();
			app.registerActionFactory('foo', (actual) => {
				registry = actual;
				return createAction();
			});

			return app.getAction('foo').then(() => {
				isCombinedRegistry(registry);
			});
		},

		'calls register() on the action'() {
			let called = false;
			const action = createAction();
			action.register = () => { called = true; };

			const app = new App();
			app.registerActionFactory('foo', () => action);

			return app.getAction('foo').then(() => {
				assert.isTrue(called);
			});
		},

		'action.register() is passed a combined registry'() {
			let registry: CombinedRegistry = null;
			const action = createAction();
			action.register = (actual: CombinedRegistry) => { registry = actual; };

			const app = new App();
			app.registerActionFactory('foo', () => action);

			return app.getAction('foo').then(() => {
				isCombinedRegistry(registry);
			});
		},

		'destroying the returned handle': {
			'deregisters the factory'() {
				const app = new App();
				const handle = app.registerActionFactory('foo', createAction);
				handle.destroy();

				assert.isFalse(app.hasAction('foo'));
			},

			'deregisters the action if it has already been created'() {
				const app = new App();
				const handle = app.registerActionFactory('foo', createAction);

				return app.getAction('foo').then(() => {
					handle.destroy();

					assert.isFalse(app.hasAction('foo'));
				});
			},

			'prevents action.register() being called if destroyed during action creation'() {
				let called = false;
				const action = createAction();
				action.register = () => { called = true; };

				let finishCreate: Function = null;
				const creation = new Promise<ActionLike>((resolve) => {
					finishCreate = () => resolve(action);
				});

				const app = new App();
				const handle = app.registerActionFactory('foo', () => creation);
				const promise = app.getAction('foo');

				handle.destroy();
				finishCreate();

				return promise.then(() => {
					assert.isFalse(called);
				});
			},

			'destroys the action.register() handle, if any'() {
				let destroyed = false;
				const nested = { destroy() { destroyed = true; } };
				const action = createAction();
				action.register = () => nested;

				const app = new App();
				const handle = app.registerActionFactory('foo', () => action);

				return app.getAction('foo').then(() => {
					handle.destroy();

					assert.isTrue(destroyed);
				});
			},

			'a second time has no effect'() {
				let destroyed = false;
				const nested = { destroy() { destroyed = true; } };
				const action = createAction();
				action.register = () => nested;

				const app = new App();
				const handle = app.registerActionFactory('foo', () => action);

				return app.getAction('foo').then(() => {
					handle.destroy();
					destroyed = false;
					handle.destroy();

					assert.isFalse(app.hasAction('foo'));
					assert.isFalse(destroyed);
				});
			}
		}
	},

	'#getStore': {
		'no registered store'() {
			return rejects(new App().getStore('foo'), Error);
		},

		'provides registered store'() {
			const expected = createStore();

			const app = new App();
			app.registerStore('foo', expected);

			return strictEqual(app.getStore('foo'), expected);
		}
	},

	'#hasStore': {
		'no registered store'() {
			assert.isFalse(new App().hasStore('foo'));
		},

		'registered store'() {
			const app = new App();
			app.registerStore('foo', createStore());

			assert.isTrue(app.hasStore('foo'));
		}
	},

	'#registerStore': {
		'destroying the returned handle': {
			'deregisters the action'() {
				const store = createStore();

				const app = new App();
				const handle = app.registerStore('foo', store);
				handle.destroy();

				assert.isFalse(app.hasStore('foo'));
			},

			'a second time has no effect'() {
				const store = createStore();

				const app = new App();
				const handle = app.registerStore('foo', store);
				handle.destroy();
				handle.destroy();

				assert.isFalse(app.hasStore('foo'));
			}
		}
	},

	'#registerStoreFactory': {
		'hasStore returns true after'() {
			const app = new App();
			app.registerStoreFactory('foo', createStore);

			assert.isTrue(app.hasStore('foo'));
		},

		'factory is not called until the store is needed'() {
			let called = false;

			const app = new App();
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

			const app = new App();
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

				const app = new App();
				app.registerStoreFactory('foo', () => Promise.resolve(expected));

				return strictEqual(app.getStore('foo'), expected);
			},

			'rejections are propagated'() {
				const expected = new Error();

				const app = new App();
				app.registerStoreFactory('foo', () => Promise.reject(expected));

				return strictEqual(invert(app.getStore('foo')), expected);
			}
		},

		'destroying the returned handle': {
			'deregisters the factory'() {
				const app = new App();
				const handle = app.registerStoreFactory('foo', createStore);
				handle.destroy();

				assert.isFalse(app.hasStore('foo'));
			},

			'deregisters the store if it has already been created'() {
				const app = new App();
				const handle = app.registerStoreFactory('foo', createStore);

				return app.getStore('foo').then(() => {
					handle.destroy();

					assert.isFalse(app.hasStore('foo'));
				});
			},

			'a second time has no effect'() {
				const app = new App();
				const handle = app.registerStoreFactory('foo', createStore);

				return app.getStore('foo').then(() => {
					handle.destroy();
					handle.destroy();

					assert.isFalse(app.hasStore('foo'));
				});
			}
		}
	},

	'#getWidget': {
		'no registered widget'() {
			return rejects(new App().getWidget('foo'), Error);
		},

		'provides registered widget'() {
			const expected = createWidget();

			const app = new App();
			app.registerWidget('foo', expected);

			return strictEqual(app.getWidget('foo'), expected);
		}
	},

	'#hasWidget': {
		'no registered widget'() {
			assert.isFalse(new App().hasWidget('foo'));
		},

		'registered widget'() {
			const app = new App();
			app.registerWidget('foo', createWidget());

			assert.isTrue(app.hasWidget('foo'));
		}
	},

	'#registerWidget': {
		'destroying the returned handle': {
			'deregisters the action'() {
				const widget = createWidget();

				const app = new App();
				const handle = app.registerWidget('foo', widget);
				handle.destroy();

				assert.isFalse(app.hasWidget('foo'));
			},

			'a second time has no effect'() {
				const widget = createWidget();

				const app = new App();
				const handle = app.registerWidget('foo', widget);

				handle.destroy();
				handle.destroy();

				assert.isFalse(app.hasWidget('foo'));
			}
		}
	},

	'#registerWidgetFactory': {
		'hasWidget returns true after'() {
			const app = new App();
			app.registerWidgetFactory('foo', createWidget);

			assert.isTrue(app.hasWidget('foo'));
		},

		'factory is not called until the widget is needed'() {
			let called = false;

			const app = new App();
			app.registerWidgetFactory('foo', function(): WidgetLike {
				called = true;
				return createWidget();
			});

			assert.isFalse(called);

			app.hasWidget('foo');
			assert.isFalse(called);

			const promise = app.getWidget('foo');
			assert.isFalse(called);

			return promise.then(() => {
				assert.isTrue(called);
			});
		},

		'factory is only called once'() {
			let count = 0;
			const expected = createWidget();

			const app = new App();
			app.registerWidgetFactory('foo', function(): WidgetLike {
				count++;
				return expected;
			});

			return Promise.all([
				strictEqual(app.getWidget('foo'), expected),
				strictEqual(app.getWidget('foo'), expected)
			]).then(() => {
				assert.equal(count, 1);
			});
		},

		'factory may return a promise': {
			'should resolve with the widget'() {
				const expected = createWidget();

				const app = new App();
				app.registerWidgetFactory('foo', () => Promise.resolve(expected));

				return strictEqual(app.getWidget('foo'), expected);
			},

			'rejections are propagated'() {
				const expected = new Error();

				const app = new App();
				app.registerWidgetFactory('foo', () => Promise.reject(expected));

				return strictEqual(invert(app.getWidget('foo')), expected);
			}
		},

		'destroying the returned handle': {
			'deregisters the factory'() {
				const app = new App();
				const handle = app.registerWidgetFactory('foo', createWidget);
				handle.destroy();

				assert.isFalse(app.hasWidget('foo'));
			},

			'deregisters the widget if it has already been created'() {
				const app = new App();
				const handle = app.registerWidgetFactory('foo', createWidget);

				return app.getWidget('foo').then(() => {
					handle.destroy();

					assert.isFalse(app.hasWidget('foo'));
				});
			},

			'a second time has no effect'() {
				const app = new App();
				const handle = app.registerWidgetFactory('foo', createWidget);

				return app.getWidget('foo').then(() => {
					handle.destroy();
					handle.destroy();

					assert.isFalse(app.hasWidget('foo'));
				});
			}
		}
	},

	'#loadDefinition': {
		'actions': {
			'registers multiple'() {
				const expected = {
					foo: createAction(),
					bar: createAction()
				};

				const app = new App();
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

			'calls register() on the action'() {
				let called = false;
				const action = createAction();
				action.register = () => { called = true; };

				const app = new App();
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

			'action.register() is passed a combined registry'() {
				let registry: CombinedRegistry = null;
				const action = createAction();
				action.register = (actual: CombinedRegistry) => { registry = actual; };

				const app = new App();
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

			'with stateFrom option': {
				'refers to a store that is not registered'() {
					const app = new App();
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

				'makes the action observe state from the store'() {
					const action = createAction();
					const handle: Handle = { destroy() {} };
					const received: { handle: Object, id: Identifier, store: StoreLike } = {
						handle: null,
						id: null,
						store: null
					};
					action.observeState = (id, store) => {
						received.id = id;
						received.store = store;
						return handle;
					};
					action.own = (handle: Handle) => {
						received.handle = handle;
						return handle;
					};

					const store = createStore();

					const app = new App();
					app.registerStore('store', store);
					app.loadDefinition({
						actions: [
							{
								id: 'foo',
								factory: () => action,
								stateFrom: 'store'
							}
						]
					});

					return app.getAction('foo').then(() => {
						assert.strictEqual(received.handle, handle);
						assert.strictEqual(received.id, 'foo');
						assert.strictEqual(received.store, store);
					});
				}
			},

			'with factory option': {
				'can be a method'() {
					const expected = createAction();

					const app = new App();
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

					const app = new App({ toAbsMid });
					app.loadDefinition({
						actions: [
							{
								id: 'foo',
								factory: '../fixtures/action-factory'
							}
						]
					});

					return strictEqual(app.getAction('foo'), expected);
				},

				'cannot get action if identified module has no default factory export'() {
					const app = new App({ toAbsMid });
					app.loadDefinition({
						actions: [
							{
								id: 'foo',
								factory: '../fixtures/no-factory-export'
							}
						]
					});

					return rejects(app.getAction('foo'), Error, 'Could not resolve \'../fixtures/no-factory-export\' to an action factory function');
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

					const app = new App({ toAbsMid });
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
								factory: '../fixtures/action-factory'
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

						const app = new App({ toAbsMid });
						app.loadDefinition({
							actions: [
								{
									id: 'foo',
									factory: () => Promise.resolve(expected.foo)
								},
								{
									id: 'bar',
									factory: '../fixtures/action-factory'
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

						const app = new App({ toAbsMid });
						app.loadDefinition({
							actions: [
								{
									id: 'foo',
									factory: () => Promise.reject(expected.foo)
								},
								{
									id: 'bar',
									factory: '../fixtures/action-factory'
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

					const app = new App({ toAbsMid });
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
								factory: '../fixtures/action-factory'
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
				}
			}
		},

		'stores': {
			'registers multiple'() {
				const expected = {
					foo: createStore(),
					bar: createStore()
				};

				const app = new App();
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

			'with factory option': {
				'can be a method'() {
					const expected = createStore();

					const app = new App();
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

					const app = new App({ toAbsMid });
					app.loadDefinition({
						stores: [
							{
								id: 'foo',
								factory: '../fixtures/store-factory'
							}
						]
					});

					return strictEqual(app.getStore('foo'), expected);
				},

				'cannot get store if identified module has no default factory export'() {
					const app = new App({ toAbsMid });
					app.loadDefinition({
						stores: [
							{
								id: 'foo',
								factory: '../fixtures/no-factory-export'
							}
						]
					});

					return rejects(app.getStore('foo'), Error, 'Could not resolve \'../fixtures/no-factory-export\' to a store factory function');
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

					const app = new App({ toAbsMid });
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
								factory: '../fixtures/store-factory'
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

						const app = new App({ toAbsMid });
						app.loadDefinition({
							stores: [
								{
									id: 'foo',
									factory: () => Promise.resolve(expected.foo)
								},
								{
									id: 'bar',
									factory: '../fixtures/store-factory'
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

						const app = new App({ toAbsMid });
						app.loadDefinition({
							stores: [
								{
									id: 'foo',
									factory: () => Promise.reject(expected.foo)
								},
								{
									id: 'bar',
									factory: '../fixtures/store-factory'
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

					const app = new App({ toAbsMid });
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
								factory: '../fixtures/store-factory',
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
			}
		},

		'widgets': {
			'registers multiple'() {
				const expected = {
					foo: createWidget(),
					bar: createWidget()
				};

				const app = new App();
				app.loadDefinition({
					widgets: [
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

				assert.isTrue(app.hasWidget('foo'));
				assert.isTrue(app.hasWidget('bar'));

				return Promise.all([
					strictEqual(app.getWidget('foo'), expected.foo),
					strictEqual(app.getWidget('bar'), expected.bar)
				]);
			},

			'options cannot include the id property'() {
				assert.throws(() => {
					new App().loadDefinition({
						widgets: [
							{
								id: 'foo',
								factory: createWidget,
								options: {
									id: 'bar'
								}
							}
						]
					});
				}, Error, 'id and stateFrom options should be in the widget definition itself, not its options value');
			},

			'options cannot include the stateFrom property'() {
				assert.throws(() => {
					new App().loadDefinition({
						widgets: [
							{
								id: 'foo',
								factory: createWidget,
								options: {
									stateFrom: 'bar'
								}
							}
						]
					});
				}, Error, 'id and stateFrom options should be in the widget definition itself, not its options value');
			},

			'with stateFrom option': {
				'refers to a store that is not registered'() {
					const app = new App();
					app.loadDefinition({
						widgets: [
							{
								id: 'foo',
								factory: createWidget,
								stateFrom: 'store'
							}
						]
					});

					return rejects(app.getWidget('foo'), Error);
				}
			},

			'with factory option': {
				'can be a method'() {
					const expected = createWidget();

					const app = new App();
					app.loadDefinition({
						widgets: [
							{
								id: 'foo',
								factory: () => expected
							}
						]
					});

					return strictEqual(app.getWidget('foo'), expected);
				},

				'can be a module identifier'() {
					const expected = createWidget();
					stubWidgetFactory(() => expected);

					const app = new App({ toAbsMid });
					app.loadDefinition({
						widgets: [
							{
								id: 'foo',
								factory: '../fixtures/widget-factory'
							}
						]
					});

					return strictEqual(app.getWidget('foo'), expected);
				},

				'cannot get widget if identified module has no default factory export'() {
					const app = new App({ toAbsMid });
					app.loadDefinition({
						widgets: [
							{
								id: 'foo',
								factory: '../fixtures/no-factory-export'
							}
						]
					});

					return rejects(app.getWidget('foo'), Error, 'Could not resolve \'../fixtures/no-factory-export\' to a widget factory function');
				},

				'factory is not called until the widget is needed'() {
					const called = {
						foo: false,
						bar: false
					};
					stubWidgetFactory(() => {
						called.bar = true;
						return createWidget();
					});

					const app = new App({ toAbsMid });
					app.loadDefinition({
						widgets: [
							{
								id: 'foo',
								factory() {
									called.foo = true;
									return createWidget();
								}
							},
							{
								id: 'bar',
								factory: '../fixtures/widget-factory'
							}
						]
					});

					assert.isFalse(called.foo);
					assert.isFalse(called.bar);

					const promise = app.getWidget('foo');
					assert.isFalse(called.foo);

					return promise.then(() => {
						assert.isTrue(called.foo);
						assert.isFalse(called.bar);

						const promise = app.getWidget('bar');
						assert.isFalse(called.bar);
						return promise;
					}).then(() => {
						assert.isTrue(called.bar);
					});
				},

				'factory may return a promise': {
					'should resolve with the widget'() {
						const expected = {
							foo: createWidget(),
							bar: createWidget()
						};
						stubWidgetFactory(() => {
							return Promise.resolve(expected.bar);
						});

						const app = new App({ toAbsMid });
						app.loadDefinition({
							widgets: [
								{
									id: 'foo',
									factory: () => Promise.resolve(expected.foo)
								},
								{
									id: 'bar',
									factory: '../fixtures/widget-factory'
								}
							]
						});

						return Promise.all([
							strictEqual(app.getWidget('foo'), expected.foo),
							strictEqual(app.getWidget('bar'), expected.bar)
						]);
					},

					'rejections are propagated'() {
						const expected = {
							foo: new Error(),
							bar: new Error()
						};
						stubWidgetFactory(() => {
							return Promise.reject(expected.bar);
						});

						const app = new App({ toAbsMid });
						app.loadDefinition({
							widgets: [
								{
									id: 'foo',
									factory: () => Promise.reject(expected.foo)
								},
								{
									id: 'bar',
									factory: '../fixtures/widget-factory'
								}
							]
						});

						return Promise.all([
							strictEqual(invert(app.getWidget('foo')), expected.foo),
							strictEqual(invert(app.getWidget('bar')), expected.bar)
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
					stubWidgetFactory((options) => {
						(<any> actual).bar = options;
						return createWidget();
					});

					const app = new App({ toAbsMid });
					app.loadDefinition({
						widgets: [
							{
								id: 'foo',
								factory(options) {
									(<any> actual).foo = options;
									return createWidget();
								},
								options: expected.foo
							},
							{
								id: 'bar',
								factory: '../fixtures/widget-factory',
								options: expected.bar
							}
						]
					});

					return Promise.all([
						app.getWidget('foo'),
						app.getWidget('bar')
					]).then(() => {
						assert.deepEqual(actual.foo, Object.assign({ id: 'foo' }, expected.foo));
						assert.deepEqual(actual.bar, Object.assign({ id: 'bar' }, expected.bar));
					});
				},

				'with stateFrom option': {
					'factory is passed a store reference in its stateFrom option'() {
						const expected = createStore();
						let actual: StoreLike = null;

						const app = new App();
						app.registerStore('store', expected);
						app.loadDefinition({
							widgets: [
								{
									id: 'foo',
									factory(options: any) {
										actual = options.stateFrom;
										return createWidget();
									},
									stateFrom: 'store'
								}
							]
						});

						return app.getWidget('foo').then(() => {
							assert.strictEqual(actual, expected);
						});
					}
				}
			}
		},

		'destroying the returned handle': {
			'deregisters all definitions from that call'() {
				const app = new App();
				app.registerAction('remains', createAction());
				const handle = app.loadDefinition({
					actions: [
						{
							id: 'foo',
							factory: createAction
						}
					],
					stores: [
						{
							id: 'foo',
							factory: createStore
						}
					],
					widgets: [
						{
							id: 'foo',
							factory: createWidget
						}
					]
				});

				handle.destroy();
				assert.isTrue(app.hasAction('remains'));
				assert.isFalse(app.hasAction('foo'));
				assert.isFalse(app.hasStore('foo'));
				assert.isFalse(app.hasWidget('foo'));
			}
		},

		'without setting toAbsMid, module ids should be absolute'() {
			const expected = createAction();
			stubActionFactory(() => expected);

			const app = new App();
			app.loadDefinition({
				actions: [
					{
						id: 'foo',
						factory: 'tests/fixtures/action-factory'
					}
				]
			});

			return strictEqual(app.getAction('foo'), expected);
		},

		// The other factories use export default, which requires a different code path to retrieve the export.
		// Run this test using an AMD module instead.
		'module ids do not have to point at ES modules'() {
			const expected = createAction();

			return new Promise((resolve) => {
				require(['tests/fixtures/amd-factory'], (factory) => {
					factory.stub(() => expected);
					resolve();
				});
			}).then(() => {
				const app = new App();
				app.loadDefinition({
					actions: [
						{
							id: 'foo',
							factory: 'tests/fixtures/amd-factory'
						}
					]
				});

				return strictEqual(app.getAction('foo'), expected);
			});
		}
	}
});

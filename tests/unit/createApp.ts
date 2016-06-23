import { EventedListener, EventedListenersMap } from 'dojo-compose/mixins/createEvented';
import global from 'dojo-core/global';
import has from 'dojo-core/has';
import { Handle } from 'dojo-core/interfaces';
import { assign } from 'dojo-core/lang';
import Promise from 'dojo-core/Promise';
import createActualWidget from 'dojo-widgets/createWidget';
import createContainer from 'dojo-widgets/createContainer';
import * as registerSuite from 'intern!object';
import * as assert from 'intern/chai!assert';

import createApp, {
	App,
	ActionLike,
	CombinedRegistry,
	Identifier,
	StoreLike,
	WidgetLike
} from 'src/createApp';

import { stub as stubActionFactory } from '../fixtures/action-factory';
import actionInstanceFixture from '../fixtures/action-instance';
import { stub as stubStoreFactory } from '../fixtures/store-factory';
import storeInstanceFixture from '../fixtures/store-instance';
import { stub as stubWidgetFactory } from '../fixtures/widget-factory';
import widgetInstanceFixture from '../fixtures/widget-instance';

const { toAbsMid } = require;

function rejects(promise: Promise<any>, errType: Function, msg?: string): Promise<any> {
	return promise.then(() => {
		throw new Error('Promise should have rejected');
	}, (err: any) => {
		assert.throws(() => { throw err; }, errType);
		if (msg) {
			assert.strictEqual(err.message, msg);
		}
		return err;
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

function createAction(): ActionLike {
	return <ActionLike> {
		configure (configuration: Object) {}
	};
}

function createStore(): StoreLike {
	return <StoreLike> {};
}

function createWidget(): WidgetLike {
	return <WidgetLike> {};
}

registerSuite({
	name: 'createApp',

	'#defaultStore': {
		'defaults to null'() {
			assert.isNull(createApp().defaultStore);
		},
		'set at creation time'() {
			const store = createStore();
			const app = createApp({ defaultStore: store });
			assert.strictEqual(app.defaultStore, store);
		},
		'has expected configuration'() {
			const store = createStore();
			const app = createApp({ defaultStore: store });
			const { configurable, enumerable, writable } = Object.getOwnPropertyDescriptor(app, 'defaultStore');
			assert.isFalse(configurable);
			assert.isTrue(enumerable);
			assert.isFalse(writable);
		}
	},

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

	'#registerAction': {
		'calls configure() on the action when the action is needed'() {
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

		'action.configure() is passed a combined registry'() {
			let registry: CombinedRegistry = null;
			const action = createAction();
			action.configure = (actual: CombinedRegistry) => { registry = actual; };

			const app = createApp();
			app.registerAction('foo', action);

			return app.getAction('foo').then(() => {
				isCombinedRegistry(registry);
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
				const app = createApp();
				const handle = app.registerAction('foo', createAction());

				handle.destroy();
				assert.isFalse(app.hasAction('foo'));
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
			'deregisters the factory'() {
				const app = createApp();
				const handle = app.registerActionFactory('foo', createAction);
				handle.destroy();

				assert.isFalse(app.hasAction('foo'));
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

	'#getCustomElementFactory': {
		'no registered custom element'() {
			assert.throws(() => createApp().getCustomElementFactory('foo-bar'), Error);
		},

		'provides a wrapper for the registered factory'() {
			let receivedOptions: Object;
			const expectedReturnValue = createWidget();

			const app = createApp();
			app.registerCustomElementFactory('foo-bar', (options) => {
				receivedOptions = options;
				return expectedReturnValue;
			});

			const wrapper = app.getCustomElementFactory('foo-bar');
			const expectedOptions = {};
			const receivedReturnValue = wrapper(expectedOptions);
			assert.strictEqual(receivedOptions, expectedOptions);
			assert.strictEqual(receivedReturnValue, expectedReturnValue);
		}
	},

	'#hasCustomElementFactory': {
		'no registered custom element'() {
			assert.isFalse(createApp().hasCustomElementFactory('foo-bar'));
		},

		'registered custom element'() {
			const app = createApp();
			app.registerCustomElementFactory('foo-bar', createWidget);

			assert.isTrue(app.hasCustomElementFactory('foo-bar'));
		}
	},

	'#registerCustomElementFactory': {
		'hasCustomElementFactory returns true after'() {
			const app = createApp();
			app.registerCustomElementFactory('foo-bar', createWidget);

			assert.isTrue(app.hasCustomElementFactory('foo-bar'));
		},

		'destroying the returned handle': {
			'deregister the factory'() {
				const app = createApp();
				const handle = app.registerCustomElementFactory('foo-bar', createWidget);
				handle.destroy();

				assert.isFalse(app.hasCustomElementFactory('foo-bar'));
			},

			'a second time is a noop'() {
				const app = createApp();
				const handle = app.registerCustomElementFactory('foo-bar', createWidget);
				handle.destroy();
				handle.destroy();

				assert.isFalse(app.hasCustomElementFactory('foo-bar'));
			}
		},

		'validates the name': {
			'must not be empty'() {
				assert.throws(() => {
					createApp().registerCustomElementFactory('', createWidget);
				}, SyntaxError, '\'\' is not a valid custom element name');
			},

			'must start with a lowercase ASCII letter'() {
				assert.throws(() => {
					createApp().registerCustomElementFactory('💩-', createWidget);
				}, SyntaxError, '\'💩-\' is not a valid custom element name');
			},

			'must contain a hyphen'() {
				assert.throws(() => {
					createApp().registerCustomElementFactory('a', createWidget);
				}, SyntaxError, '\'a\' is not a valid custom element name');
			},

			'must not include uppercase ASCII letters'() {
				assert.throws(() => {
					createApp().registerCustomElementFactory('a-A', createWidget);
				}, SyntaxError, '\'a-A\' is not a valid custom element name');
			},

			'must not be a reserved name'() {
				[
					'annotation-xml',
					'color-profile',
					'font-face',
					'font-face-src',
					'font-face-uri',
					'font-face-format',
					'font-face-name',
					'missing-glyph',
					'widget-instance',
					'widget-projector'
				].forEach((name) => {
					assert.throws(() => {
						createApp().registerCustomElementFactory(name, createWidget);
					}, Error, `'${name}' is not a valid custom element name`);
				});
			}
		},

		'the name must not case-insensitively match a previously registered element'() {
			const app = createApp();
			app.registerCustomElementFactory('a-Ø', () => createWidget());
			assert.throws(() => {
				app.registerCustomElementFactory('a-ø', () => createWidget());
			}, Error);
		}
	},

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

	'#registerStore': {
		'destroying the returned handle': {
			'deregisters the action'() {
				const store = createStore();

				const app = createApp();
				const handle = app.registerStore('foo', store);
				handle.destroy();

				assert.isFalse(app.hasStore('foo'));
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

		'destroying the returned handle': {
			'deregisters the factory'() {
				const app = createApp();
				const handle = app.registerStoreFactory('foo', createStore);
				handle.destroy();

				assert.isFalse(app.hasStore('foo'));
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

	'#getWidget': {
		'no registered widget'() {
			return rejects(createApp().getWidget('foo'), Error);
		},

		'provides registered widget'() {
			const expected = createWidget();

			const app = createApp();
			app.registerWidget('foo', expected);

			return strictEqual(app.getWidget('foo'), expected);
		}
	},

	'#hasWidget': {
		'no registered widget'() {
			assert.isFalse(createApp().hasWidget('foo'));
		},

		'registered widget'() {
			const app = createApp();
			app.registerWidget('foo', createWidget());

			assert.isTrue(app.hasWidget('foo'));
		}
	},

	'#registerWidget': {
		'destroying the returned handle': {
			'deregisters the action'() {
				const widget = createWidget();

				const app = createApp();
				const handle = app.registerWidget('foo', widget);
				handle.destroy();

				assert.isFalse(app.hasWidget('foo'));
			},

			'a second time has no effect'() {
				const widget = createWidget();

				const app = createApp();
				const handle = app.registerWidget('foo', widget);

				handle.destroy();
				handle.destroy();

				assert.isFalse(app.hasWidget('foo'));
			}
		}
	},

	'#registerWidgetFactory': {
		'hasWidget returns true after'() {
			const app = createApp();
			app.registerWidgetFactory('foo', createWidget);

			assert.isTrue(app.hasWidget('foo'));
		},

		'factory is not called until the widget is needed'() {
			let called = false;

			const app = createApp();
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

			const app = createApp();
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

		'factory is called with an options object that has an ID property'() {
			let actual: { [p: string]: any } = null;
			const app = createApp();
			app.registerWidgetFactory('foo', (options: any) => {
				actual = options;
				return createWidget();
			});

			return app.getWidget('foo').then(() => {
				assert.isOk(actual);
				assert.equal(actual['id'], 'foo');
			});
		},

		'the stateFrom option is set to the default store, if any'() {
			let actual: { [p: string]: any } = null;
			const store = createStore();
			const app = createApp({ defaultStore: store });
			app.registerWidgetFactory('foo', (options: any) => {
				actual = options;
				return createWidget();
			});

			return app.getWidget('foo').then(() => {
				assert.isOk(actual);
				assert.strictEqual(actual['stateFrom'], store);
			});
		},

		'factory may return a promise': {
			'should resolve with the widget'() {
				const expected = createWidget();

				const app = createApp();
				app.registerWidgetFactory('foo', () => Promise.resolve(expected));

				return strictEqual(app.getWidget('foo'), expected);
			},

			'rejections are propagated'() {
				const expected = new Error();

				const app = createApp();
				app.registerWidgetFactory('foo', () => Promise.reject(expected));

				return strictEqual(invert(app.getWidget('foo')), expected);
			}
		},

		'destroying the returned handle': {
			'deregisters the factory'() {
				const app = createApp();
				const handle = app.registerWidgetFactory('foo', createWidget);
				handle.destroy();

				assert.isFalse(app.hasWidget('foo'));
			},

			'deregisters the widget if it has already been created'() {
				const app = createApp();
				const handle = app.registerWidgetFactory('foo', createWidget);

				return app.getWidget('foo').then(() => {
					handle.destroy();

					assert.isFalse(app.hasWidget('foo'));
				});
			},

			'a second time has no effect'() {
				const app = createApp();
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

			'calls configure() on the action'() {
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

					const app = createApp();
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
				},

				'stateFrom may be an actual store, rather than a store identifier'() {
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

					const app = createApp();
					app.loadDefinition({
						actions: [
							{
								id: 'foo',
								factory: () => action,
								stateFrom: store
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
								factory: '../fixtures/action-factory'
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

						const app = createApp({ toAbsMid });
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

						const app = createApp({ toAbsMid });
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
								instance: '../fixtures/action-instance'
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
								instance: '../fixtures/no-instance-export'
							}
						]
					});

					return rejects(app.getAction('foo'), Error, 'Could not resolve \'../fixtures/no-instance-export\' to an action instance');
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
				}
			}
		},

		'customElements': {
			'registers multiple'() {
				const expected = {
					'foo-bar': createWidget(),
					'baz-qux': createWidget()
				};

				const app = createApp();
				app.loadDefinition({
					customElements: [
						{
							name: 'foo-bar',
							factory: () => expected['foo-bar']
						},
						{
							name: 'baz-qux',
							factory: () => expected['baz-qux']
						}
					]
				});

				assert.isTrue(app.hasCustomElementFactory('foo-bar'));
				assert.isTrue(app.hasCustomElementFactory('baz-qux'));

				return Promise.all([
					app.getCustomElementFactory('foo-bar')(),
					app.getCustomElementFactory('baz-qux')()
				]).then(([fooBar, bazQux]) => {
					assert.strictEqual(fooBar, expected['foo-bar']);
					assert.strictEqual(bazQux, expected['baz-qux']);
				});
			},

			'factory can be a module identifier'() {
				const expected = createWidget();
				stubWidgetFactory(() => expected);

				const app = createApp({ toAbsMid });
				app.loadDefinition({
					customElements: [
						{
							name: 'foo-bar',
							factory: '../fixtures/widget-factory'
						}
					]
				});

				return strictEqual(Promise.resolve(app.getCustomElementFactory('foo-bar')()), expected);
			},

			'cannot create widget if identified module has no default factory export'() {
				const app = createApp({ toAbsMid });
				app.loadDefinition({
					customElements: [
						{
							name: 'foo-bar',
							factory: '../fixtures/no-factory-export'
						}
					]
				});

				return rejects(Promise.resolve(app.getCustomElementFactory('foo-bar')()), Error, 'Could not resolve \'../fixtures/no-factory-export\' to a widget factory function');
			},

			'registered factory': {
				'returns a promise while the factory is being resolved'() {
					const app = createApp();
					app.loadDefinition({
						customElements: [
							{
								name: 'foo-bar',
								factory: createWidget
							}
						]
					});

					const factory = app.getCustomElementFactory('foo-bar');
					const first = factory();
					const second = factory();
					assert.instanceOf(first, Promise);
					assert.instanceOf(second, Promise);
				},

				// "may" because this depends on the factory
				'may return a widget when called again'() {
					const app = createApp();
					app.loadDefinition({
						customElements: [
							{
								name: 'foo-bar',
								factory: createWidget
							}
						]
					});

					const factory = app.getCustomElementFactory('foo-bar');
					return Promise.resolve(factory()).then(() => {
						assert.notInstanceOf(factory(), Promise);
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
								factory: '../fixtures/store-factory'
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

						const app = createApp({ toAbsMid });
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

						const app = createApp({ toAbsMid });
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
								instance: '../fixtures/store-instance'
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
								instance: '../fixtures/no-instance-export'
							}
						]
					});

					return rejects(app.getStore('foo'), Error, 'Could not resolve \'../fixtures/no-instance-export\' to a store instance');
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
		},

		'widgets': {
			'registers multiple'() {
				const expected = {
					foo: createWidget(),
					bar: createWidget()
				};

				const app = createApp();
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
					createApp().loadDefinition({
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
				}, TypeError, 'id, listeners and stateFrom options should be in the widget definition itself, not its options value');
			},

			'options cannot include the listeners property'() {
				assert.throws(() => {
					createApp().loadDefinition({
						widgets: [
							{
								id: 'foo',
								factory: createWidget,
								options: {
									listeners: {
										event: 'action'
									}
								}
							}
						]
					});
				}, TypeError, 'id, listeners and stateFrom options should be in the widget definition itself, not its options value');
			},

			'options cannot include the stateFrom property'() {
				assert.throws(() => {
					createApp().loadDefinition({
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
				}, TypeError, 'id, listeners and stateFrom options should be in the widget definition itself, not its options value');
			},

			'with listeners option': {
				'refers to an action that is not registered'() {
					const app = createApp();
					app.loadDefinition({
						widgets: [
							{
								id: 'foo',
								factory: createWidget,
								listeners: {
									event: 'action'
								}
							}
						]
					});

					return rejects(app.getWidget('foo'), Error);
				}
			},

			'with stateFrom option': {
				'refers to a store that is not registered'() {
					const app = createApp();
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

			'requires factory or instance option'() {
				assert.throws(() => {
					createApp().loadDefinition({
						widgets: [
							{
								id: 'foo'
							}
						]
					});
				}, TypeError, 'Widget definitions must specify either the factory or instance option');
			},

			'with factory option': {
				'can be a method'() {
					const expected = createWidget();

					const app = createApp();
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

					const app = createApp({ toAbsMid });
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
					const app = createApp({ toAbsMid });
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

					const app = createApp({ toAbsMid });
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

				'the factory\'s stateFrom option is set to the default store, if any'() {
					let actual: { [p: string]: any } = null;
					const store = createStore();
					const app = createApp({ defaultStore: store });
					app.loadDefinition({
						widgets: [
							{
								id: 'foo',
								factory(options: any) {
									actual = options;
									return createWidget();
								}
							}
						]
					});

					return app.getWidget('foo').then(() => {
						assert.isOk(actual);
						assert.strictEqual(actual['stateFrom'], store);
					});
				},

				'the definition\'s stateFrom option takes precedence over the default store, if any'() {
					let actual: { [p: string]: any } = null;
					const app = createApp({ defaultStore: createStore() });
					const store = createStore();
					app.loadDefinition({
						widgets: [
							{
								id: 'foo',
								stateFrom: store,
								factory(options: any) {
									actual = options;
									return createWidget();
								}
							}
						]
					});

					return app.getWidget('foo').then(() => {
						assert.isOk(actual);
						assert.strictEqual(actual['stateFrom'], store);
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

						const app = createApp({ toAbsMid });
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

						const app = createApp({ toAbsMid });
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

					const app = createApp({ toAbsMid });
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
						assert.deepEqual(actual.foo, assign({ id: 'foo' }, expected.foo));
						assert.deepEqual(actual.bar, assign({ id: 'bar' }, expected.bar));
					});
				},

				'with listeners option': {
					'factory is passed action references in its listeners option'() {
						const expected = {
							foo: createAction(),
							bar: createAction()
						};
						let actual: EventedListenersMap = null;

						const app = createApp();
						app.registerAction('foo', expected.foo);
						app.registerAction('bar', expected.bar);
						app.loadDefinition({
							widgets: [
								{
									id: 'foo',
									factory(options: any) {
										actual = options.listeners;
										return createWidget();
									},
									listeners: {
										foo: 'foo',
										bar: 'bar'
									}
								}
							]
						});

						return app.getWidget('foo').then(() => {
							assert.strictEqual(actual['foo'], expected.foo);
							assert.strictEqual(actual['bar'], expected.bar);
						});
					},

					'listeners may be functions, rather than action identifiers'() {
						const expected = {
							foo: createAction(),
							bar(evt: any) {}
						};
						let actual: EventedListenersMap = null;

						const app = createApp();
						app.registerAction('foo', expected.foo);
						app.loadDefinition({
							widgets: [
								{
									id: 'foo',
									factory(options: any) {
										actual = options.listeners;
										return createWidget();
									},
									listeners: {
										foo: 'foo',
										bar: expected.bar
									}
								}
							]
						});

						return app.getWidget('foo').then(() => {
							assert.strictEqual(actual['foo'], expected.foo);
							assert.strictEqual(actual['bar'], expected.bar);
						});
					},

					'an array of listeners may be specified'() {
						const expected = [createAction(), (evt: any) => {}];
						let actual: EventedListenersMap = null;

						const app = createApp();
						app.registerAction('foo', <ActionLike> expected[0]);
						app.loadDefinition({
							widgets: [
								{
									id: 'foo',
									factory(options: any) {
										actual = options.listeners;
										return createWidget();
									},
									listeners: {
										foo: ['foo', expected[1]],
										bar: [expected[1]]
									}
								}
							]
						});

						return app.getWidget('foo').then(() => {
							const foo = <EventedListener<any>[]> actual['foo'];
							assert.strictEqual(foo[0], expected[0]);
							assert.strictEqual(foo[1], expected[1]);

							const bar = <EventedListener<any>[]> actual['bar'];
							assert.strictEqual(bar[0], expected[1]);
						});
					}
				},

				'with stateFrom option': {
					'factory is passed a store reference in its stateFrom option'() {
						const expected = createStore();
						let actual: StoreLike = null;

						const app = createApp();
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
					},

					'stateFrom may be an actual store, rather than a store identifier'() {
						const expected = createStore();
						let actual: StoreLike = null;

						const app = createApp();
						app.loadDefinition({
							widgets: [
								{
									id: 'foo',
									factory(options: any) {
										actual = options.stateFrom;
										return createWidget();
									},
									stateFrom: expected
								}
							]
						});

						return app.getWidget('foo').then(() => {
							assert.strictEqual(actual, expected);
						});
					}
				}
			},

			'with instance option': {
				'can be an instance'() {
					const expected = createWidget();

					const app = createApp();
					app.loadDefinition({
						widgets: [
							{
								id: 'foo',
								instance: expected
							}
						]
					});

					return strictEqual(app.getWidget('foo'), expected);
				},

				'can be a module identifier'() {
					const app = createApp({ toAbsMid });
					app.loadDefinition({
						widgets: [
							{
								id: 'foo',
								instance: '../fixtures/widget-instance'
							}
						]
					});

					return strictEqual(app.getWidget('foo'), widgetInstanceFixture);
				},

				'cannot get widget if identified module has no default instance export'() {
					const app = createApp({ toAbsMid });
					app.loadDefinition({
						widgets: [
							{
								id: 'foo',
								instance: '../fixtures/no-instance-export'
							}
						]
					});

					return rejects(app.getWidget('foo'), Error, 'Could not resolve \'../fixtures/no-instance-export\' to a widget instance');
				},

				'listeners option is not allowed'() {
					assert.throws(() => {
						createApp().loadDefinition({
							widgets: [
								{
									id: 'foo',
									instance: createWidget(),
									listeners: {
										event: 'action'
									}
								}
							]
						});
					}, TypeError, 'Cannot specify listeners option when widget definition points directly at an instance');
				},

				'stateFrom option is not allowed'() {
					assert.throws(() => {
						createApp().loadDefinition({
							widgets: [
								{
									id: 'foo',
									instance: createWidget(),
									stateFrom: 'store'
								}
							]
						});
					}, TypeError, 'Cannot specify stateFrom option when widget definition points directly at an instance');
				},

				'options option is not allowed'() {
					assert.throws(() => {
						createApp().loadDefinition({
							widgets: [
								{
									id: 'foo',
									instance: createWidget(),
									options: {}
								}
							]
						});
					}, TypeError, 'Cannot specify options when widget definition points directly at an instance');
				}
			}
		},

		'destroying the returned handle': {
			'deregisters all definitions from that call'() {
				const app = createApp();
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

			const app = createApp();
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
				const app = createApp();
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
	},

	'cannot register duplicates'() {
		const app = createApp({ toAbsMid });

		app.registerAction('action', createAction());
		assert.throws(() => {
			app.registerAction('action', createAction());
		}, Error);
		assert.throws(() => {
			app.registerActionFactory('action', createAction);
		}, Error);
		assert.throws(() => {
			app.loadDefinition({
				actions: [
					{
						id: 'action',
						factory: createAction
					}
				]
			});
		}, Error);
		assert.doesNotThrow(() => {
			app.registerStore('action', createStore());
			app.registerWidget('action', createWidget());
		});

		app.registerStore('store', createStore());
		assert.throws(() => {
			app.registerStore('store', createStore());
		}, Error);
		assert.throws(() => {
			app.registerStoreFactory('store', createStore);
		}, Error);
		assert.throws(() => {
			app.loadDefinition({
				stores: [
					{
						id: 'store',
						factory: createStore
					}
				]
			});
		}, Error);
		assert.doesNotThrow(() => {
			app.registerAction('store', createAction());
			app.registerWidget('store', createWidget());
		});

		app.registerWidget('widget', createWidget());
		assert.throws(() => {
			app.registerWidget('widget', createWidget());
		}, Error);
		assert.throws(() => {
			app.registerWidgetFactory('widget', createWidget);
		}, Error);
		assert.throws(() => {
			app.loadDefinition({
				widgets: [
					{
						id: 'widget',
						factory: createWidget
					}
				]
			});
		}, Error);
		assert.doesNotThrow(() => {
			app.registerAction('widget', createAction());
			app.registerStore('widget', createStore());
		});
	},

	'#realize': (() => {
		let app: App = null;
		let root: HTMLElement = null;
		let projector: HTMLElement = null;
		let stubbedGlobals = false;

		return {
			before() {
				if (has('host-node')) {
					global.document = (<any> require('jsdom')).jsdom('<html><body></body></html>');
					global.Node = global.document.defaultView.Node;
					stubbedGlobals = true;
				}
			},

			after() {
				if (stubbedGlobals) {
					delete global.document;
					delete global.Node;
				}
			},

			beforeEach() {
				root = document.createElement('div');
				projector = document.createElement('widget-projector');
				root.appendChild(projector);
				app = createApp();
			},

			'recognizes custom elements by tag name'() {
				app.registerWidget('foo', createActualWidget({ tagName: 'mark' }));
				projector.innerHTML = '<widget-instance id="foo"></widget-instance>';
				return app.realize(root).then(() => {
					assert.equal(projector.firstChild.nodeName, 'MARK');
				});
			},

			'tag name comparisons are case-insensitive'() {
				app.registerWidget('foo', createActualWidget({ tagName: 'mark' }));
				projector.innerHTML = '<widget-instance id="foo"></widget-instance>';
				return app.realize(root).then(() => {
					assert.equal(projector.firstChild.nodeName, 'MARK');
				});
			},

			'tag name takes precedence over `is` attribute'() {
				app.registerWidget('foo', createActualWidget({ tagName: 'mark' }));
				projector.innerHTML = '<widget-instance is="widget-projector" id="foo"></widget-instance>';
				return app.realize(root).then(() => {
					assert.equal(root.firstChild.firstChild.nodeName, 'MARK');
				});
			},

			'`is` attribute comparison is case-insensitive'() {
				app.registerWidget('foo', createActualWidget({ tagName: 'mark' }));
				projector.innerHTML = '<div is="widget-instance" id="foo"></div>';
				return app.realize(root).then(() => {
					assert.equal(projector.firstChild.nodeName, 'MARK');
				});
			},

			'skips unknown custom elements'() {
				root.innerHTML = '<custom-element></custom-element><div is="another-element"></div>';
				return app.realize(root).then(() => {
					assert.equal(root.firstChild.nodeName, 'CUSTOM-ELEMENT');
					assert.equal(root.lastChild.nodeName, 'DIV');
				});
			},

			'custom elements must be rooted in a widget-projector'() {
				root.innerHTML = '<widget-instance id="foo"/>';
				return rejects(app.realize(root), Error, 'Custom tags must be rooted in a widget-projector');
			},

			'the widget-projector element is left in the DOM'() {
				app.registerWidget('foo', createActualWidget({ tagName: 'mark' }));
				projector.innerHTML = '<widget-instance id="foo"></widget-instance>';
				return app.realize(root).then(() => {
					assert.strictEqual(root.firstChild, projector);
				});
			},

			'the widget-projector element may be the root'() {
				app.registerWidget('foo', createActualWidget({ tagName: 'mark' }));
				projector.innerHTML = '<widget-instance id="foo"></widget-instance>';
				return app.realize(projector).then(() => {
					assert.equal(projector.firstChild.nodeName, 'MARK');
				});
			},

			'widget-projector elements cannot contain other widget-projector elements'() {
				app.registerWidget('foo', createActualWidget({ tagName: 'mark' }));
				projector.innerHTML = '<widget-projector></widget-projector>';
				return rejects(app.realize(root), Error, 'widget-projector cannot contain another widget-projector');
			},

			'realized elements are replaced'() {
				app.registerWidget('foo', createActualWidget({ tagName: 'mark' }));
				app.registerWidget('bar', createActualWidget({ tagName: 'strong' }));
				projector.innerHTML = `
					before1
					<widget-instance id="foo"></widget-instance>
					<div>
						before2
						<widget-instance id="bar"></widget-instance>
						after2
					</div>
					after1
				`.trim();
				return app.realize(root).then(() => {
					const before1 = projector.firstChild;
					assert.equal(before1.nodeValue.trim(), 'before1');
					const foo = <Element> before1.nextSibling;
					assert.equal(foo.nodeName, 'MARK');
					const div = foo.nextElementSibling;
					assert.equal(div.nodeName, 'DIV');
					const before2 = div.firstChild;
					assert.equal(before2.nodeValue.trim(), 'before2');
					const bar = before2.nextSibling;
					assert.equal(bar.nodeName, 'STRONG');
					const after2 = bar.nextSibling;
					assert.equal(after2.nodeValue.trim(), 'after2');
					const after1 = div.nextSibling;
					assert.equal(after1.nodeValue.trim(), 'after1');
				});
			},

			'supports multiple projection projectors'() {
				app.registerWidget('foo', createActualWidget({ tagName: 'mark' }));
				app.registerWidget('bar', createActualWidget({ tagName: 'strong' }));
				root.innerHTML = `
					<widget-projector><widget-instance id="foo"></widget-instance></widget-projector>
					<widget-projector><widget-instance id="bar"></widget-instance></widget-projector>
				`.trim();
				return app.realize(root).then(() => {
					assert.equal(root.firstChild.firstChild.nodeName, 'MARK');
					assert.equal(root.lastChild.firstChild.nodeName, 'STRONG');
				});
			},

			'<widget-instance> custom elements': {
				'data-widget-id takes precedence over id'() {
					app.registerWidget('foo', createActualWidget({ tagName: 'mark' }));
					projector.innerHTML = '<widget-instance id="bar" data-widget-id="foo"></widget-instance>';
					return app.realize(root).then(() => {
						assert.equal(projector.firstChild.nodeName, 'MARK');
					});
				},

				'an ID is required'() {
					projector.innerHTML = '<widget-instance></widget-instance>';
					return rejects(app.realize(root), Error, 'Cannot resolve widget for a custom element without \'data-widget-id\' or \'id\' attributes');
				},

				'the ID must resolve to a widget instance'() {
					projector.innerHTML = '<widget-instance id="foo"></widget-instance>';
					return rejects(app.realize(root), Error, 'Could not find a value for identity \'foo\'');
				}
			},

			'realizes registered custom elements'() {
				app.registerCustomElementFactory('foo-bar', () => createActualWidget({ tagName: 'mark' }));
				projector.innerHTML = '<foo-bar></foo-bar>';
				return app.realize(root).then(() => {
					assert.equal(projector.firstChild.nodeName, 'MARK');
				});
			},

			'child nodes of custom elements that are not custom elements themselves are discarded'() {
				app.registerCustomElementFactory('foo-bar', () => createActualWidget({ tagName: 'mark' }));
				projector.innerHTML = '<foo-bar>oh noes</foo-bar>';
				return app.realize(root).then(() => {
					assert.equal(projector.firstChild.nodeName, 'MARK');
					assert.isFalse(projector.firstChild.hasChildNodes());
				});
			},

			'the rendered widget hierarchy reflects the nesting of custom elements'() {
				app.registerCustomElementFactory('container-here', () => createContainer());
				app.registerWidget('foo', createActualWidget({ tagName: 'mark' }));
				app.registerWidget('bar', createActualWidget({ tagName: 'strong' }));
				root.innerHTML = `
					<widget-projector>
						<container-here>
							<widget-instance id="foo"></widget-instance>
						</container-here>
					</widget-projector>
					<widget-projector>
						<container-here>
							<widget-instance id="bar"></widget-instance>
						</container-here>
					</widget-projector>
				`.trim();
				return app.realize(root).then(() => {
					const first = root.firstElementChild.firstElementChild;
					assert.equal(first.nodeName, 'DOJO-CONTAINER');
					assert.equal(first.firstChild.nodeName, 'MARK');

					const second = root.lastElementChild.firstElementChild;
					assert.equal(second.nodeName, 'DOJO-CONTAINER');
					assert.equal(second.firstChild.nodeName, 'STRONG');
				});
			},

			'the rendered widget hierarchy ignores non-custom elements'() {
				app.registerCustomElementFactory('container-here', () => createContainer());
				app.registerWidget('foo', createActualWidget({ tagName: 'mark' }));
				projector.innerHTML = `
					<container-here>
						<div>
							<widget-instance id="foo"></widget-instance>
						</div>
					</container-here>
				`.trim();
				return app.realize(root).then(() => {
					const container = projector.firstElementChild;
					assert.equal(container.nodeName, 'DOJO-CONTAINER');
					assert.equal(container.firstChild.nodeName, 'MARK');
				});
			},

			'a widget cannot be attached multiple times in the same projector'() {
				const widget = createActualWidget({ tagName: 'mark' });
				app.registerCustomElementFactory('foo-1', () => widget);
				app.registerCustomElementFactory('foo-2', () => widget);
				projector.innerHTML = `
					<foo-1></foo-1>
					<foo-2></foo-2>
				`;
				return rejects(app.realize(root), Error, 'Cannot attach a widget multiple times');
			},

			'a widget cannot be attached in multiple projectors'() {
				const widget = createActualWidget({ tagName: 'mark' });
				app.registerCustomElementFactory('foo-bar', () => widget);
				root.innerHTML = `
					<widget-projector><foo-bar></foo-bar></widget-projector>
					<widget-projector><foo-bar></foo-bar></widget-projector>
				`;
				return rejects(app.realize(root), Error, 'Cannot attach a widget multiple times');
			},

			'a widget cannot be attached if it already has a parent'() {
				const widget = createActualWidget({ tagName: 'mark' });
				createContainer().append(widget);
				app.registerWidget('foo', widget);
				projector.innerHTML = '<widget-instance id="foo"></widget-instance>';
				return rejects(app.realize(root), Error, 'Cannot attach a widget that already has a parent');
			},

			'custom elements are created with options': (() => {
				const opts = (obj: any) => {
					return JSON.stringify(obj).replace(/"/g, '&quot;');
				};

				return {
					'options come from the data-options attribute'() {
						let fooBar: { [p: string]: any } = null;
						let bazQux: { [p: string]: any } = null;
						app.registerCustomElementFactory('foo-bar', (options) => {
							fooBar = options;
							return createActualWidget({ tagName: 'mark' });
						});
						app.loadDefinition({
							customElements: [
								{
									name: 'baz-qux',
									factory(options) {
										bazQux = options;
										return createActualWidget({ tagName: 'strong' });
									}
								}
							]
						});
						projector.innerHTML = `
							<foo-bar data-options="${opts({ foo: 'bar', baz: 5 })}"></foo-bar>
							<baz-qux data-options="${opts({ qux: 'quux', thud: 42 })}"></baz-qux>
						`;
						return app.realize(root).then(() => {
							assert.isOk(fooBar);
							assert.equal(fooBar['foo'], 'bar');
							assert.equal(fooBar['baz'], 5);
							assert.isOk(bazQux);
							assert.equal(bazQux['qux'], 'quux');
							assert.equal(bazQux['thud'], 42);
						});
					},

					'realization fails if the data-options value is not valid JSON'() {
						app.registerCustomElementFactory('foo-bar', createWidget);
						projector.innerHTML = `<foo-bar data-options="${opts({}).slice(1)}"></foo-bar>`;
						return rejects(app.realize(root), SyntaxError).then((err) => {
							assert.match(err.message, /^Invalid data-options:/);
							assert.match(err.message, / \(in "}"\)$/);
						});
					},

					'realization fails if the data-options value does not encode an object'() {
						app.registerCustomElementFactory('foo-bar', createWidget);
						projector.innerHTML = `<foo-bar data-options="${opts(null)}"></foo-bar>`;
						return rejects(app.realize(root), TypeError, 'Expected object from data-options (in "null")').then(() => {
							projector.innerHTML = `<foo-bar data-options="${opts(42)}"></foo-bar>`;
							return rejects(app.realize(root), TypeError, 'Expected object from data-options (in "42")');
						});
					},

					'if present, the "stateFrom" option': {
						'must be a string'() {
							app.registerCustomElementFactory('foo-bar', createWidget);
							projector.innerHTML = `<foo-bar data-options="${opts({ stateFrom: 5 })}"></foo-bar>`;
							return rejects(app.realize(root), TypeError, 'Expected stateFrom value in data-options to be a non-empty string (in "{\\"stateFrom\\":5}")');
						},

						'must be a non-empty string'() {
							app.registerCustomElementFactory('foo-bar', createWidget);
							projector.innerHTML = `<foo-bar data-options="${opts({ stateFrom: '' })}"></foo-bar>`;
							return rejects(app.realize(root), TypeError, 'Expected stateFrom value in data-options to be a non-empty string (in "{\\"stateFrom\\":\\"\\"}")');
						},

						'must identify a registered store'() {
							app.registerCustomElementFactory('foo-bar', createWidget);
							projector.innerHTML = `<foo-bar data-options="${opts({ stateFrom: 'store' })}"></foo-bar>`;
							return rejects(app.realize(root), Error);
						},

						'causes the custom element factory to be called with a stateFrom option set to the store'() {
							let actual: { stateFrom: StoreLike } = null;
							app.registerCustomElementFactory('foo-bar', (options) => {
								actual = <any> options;
								return createActualWidget({ tagName: 'mark' });
							});
							const expected = createStore();
							app.registerStore('store', expected);
							projector.innerHTML = `<foo-bar data-options="${opts({ stateFrom: 'store' })}"></foo-bar>`;
							return app.realize(root).then(() => {
								assert.isOk(actual);
								assert.strictEqual(actual.stateFrom, expected);
							});
						},

						'takes precedence over data-state-from'() {
							let actual: { stateFrom: StoreLike } = null;
							app.registerCustomElementFactory('foo-bar', (options) => {
								actual = <any> options;
								return createActualWidget({ tagName: 'mark' });
							});
							const expected = createStore();
							app.registerStore('store', expected);
							app.registerStore('otherStore', createStore());
							projector.innerHTML = `<foo-bar data-state-from="otherStore" data-options="${opts({ stateFrom: 'store' })}"></foo-bar>`;
							return app.realize(root).then(() => {
								assert.isOk(actual);
								assert.strictEqual(actual.stateFrom, expected);
							});
						},

						'takes precedence over <widget-projector data-state-from>'() {
							let actual: { stateFrom: StoreLike } = null;
							app.registerCustomElementFactory('foo-bar', (options) => {
								actual = <any> options;
								return createActualWidget({ tagName: 'mark' });
							});
							const expected = createStore();
							app.registerStore('store', expected);
							app.registerStore('otherStore', createStore());
							projector.setAttribute('data-state-from', 'otherStore');
							projector.innerHTML = `<foo-bar data-options="${opts({ stateFrom: 'store' })}"></foo-bar>`;
							return app.realize(root).then(() => {
								assert.isOk(actual);
								assert.strictEqual(actual.stateFrom, expected);
							});
						},

						'takes precedence over the default store'() {
							const app = createApp({ defaultStore: createStore() });
							let actual: { stateFrom: StoreLike } = null;
							app.registerCustomElementFactory('foo-bar', (options) => {
								actual = <any> options;
								return createActualWidget({ tagName: 'mark' });
							});
							const expected = createStore();
							app.registerStore('store', expected);
							projector.innerHTML = `<foo-bar data-options="${opts({ stateFrom: 'store' })}"></foo-bar>`;
							return app.realize(root).then(() => {
								assert.isOk(actual);
								assert.strictEqual(actual.stateFrom, expected);
							});
						}
					},

					'if present, the "listeners" option': {
						'must be an object (not null)'() {
							app.registerCustomElementFactory('foo-bar', createWidget);
							projector.innerHTML = `<foo-bar data-options="${opts({ listeners: null })}"></foo-bar>`;
							return rejects(
								app.realize(root),
								TypeError,
								'Expected listeners value in data-options to be a widget listeners map with action identifiers (in "{\\"listeners\\":null}")'
							).then(() => {
								projector.innerHTML = `<foo-bar data-options="${opts({ listeners: 42 })}"></foo-bar>`;
								return rejects(
									app.realize(root),
									TypeError,
									'Expected listeners value in data-options to be a widget listeners map with action identifiers (in "{\\"listeners\\":42}")');
							});
						},

						'property values must be strings or arrays of strings'() {
							app.registerCustomElementFactory('foo-bar', createWidget);
							projector.innerHTML = `<foo-bar data-options="${opts({
								listeners: {
									type: 5
								}
							})}"></foo-bar>`;
							return rejects(
								app.realize(root),
								TypeError,
								'Expected listeners value in data-options to be a widget listeners map with action identifiers (in "{\\"listeners\\":{\\"type\\":5}}")'
							).then(() => {
								projector.innerHTML = `<foo-bar data-options="${opts({
									listeners: {
										type: [true]
									}
								})}"></foo-bar>`;
								return rejects(
									app.realize(root),
									TypeError,
									'Expected listeners value in data-options to be a widget listeners map with action identifiers (in "{\\"listeners\\":{\\"type\\":[true]}}")'
								);
							});
						},

						'the strings must identify registered actions'() {
							app.registerCustomElementFactory('foo-bar', createWidget);
							projector.innerHTML = `<foo-bar data-options="${opts({
								listeners: {
									type: 'action'
								}
							})}"></foo-bar>`;
							return rejects(app.realize(root), Error);
						},

						'causes the custom element factory to be called with a listeners map for the actions'() {
							let actual: { listeners: { [type: string]: ActionLike | ActionLike[] } } = null;
							app.registerCustomElementFactory('foo-bar', (options) => {
								actual = <any> options;
								return createActualWidget({ tagName: 'mark' });
							});
							const expected = createAction();
							app.registerAction('action', expected);
							projector.innerHTML = `<foo-bar data-options="${opts({
								listeners: {
									string: 'action',
									array: ['action']
								}
							})}"></foo-bar>`;
							return app.realize(root).then(() => {
								assert.isNotNull(actual);
								assert.strictEqual(actual.listeners['string'], expected);
								assert.lengthOf(actual.listeners['array'], 1);
								assert.strictEqual((<ActionLike[]> actual.listeners['array'])[0], expected);
							});
						}
					}
				};
			})(),

			'non-projector data-state-from attribute': {
				'is ignored if empty'() {
					let actual: { stateFrom: StoreLike } = null;
					app.registerCustomElementFactory('foo-bar', (options) => {
						actual = <any> options;
						return createActualWidget({ tagName: 'mark' });
					});
					projector.innerHTML = `<foo-bar data-state-from="" id="foo"></foo-bar>`;
					return app.realize(root).then(() => {
						assert.isOk(actual);
						assert.notProperty(actual, 'stateFrom');
					});
				},

				'must identify a registered store'() {
					app.registerCustomElementFactory('foo-bar', createWidget);
					projector.innerHTML = `<foo-bar data-state-from="store" id="foo"></foo-bar>`;
					return rejects(app.realize(root), Error);
				},

				'if the element has an ID, causes the custom element factory to be called with a stateFrom option set to the store'() {
					let actual: { stateFrom: StoreLike } = null;
					app.registerCustomElementFactory('foo-bar', (options) => {
						actual = <any> options;
						return createActualWidget({ tagName: 'mark' });
					});
					const expected = createStore();
					app.registerStore('store', expected);
					projector.innerHTML = `<foo-bar data-state-from="store" id="foo"></foo-bar>`;
					return app.realize(root).then(() => {
						assert.isOk(actual);
						assert.strictEqual(actual.stateFrom, expected);
					});
				},

				'takes precedence over <widget-projector data-state-from>'() {
					let actual: { stateFrom: StoreLike } = null;
					app.registerCustomElementFactory('foo-bar', (options) => {
						actual = <any> options;
						return createActualWidget({ tagName: 'mark' });
					});
					const expected = createStore();
					app.registerStore('store', expected);
					app.registerStore('otherStore', createStore());
					projector.setAttribute('data-state-from', 'otherStore');
					projector.innerHTML = `<foo-bar data-state-from="store" id="foo"></foo-bar>`;
					return app.realize(root).then(() => {
						assert.isOk(actual);
						assert.strictEqual(actual.stateFrom, expected);
					});
				},

				'takes precedence over the default store'() {
					let actual: { stateFrom: StoreLike } = null;
					const app = createApp({ defaultStore: createStore() });
					app.registerCustomElementFactory('foo-bar', (options) => {
						actual = <any> options;
						return createActualWidget({ tagName: 'mark' });
					});
					const expected = createStore();
					app.registerStore('store', expected);
					projector.innerHTML = `<foo-bar data-state-from="store" id="foo"></foo-bar>`;
					return app.realize(root).then(() => {
						assert.isOk(actual);
						assert.strictEqual(actual.stateFrom, expected);
					});
				},

				'is ignored if the element does not have an ID'() {
					let actual: { stateFrom: StoreLike } = null;
					app.registerCustomElementFactory('foo-bar', (options) => {
						actual = <any> options;
						return createActualWidget({ tagName: 'mark' });
					});
					app.registerStore('store', createStore());
					projector.innerHTML = `<foo-bar data-state-from="store" data-options="{}"></foo-bar>`;
					return app.realize(root).then(() => {
						assert.isOk(actual);
						assert.notProperty(actual, 'stateFrom');
					});
				}
			},

			'<widget-projector data-state-from> attribute': {
				'is ignored if empty'() {
					let actual: { stateFrom: StoreLike } = null;
					app.registerCustomElementFactory('foo-bar', (options) => {
						actual = <any> options;
						return createActualWidget({ tagName: 'mark' });
					});
					projector.setAttribute('data-state-from', '');
					projector.innerHTML = `<foo-bar id="foo"></foo-bar>`;
					return app.realize(root).then(() => {
						assert.isOk(actual);
						assert.notProperty(actual, 'stateFrom');
					});
				},

				'must identify a registered store'() {
					app.registerCustomElementFactory('foo-bar', createWidget);
					projector.setAttribute('data-state-from', 'store');
					projector.innerHTML = `<foo-bar id="foo"></foo-bar>`;
					return rejects(app.realize(root), Error);
				},

				'if descendant elements have an ID, causes their custom element factory to be called with a stateFrom option set to the store'() {
					let actual: { stateFrom: StoreLike } = null;
					app.registerCustomElementFactory('foo-bar', (options) => {
						actual = <any> options;
						return createActualWidget({ tagName: 'mark' });
					});
					const expected = createStore();
					app.registerStore('store', expected);
					projector.setAttribute('data-state-from', 'store');
					projector.innerHTML = `<foo-bar id="foo"></foo-bar>`;
					return app.realize(root).then(() => {
						assert.isOk(actual);
						assert.strictEqual(actual.stateFrom, expected);
					});
				},

				'takes precedence over the default store'() {
					let actual: { stateFrom: StoreLike } = null;
					const app = createApp({ defaultStore: createStore() });
					app.registerCustomElementFactory('foo-bar', (options) => {
						actual = <any> options;
						return createActualWidget({ tagName: 'mark' });
					});
					const expected = createStore();
					app.registerStore('store', expected);
					projector.setAttribute('data-state-from', 'store');
					projector.innerHTML = `<foo-bar id="foo"></foo-bar>`;
					return app.realize(root).then(() => {
						assert.isOk(actual);
						assert.strictEqual(actual.stateFrom, expected);
					});
				},

				'is ignored for descendant elements that do not have an ID'() {
					let actual: { stateFrom: StoreLike } = null;
					app.registerCustomElementFactory('foo-bar', (options) => {
						actual = <any> options;
						return createActualWidget({ tagName: 'mark' });
					});
					app.registerStore('store', createStore());
					projector.setAttribute('data-state-from', '');
					projector.innerHTML = `<foo-bar data-options="{}"></foo-bar>`;
					return app.realize(root).then(() => {
						assert.isOk(actual);
						assert.notProperty(actual, 'stateFrom');
					});
				}
			},

			'the app has a default store': {
				'if the element has an ID, causes the custom element factory to be called with a stateFrom option set to the store'() {
					let actual: { stateFrom: StoreLike } = null;
					const expected = createStore();
					const app = createApp({ defaultStore: expected });
					app.registerCustomElementFactory('foo-bar', (options) => {
						actual = <any> options;
						return createActualWidget({ tagName: 'mark' });
					});
					projector.innerHTML = `<foo-bar id="foo"></foo-bar>`;
					return app.realize(root).then(() => {
						assert.isOk(actual);
						assert.strictEqual(actual.stateFrom, expected);
					});
				}
			},

			'data-state attribute': {
				'realization fails if the data-state value is not valid JSON'() {
					app.registerCustomElementFactory('foo-bar', createActualWidget);
					app.registerStore('store', createStore());
					projector.innerHTML = '<foo-bar id="widget" data-state-from="store" data-state=\'}\'></foo-bar>';
					return rejects(app.realize(root), SyntaxError).then((err) => {
						assert.match(err.message, /^Invalid data-state:/);
						assert.match(err.message, / \(in "}"\)$/);
					});
				},

				'realization fails if the data-state value does not encode an object'() {
					app.registerCustomElementFactory('foo-bar', createActualWidget);
					app.registerStore('store', createStore());
					projector.innerHTML = '<foo-bar id="widget" data-state-from="store" data-state=\'null\'></foo-bar>';
					return rejects(app.realize(root), TypeError, 'Expected object from data-state (in "null")').then(() => {
						projector.innerHTML = '<foo-bar id="widget" data-state-from="store" data-state=\'42\'></foo-bar>';
						return rejects(app.realize(root), TypeError, 'Expected object from data-state (in "42")');
					});
				},

				'for widgets with an ID and stateFrom, patch the store with the state before creating the widget'() {
					let calls: string[] = [];
					let patchArgs: any[][] = [];

					const store = createStore();
					(<any> store).patch = (...args: any[]) => {
						calls.push('patch');
						patchArgs.push(args);
						return Promise.resolve();
					};

					app.registerCustomElementFactory('foo-bar', () => {
						calls.push('factory');
						return createActualWidget();
					});
					app.registerStore('store', store);

					projector.innerHTML = '<foo-bar id="widget" data-state-from="store" data-state=\'{"foo":"bar"}\'></foo-bar>';
					return app.realize(root).then(() => {
						assert.deepEqual(calls, ['patch', 'factory']);
						assert.deepEqual(patchArgs, [[{ foo: 'bar' }, { id: 'widget' }]]);
					});
				}
			},

			'destroying the returned handle': {
				'leaves the rendered elements in the DOM'() {
					app.registerCustomElementFactory('foo-bar', () => createActualWidget({ tagName: 'mark' }));
					root.innerHTML = '<widget-projector><foo-bar></foo-bar></widget-projector>';
					return app.realize(root).then((handle) => {
						handle.destroy();
						return new Promise((resolve) => { setTimeout(resolve, 50); });
					}).then(() => {
						assert.equal(root.firstChild.firstChild.nodeName, 'MARK');
					});
				},

				'destroys managed widgets'() {
					const managedWidget = createActualWidget({ tagName: 'mark' });
					const attachedWidget = createActualWidget({ tagName: 'strong' });
					app.registerCustomElementFactory('managed-widget', () => managedWidget);
					app.registerWidget('attached', attachedWidget);

					let destroyedManaged = false;
					managedWidget.own({ destroy() { destroyedManaged = true; }});
					let destroyedAttached = false;
					attachedWidget.own({ destroy() { destroyedAttached = true; }});

					projector.innerHTML = '<managed-widget></managed-widget><widget-instance id="attached></widget-instance>';
					return app.realize(root).then((handle) => {
						handle.destroy();

						assert.isTrue(destroyedManaged);
						assert.isFalse(destroyedAttached);
					});
				},

				'a second time is a noop'() {
					app.registerWidget('foo', createActualWidget({ tagName: 'mark' }));
					projector.innerHTML = '<widget-instance id="foo"></widget-instance>';
					return app.realize(root).then((handle) => {
						handle.destroy();
						handle.destroy();
						return new Promise((resolve) => { setTimeout(resolve, 50); });
					}).then(() => {
						assert.equal(root.firstChild.firstChild.nodeName, 'MARK');
					});
				}
			},

			'identifying and retrieving widgets': {
				'via data-options'() {
					const fooBar = createActualWidget();
					app.registerCustomElementFactory('foo-bar', () => fooBar);
					projector.innerHTML = '<foo-bar data-options="{&quot;id&quot;:&quot;fooBar&quot;}"></foo-bar>';
					return app.realize(root).then((handle) => {
						assert.strictEqual(handle.getWidget('fooBar'), fooBar);
					});
				},

				'via data-widget-id'() {
					const fooBar = createActualWidget();
					app.registerCustomElementFactory('foo-bar', () => fooBar);
					projector.innerHTML = '<foo-bar data-widget-id="fooBar"></foo-bar>';
					return app.realize(root).then((handle) => {
						assert.strictEqual(handle.getWidget('fooBar'), fooBar);
					});
				},

				'via the id attribute'() {
					const fooBar = createActualWidget();
					app.registerCustomElementFactory('foo-bar', () => fooBar);
					projector.innerHTML = '<foo-bar id="fooBar"></foo-bar>';
					return app.realize(root).then((handle) => {
						assert.strictEqual(handle.getWidget('fooBar'), fooBar);
					});
				},

				'data-options takes precedence over data-widget-id over id'() {
					const fooBar = createActualWidget();
					app.registerCustomElementFactory('foo-bar', () => fooBar);
					const bazQux = createActualWidget();
					app.registerCustomElementFactory('baz-qux', () => bazQux);
					projector.innerHTML = `
						<foo-bar data-widget-id="bazQux" data-options="{&quot;id&quot;:&quot;fooBar&quot;}"></foo-bar>
						<baz-qux id="fooBar" data-widget-id="bazQux"></baz-qux>
					`;
					return app.realize(root).then((handle) => {
						assert.strictEqual(handle.getWidget('fooBar'), fooBar);
						assert.strictEqual(handle.getWidget('bazQux'), bazQux);
					});
				},

				'ID from data-widget-id is added to the creation options'() {
					let actual: string;
					app.registerCustomElementFactory('foo-bar', (options) => {
						actual = (<any> options).id;
						return createActualWidget();
					});
					projector.innerHTML = '<foo-bar data-widget-id="the-id"></foo-bar>';
					return app.realize(root).then(() => {
						assert.equal(actual, 'the-id');
					});
				},

				'ID from id is added to the creation options'() {
					let actual: string;
					app.registerCustomElementFactory('foo-bar', (options) => {
						actual = (<any> options).id;
						return createActualWidget();
					});
					projector.innerHTML = '<foo-bar id="the-id" data-options="{}"></foo-bar>';
					return app.realize(root).then(() => {
						assert.equal(actual, 'the-id');
					});
				},

				'IDs must be unique within the realization'() {
					app.registerCustomElementFactory('foo-bar', () => createActualWidget());
					projector.innerHTML = `
						<foo-bar id="unique"></foo-bar>
						<foo-bar id="unique"></foo-bar>
					`;
					return rejects(app.realize(root), Error, 'A widget with ID \'unique\' already exists');
				},

				'getWidget() returns null for unknown widgets'() {
					return app.realize(root).then((handle) => {
						assert.isNull(handle.getWidget('unknown'));
					});
				}
			}
		};
	})()
});

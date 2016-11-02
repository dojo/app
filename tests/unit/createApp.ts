import { Handle } from 'dojo-core/interfaces';
import Promise from 'dojo-shim/Promise';
import * as registerSuite from 'intern!object';
import * as assert from 'intern/chai!assert';
import { spy, stub, SinonStub } from 'sinon';

import createRouter from 'dojo-routing/createRouter';

import createApp, { DEFAULT_ACTION_STORE, DEFAULT_WIDGET_STORE } from 'src/createApp';

import { stub as stubActionFactory } from '../fixtures/action-factory';
import {
	createAction,
	createStore,
	createWidget,
	rejects,
	strictEqual
} from '../support/createApp';
import stubDom from '../support/stubDom';
import { defer } from '../support/util';
import { Require } from 'dojo-interfaces/loader';
declare const require: Require;

const { toAbsMid } = require;

registerSuite({
	name: 'createApp',

	'#defaultActionStore': {
		'defaults to undefined'() {
			assert.isUndefined(createApp().defaultActionStore);
		},
		'can be set at creation time'() {
			const store = createStore();
			const app = createApp({ defaultActionStore: store });
			assert.strictEqual(app.defaultActionStore, store);
		},
		'can be set after creation'() {
			const store = createStore();
			const app = createApp();
			app.defaultActionStore = store;
			assert.strictEqual(app.defaultActionStore, store);
		},
		'can only be set once'() {
			const store = createStore();
			const app = createApp({ defaultActionStore: store });
			assert.throws(() => app.defaultActionStore = createStore(), Error);
			assert.strictEqual(app.defaultActionStore, store);
		},
		'ends up in the registry'() {
			const store = createStore();
			const app = createApp({ defaultActionStore: store });
			assert.strictEqual(app.identifyStore(store), DEFAULT_ACTION_STORE);
			assert.isTrue(app.hasStore(DEFAULT_ACTION_STORE));
			return app.getStore(DEFAULT_ACTION_STORE).then((actual) => {
				assert.strictEqual(actual, store);
			});
		}
	},

	'#defaultWidgetStore': {
		'defaults to undefined'() {
			assert.isUndefined(createApp().defaultWidgetStore);
		},
		'can be set at creation time'() {
			const store = createStore();
			const app = createApp({ defaultWidgetStore: store });
			assert.strictEqual(app.defaultWidgetStore, store);
		},
		'can be set after creation'() {
			const store = createStore();
			const app = createApp();
			app.defaultWidgetStore = store;
			assert.strictEqual(app.defaultWidgetStore, store);
		},
		'can only be set once'() {
			const store = createStore();
			const app = createApp({ defaultWidgetStore: store });
			assert.throws(() => app.defaultWidgetStore = createStore(), Error);
			assert.strictEqual(app.defaultWidgetStore, store);
		},
		'ends up in the registry'() {
			const store = createStore();
			const app = createApp({ defaultWidgetStore: store });
			assert.strictEqual(app.identifyStore(store), DEFAULT_WIDGET_STORE);
			assert.isTrue(app.hasStore(DEFAULT_WIDGET_STORE));
			return app.getStore(DEFAULT_WIDGET_STORE).then((actual) => {
				assert.strictEqual(actual, store);
			});
		}
	},

	'#router': {
		'defaults to undefined'() {
			assert.isUndefined(createApp().router);
		},
		'can be set at creation time'() {
			const router = createRouter();
			const app = createApp({ router });
			assert.strictEqual(app.router, router);
		},
		'can be set after creation'() {
			const router = createRouter();
			const app = createApp();
			app.router = router;
			assert.strictEqual(app.router, router);
		},
		'can only be set once'() {
			const router = createRouter();
			const app = createApp({ router });
			assert.throws(() => app.router = createRouter(), Error);
			assert.strictEqual(app.router, router);
		}
	},

	'#loadDefinition': {
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
							id: 'bar',
							factory: createStore
						}
					],
					widgets: [
						{
							id: 'baz',
							factory: createWidget
						}
					]
				});

				handle.destroy();
				assert.isTrue(app.hasAction('remains'));
				assert.isFalse(app.hasAction('foo'));
				assert.isFalse(app.hasStore('bar'));
				return app.hasWidget('baz').then((result) => {
					assert.isFalse(result);
				});
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
				require(['tests/fixtures/generic-amd-factory'], (factory) => {
					factory.stub(() => expected);
					resolve();
				});
			}).then(() => {
				const app = createApp();
				app.loadDefinition({
					actions: [
						{
							id: 'foo',
							factory: 'tests/fixtures/generic-amd-factory'
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
		app.registerStore('store', createStore());
		app.registerWidget('widget', createWidget());

		[
			(id: string) => app.registerAction(id, createAction()),
			(id: string) => app.registerActionFactory(id, createAction),
			(id: string) => {
				app.loadDefinition({
					actions: [
						{
							id: id,
							factory: createAction
						}
					]
				});
			},
			(id: string) => app.registerStore(id, createStore()),
			(id: string) => app.registerWidget(id, createWidget())
		].forEach((fn) => {
			for (const id of ['action', 'store', 'widget']) {
				assert.throws(() => fn(id), Error);
			}
		});
	},

	'#registryProvider': (() => {
		const action = createAction();
		const store = createStore();
		const widget = createWidget();
		const app = createApp();
		app.registerAction('action', action);
		app.registerStore('store', store);
		app.registerWidget('widget', widget);
		const { registryProvider } = app;

		return {
			'get(\'actions\') returns an action registry'() {
				const registry = registryProvider.get('actions');
				assert.equal(registry.identify(action), 'action');
				return strictEqual(registry.get('action'), action);
			},

			'get(\'stores\') returns a store registry'() {
				const registry = registryProvider.get('stores');
				assert.equal(registry.identify(store), 'store');
				return strictEqual(registry.get('store'), store);
			},

			'get(\'widgets\') returns a widget registry'() {
				const registry = registryProvider.get('widgets');
				return registry.has('widget').then((result) => {
					assert.isTrue(result);
					assert.equal(registry.identify(widget), 'widget');
					return strictEqual(registry.get('widget'), widget);
				});
			},

			'any other get() call throws'() {
				assert.throws(() => registryProvider.get('foo'), Error, 'No such store: foo');
			}
		};
	})(),

	'#start': (() => {
		let root: Element;
		let stubbedGlobals: Handle;

		return {
			before() {
				stubbedGlobals = stubDom();
				root = document.createElement('div');
			},

			after() {
				stubbedGlobals.destroy();
			},

			'can be called without options'() {
				return createApp().start();
			},

			'realizes root if provided as option'() {
				const app = createApp();
				const realize = spy(app, 'realize');
				app.start({ root });
				assert.isTrue(realize.calledOnce);
			},

			'does not realize if called without root option'() {
				const app = createApp();
				const realize = spy(app, 'realize');
				app.start({});
				assert.isFalse(realize.calledOnce);
			},

			'invokes afterRealize': {
				'if provided as option'() {
					const app = createApp();
					const afterRealize = spy();
					return app.start({ afterRealize }).then(() => {
						assert.isTrue(afterRealize.calledOnce);
					});
				},

				'after root is realized'() {
					const app = createApp();
					const { promise, resolve } = defer();
					stub(app, 'realize').returns(promise);

					const afterRealize = spy();
					const done = app.start({ afterRealize, root });

					return new Promise((resolve) => setTimeout(resolve, 10))
						.then(() => {
							assert.isTrue(afterRealize.notCalled);
							resolve({});
							return done;
						})
						.then(() => {
							assert.isTrue(afterRealize.calledOnce);
						});
				},

				'in a next turn if there is no root to realize'() {
					const app = createApp();
					const afterRealize = spy();
					const done = app.start({ afterRealize });
					assert.isTrue(afterRealize.notCalled);
					return done.then(() => {
						assert.isTrue(afterRealize.calledOnce);
					});
				}
			},

			'starts router': {
				'if the app has one'() {
					const router = createRouter();
					const app = createApp({ router });
					const start = spy(router, 'start');
					return app.start({}).then(() => {
						assert.isTrue(start.calledOnce);
					});
				},

				'even if set by afterRealize'() {
					const router = createRouter();
					const app = createApp();
					const start = spy(router, 'start');
					return app.start({ afterRealize() { app.router = router; }}).then(() => {
						assert.isTrue(start.calledOnce);
					});
				},

				'starts without options if dispatchCurrent is not provided as an option'() {
					const router = createRouter();
					const app = createApp({ router });
					const start = spy(router, 'start');
					return app.start({}).then(() => {
						assert.deepEqual(start.firstCall.args, [undefined]);
					});
				},

				'starts with dispatchCurrent=true if dispatchCurrent option is provided and true'() {
					const router = createRouter();
					const app = createApp({ router });
					const start = spy(router, 'start');
					return app.start({ dispatchCurrent: true }).then(() => {
						assert.deepEqual(start.firstCall.args, [ { dispatchCurrent: true } ]);
					});
				},

				'starts with dispatchCurrent=false if dispatchCurrent option is provided and false'() {
					const router = createRouter();
					const app = createApp({ router });
					const start = spy(router, 'start');
					return app.start({}).then(() => {
						assert.deepEqual(start.firstCall.args, [undefined]);
					});
				},

				'after afterRealize'() {
					const router = createRouter();
					const app = createApp({ router });
					const start = spy(router, 'start');

					const { promise, resolve } = defer();
					const done = app.start({ afterRealize() { return promise; } });

					return new Promise((resolve) => setTimeout(resolve, 10))
						.then(() => {
							assert.isTrue(start.notCalled);
							resolve({});
							return done;
						})
						.then(() => {
							assert.isTrue(start.calledOnce);
						});
				},

				'after root is realized (no afterRealize)'() {
					const router = createRouter();
					const app = createApp({ router });
					const start = spy(router, 'start');

					const { promise, resolve } = defer();
					stub(app, 'realize').returns(promise);

					const done = app.start({ root });

					return new Promise((resolve) => setTimeout(resolve, 10))
						.then(() => {
							assert.isTrue(start.notCalled);
							resolve({});
							return done;
						})
						.then(() => {
							assert.isTrue(start.calledOnce);
						});
				}
			},

			'destroying the resulting handle': {
				'destroys the realization handle'() {
					const app = createApp();

					const realizationHandle = <any> stub({ destroy() {} });
					stub(app, 'realize').returns(Promise.resolve(realizationHandle));

					return app.start({ root }).then((handle) => {
						handle.destroy();
						assert.isTrue((<SinonStub> realizationHandle.destroy).calledOnce);
					});
				},

				'destroys the realization handle *and* router handle'() {
					const router = createRouter();
					const app = createApp({ router });

					const realizationHandle = <any> stub({ destroy() {} });
					stub(app, 'realize').returns(Promise.resolve(realizationHandle));
					const routerHandle = <any> stub({ destroy() {} });
					stub(router, 'start').returns(routerHandle);

					return app.start({ root }).then((handle) => {
						handle.destroy();
						assert.isTrue((<SinonStub> realizationHandle.destroy).calledOnce);
						assert.isTrue((<SinonStub> routerHandle.destroy).calledOnce);
					});
				},

				'destroys the router handle if there is no realization handle'() {
					const router = createRouter();
					const app = createApp({ router });

					const routerHandle = <any> stub({ destroy() {} });
					stub(router, 'start').returns(routerHandle);

					return app.start({}).then((handle) => {
						handle.destroy();
						assert.isTrue((<SinonStub> routerHandle.destroy).calledOnce);
					});
				}
			},

			'pausing the resulting handle': {
				'is a noop if there is no router handle'() {
					return createApp().start({}).then((handle) => {
						assert.doesNotThrow(() => {
							handle.pause();
						});
					});
				},

				'pauses the router handle'() {
					const router = createRouter();
					const app = createApp({ router });

					const routerHandle = <any> stub({ pause() {} });
					stub(router, 'start').returns(routerHandle);

					return app.start({}).then((handle) => {
						handle.pause();
						assert.isTrue((<SinonStub> routerHandle.pause).calledOnce);
					});
				}
			},

			'resuming the resulting handle': {
				'is a noop if there is no router handle'() {
					return createApp().start({}).then((handle) => {
						assert.doesNotThrow(() => {
							handle.resume();
						});
					});
				},

				'resumes the router handle'() {
					const router = createRouter();
					const app = createApp({ router });

					const routerHandle = <any> stub({ resume() {} });
					stub(router, 'start').returns(routerHandle);

					return app.start({}).then((handle) => {
						handle.resume();
						assert.isTrue((<SinonStub> routerHandle.resume).calledOnce);
					});
				}
			},

			'app can only be started once'() {
				const app = createApp();
				app.start();
				assert.throws(() => {
					app.start();
				}, Error, 'start can only be called once');
			}
		};
	})(),

	'correct error message when factories return unexpected instance types'() {
		const app = createApp();

		const action = createAction();
		const store = createStore();

		const handles: Handle[] = [];
		handles.push(
			app.registerActionFactory('foo', () => action),
			app.registerStoreFactory('bar', () => <any> action)
		);

		rejects(
			Promise.all<any>([app.getAction('foo'), app.getStore('foo')]),
			Error,
			'Could not add store, already registered as action with identity foo'
		).then(() => {
			while (true) {
				const h = handles.shift();
				if (!h) {
					break;
				}
				h.destroy();
			}

			handles.push(
				app.registerStoreFactory('bar', () => store),
				app.registerWidgetFactory('bar', () => <any> store)
			);

			rejects(
				Promise.all<any>([app.getStore('bar'), app.getWidget('bar')]),
				Error,
				'Could not add widget, already registered as store with identity bar'
			);
		});
	}
});

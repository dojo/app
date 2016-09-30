import { Handle } from 'dojo-core/interfaces';
import Promise from 'dojo-shim/Promise';
import * as registerSuite from 'intern!object';
import * as assert from 'intern/chai!assert';

import createApp, { DEFAULT_ACTION_STORE, DEFAULT_WIDGET_STORE } from 'src/createApp';

import { stub as stubActionFactory } from '../fixtures/action-factory';
import {
	createAction,
	createStore,
	createWidget,
	rejects,
	strictEqual
} from '../support/createApp';

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
				assert.isFalse(app.hasWidget('baz'));
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
				assert.equal(registry.identify(widget), 'widget');
				return strictEqual(registry.get('widget'), widget);
			},

			'any other get() call throws'() {
				assert.throws(() => registryProvider.get('foo'), Error, 'No such store: foo');
			},

			'is read-only'() {
				assert.throws(() => {
					app.registryProvider = null;
				}, TypeError);
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

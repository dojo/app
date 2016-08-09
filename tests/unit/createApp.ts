import { Handle } from 'dojo-core/interfaces';
import Promise from 'dojo-shim/Promise';
import * as registerSuite from 'intern!object';
import * as assert from 'intern/chai!assert';

import createApp, { DEFAULT_STORE } from 'src/createApp';

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
		},
		'ends up in the registry'() {
			const store = createStore();
			const app = createApp({ defaultStore: store });
			assert.strictEqual(app.identifyStore(store), DEFAULT_STORE);
			assert.isTrue(app.hasStore(DEFAULT_STORE));
			return app.getStore(DEFAULT_STORE).then((actual) => {
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

			'has expected configuration'() {
				const { configurable, enumerable, writable } = Object.getOwnPropertyDescriptor(app, 'registryProvider');
				assert.isFalse(configurable);
				assert.isTrue(enumerable);
				assert.isFalse(writable);
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
			while (handles.length) {
				handles.shift().destroy();
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

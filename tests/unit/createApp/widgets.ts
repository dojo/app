import { EventedListener, EventedListenersMap } from 'dojo-compose/mixins/createEvented';
import createMemoryStore from 'dojo-stores/createMemoryStore';
import Promise from 'dojo-shim/Promise';
import createActualWidget, { Widget as ActualWidget } from 'dojo-widgets/createWidget';
import * as registerSuite from 'intern!object';
import * as assert from 'intern/chai!assert';

import createApp, {
	ActionLike,
	RegistryProvider,
	StoreLike,
	WidgetLike
} from 'src/createApp';

import { stub as stubWidgetFactory } from '../../fixtures/widget-factory';
import widgetInstanceFixture from '../../fixtures/widget-instance';
import {
	createAction,
	createStore,
	createWidget,
	createAsyncSpyWidget,
	createSpyStore,
	createSpyWidget,
	invert,
	rejects,
	strictEqual
} from '../../support/createApp';
import { defer } from '../../support/util';

const { toAbsMid } = require;

registerSuite({
	name: 'createApp (widgets)',

	'#getWidget': {
		'no registered widget'() {
			return rejects(createApp().getWidget('foo'), Error);
		},

		'provides registered widget'() {
			const expected = createWidget();

			const app = createApp();
			app.registerWidget('foo', expected);

			return strictEqual(app.getWidget('foo'), expected);
		},

		'creates and provides widget using factory registered for the states custom type'() {
			const defaultWidgetStore = createSpyStore();
			const app = createApp({ defaultWidgetStore });

			app.registerCustomElementFactory('custom-element', createSpyWidget);

			return defaultWidgetStore.add({id: 'foo', type: 'custom-element'}).then(() => {
				return app.getWidget('foo').then((widget) => {
					assert.equal(widget.tagName, 'div');
				});
			});
		},

		'creates (async) and provides widget using factory registered for the states custom type'() {
			const defaultWidgetStore = createSpyStore();
			const app = createApp({ defaultWidgetStore });

			app.registerCustomElementFactory('custom-element', createAsyncSpyWidget);

			return defaultWidgetStore.add({id: 'foo', type: 'custom-element'}).then(() => {
				return app.getWidget('foo').then((widget) => {
					assert.equal(widget.tagName, 'div');
				});
			});
		},

		'multiple calls to getWidget for the same id, do not result in duplicate widgets being created'() {
			const defaultWidgetStore = createSpyStore();
			const app = createApp({ defaultWidgetStore });

			app.registerCustomElementFactory('custom-element', createAsyncSpyWidget);

			return defaultWidgetStore.add({id: 'foo', type: 'custom-element'}).then(() => {
				const promise1 = app.getWidget('foo');
				const promise2 = app.getWidget('foo');

				return Promise.all([promise1, promise2]);
			})
			.then(([widget1, widget2]) => {
				assert.equal(widget1, widget2);
			});
		},

		'widget created for custom type observes state'() {
			const defaultWidgetStore = createMemoryStore();
			const app = createApp({ defaultWidgetStore });

			app.registerCustomElementFactory('custom-element', createActualWidget);

			return defaultWidgetStore.add({id: 'foo', type: 'custom-element', value: 1}).then(() => {
				return app.getWidget('foo').then((widget: ActualWidget<any>) => {
					assert.equal(widget.state.value, 1);
					return defaultWidgetStore.patch({id: 'foo', value: 2}).then(() => {
						assert.equal(widget.state.value, 2);
					});
				});
			});
		},

		'is rejected with the error thrown by the widget factory'() {
			const expected = new Error();
			const defaultWidgetStore = createSpyStore();
			const app = createApp({ defaultWidgetStore });

			app.registerCustomElementFactory('custom-element', createSpyWidget);
			app.registerWidgetFactory('foo', () => { throw expected; });

			return defaultWidgetStore.add({id: 'foo', type: 'custom-element'}).then(() => {
				return strictEqual(rejects(app.getWidget('foo'), Error), expected);
			});
		},

		'no registered factory for the widget state type'() {
			const defaultWidgetStore = createSpyStore();
			const app = createApp({ defaultWidgetStore });

			return defaultWidgetStore.add({id: 'foo', type: 'custom-element'}).then(() => {
				return rejects(app.getWidget('foo'), Error);
			});
		},

		'no default widget store'() {
			const app = createApp();

			return rejects(app.getWidget('foo'), Error);
		},

		'no state record for id'() {
			const defaultWidgetStore = createSpyStore();
			const app = createApp({ defaultWidgetStore });

			return rejects(app.getWidget('foo'), Error);
		},

		'no type on state record'() {
			const defaultWidgetStore = createSpyStore();
			const app = createApp({ defaultWidgetStore });

			return defaultWidgetStore.add({id: 'foo'}).then(() => {
				return rejects(app.getWidget('foo'), Error);
			});
		}
	},

	'#createWidget': {
		'creation with no options'() {
			return createApp()
				.createWidget(createSpyWidget)
				.then(([ id, widget ]) => {
					assert.include(id, 'app-widget-');
					const { _options, _own, _destroyed } = widget;
					assert.strictEqual(_own.length, 1);
					assert(_options.registryProvider);
					assert.strictEqual(Object.keys(_options).length, 1);
					assert.isFalse(_destroyed);
				});
		},

		'creation with empty options'() {
			return createApp()
				.createWidget(createSpyWidget, {})
				.then(([ id, widget ]) => {
					assert.include(id, 'app-widget-');
					const { _options, _own, _destroyed } = widget;
					assert.strictEqual(_own.length, 1);
					assert(_options.registryProvider);
					assert.strictEqual(Object.keys(_options).length, 1);
					assert.isFalse(_destroyed);
				});
		},

		'supply registry provider'() {
			const registryProvider = {};
			return createApp()
				.createWidget(createSpyWidget, <any> { registryProvider })
				.then(([ id, widget ]) => {
					assert.include(id, 'app-widget-');
					const { _options, _own, _destroyed } = widget;
					assert.strictEqual(_own.length, 1);
					assert.strictEqual(_options.registryProvider, registryProvider);
					assert.strictEqual(Object.keys(_options).length, 1);
					assert.isFalse(_destroyed);
				});
		},

		'rejects when ID already registered'() {
			const app = createApp();
			const widget = createSpyWidget();
			app.registerWidget('foo', widget);
			return rejects(app.createWidget(createSpyWidget, <any> { id: 'foo' }), Error);
		},

		'create with ID and default widget store'() {
			const defaultWidgetStore = createSpyStore();
			return createApp({ defaultWidgetStore })
				.createWidget(createSpyWidget, <any> { id: 'foo' })
				.then(([ id, widget ]) => {
					assert.strictEqual(id, 'foo');
					const { _options } = widget;
					assert.strictEqual(_options.stateFrom, defaultWidgetStore);
					assert.strictEqual(_options.id, 'foo');
					assert(_options.registryProvider);
					assert.strictEqual(Object.keys(_options).length, 3);
					assert.strictEqual(defaultWidgetStore._add.length, 1);
					assert.strictEqual(defaultWidgetStore._add[0].length, 1);
					assert.deepEqual(defaultWidgetStore._add[0][0], { id: 'foo' });
				});
		},

		'create with ID, default widget store and initial state'() {
			const defaultWidgetStore = createSpyStore();
			return createApp({ defaultWidgetStore })
				.createWidget(createSpyWidget, <any> { id: 'foo', state: { foo: 'bar' } })
				.then(([ id, widget ]) => {
					assert.strictEqual(id, 'foo');
					const { _options } = widget;
					assert.strictEqual(_options.stateFrom, defaultWidgetStore);
					assert.strictEqual(_options.id, 'foo');
					assert(_options.registryProvider);
					assert.deepEqual(_options.state, { foo: 'bar' });
					assert.strictEqual(Object.keys(_options).length, 4);
					assert.strictEqual(defaultWidgetStore._add.length, 1);
					assert.strictEqual(defaultWidgetStore._add[0].length, 1);
					assert.deepEqual(defaultWidgetStore._add[0][0], { id: 'foo', foo: 'bar' });
				});
		},

		'create with ID, non-default store and initial state'() {
			const defaultWidgetStore = createSpyStore();
			const widgetStore = createSpyStore();
			return createApp({ defaultWidgetStore })
				.createWidget(createSpyWidget, <any> { id: 'foo', stateFrom: widgetStore, state: { foo: 'bar' } })
				.then(([ id, widget ]) => {
					assert.strictEqual(id, 'foo');
					const { _options } = widget;
					assert.strictEqual(_options.stateFrom, widgetStore);
					assert.strictEqual(_options.id, 'foo');
					assert.strictEqual(defaultWidgetStore._add.length, 0);
					assert.strictEqual(widgetStore._add.length, 1);
					assert.strictEqual(widgetStore._add[0].length, 1);
					assert.deepEqual(widgetStore._add[0][0], { id: 'foo', foo: 'bar' });
				});
		},

		'create with ID, no default store and initial state'() {
			const widgetStore = createSpyStore();
			return createApp()
				.createWidget(createSpyWidget, <any> { id: 'foo', stateFrom: widgetStore, state: { foo: 'bar' } })
				.then(([ id, widget ]) => {
					assert.strictEqual(id, 'foo');
					const { _options } = widget;
					assert.strictEqual(_options.stateFrom, widgetStore);
					assert.strictEqual(_options.id, 'foo');
					assert.strictEqual(widgetStore._add.length, 1);
					assert.strictEqual(widgetStore._add[0].length, 1);
					assert.deepEqual(widgetStore._add[0][0], { id: 'foo', foo: 'bar' });
				});
		}
	},

	'#hasWidget': {
		'no registered widget'() {
			return createApp().hasWidget('foo').then((result) => {
				assert.isFalse(result);
			});
		},

		'registered widget'() {
			const app = createApp();
			app.registerWidget('foo', createWidget());

			return app.hasWidget('foo').then((result) => {
				assert.isTrue(result);
			});
		},

		'registered custom element for the type associated to the widget ids state'() {
			const defaultWidgetStore = createSpyStore();
			const app = createApp({ defaultWidgetStore });
			app.registerCustomElementFactory('custom-element', createSpyWidget);

			return defaultWidgetStore.add({ id: 'foo', type: 'custom-element' }).then(() => {
				return app.hasWidget('foo').then((result) => {
					assert.isTrue(result);
				});
			});
		},

		'no registered custom element for the type associated to the widget ids state'() {
			const defaultWidgetStore = createSpyStore();
			const app = createApp({ defaultWidgetStore });
			app.registerCustomElementFactory('custom-element', createSpyWidget);

			return defaultWidgetStore.add({ id: 'foo', type: 'unregistered-type' }).then(() => {
				return app.hasWidget('foo').then((result) => {
					assert.isFalse(result);
				});
			});
		}

	},

	'#identifyWidget': {
		'widget instance has not been registered'() {
			assert.throws(() => {
				createApp().identifyWidget(createWidget());
			}, Error, 'Could not identify widget');
		},

		'widget instance has been registered'() {
			const widget = createWidget();
			const app = createApp();
			app.registerWidget('foo', widget);
			assert.equal(app.identifyWidget(widget), 'foo');
		},

		'called with a registered non-widget instance'() {
			const app = createApp();
			const action = createAction();
			app.registerAction('foo', action);
			assert.throws(() => {
				app.identifyWidget(<any> action);
			}, Error, 'Could not identify widget');
		}
	},

	'#registerWidget': {
		'widget may only be registered once'() {
			const widget = createWidget();
			const app = createApp();
			app.registerWidget('foo', widget);

			assert.throws(
				() => app.registerWidget('bar', widget),
				Error,
				'Could not add widget, already registered as widget with identity foo'
			);
		},

		'destroying the returned handle': {
			'deregisters the action'() {
				const widget = createWidget();
				const app = createApp();

				const handle = app.registerWidget('foo', widget);
				handle.destroy();

				return app.hasWidget('foo').then((result) => {
					assert.isFalse(result);
					assert.doesNotThrow(() => app.registerWidget('bar', widget));
				});
			},

			'a second time has no effect'() {
				const widget = createWidget();

				const app = createApp();
				const handle = app.registerWidget('foo', widget);

				handle.destroy();
				handle.destroy();

				return app.hasWidget('foo').then((result) => {
					assert.isFalse(result);
				});
			}
		}
	},

	'#registerWidgetFactory': {
		'hasWidget returns true after'() {
			const app = createApp();
			app.registerWidgetFactory('foo', createWidget);

			return app.hasWidget('foo').then((result) => {
				assert.isTrue(result);
			});
		},

		'factory is not called until the widget is needed'() {
			let called = false;

			const app = createApp();
			app.registerWidgetFactory('foo', function(): WidgetLike {
				called = true;
				return createWidget();
			});

			assert.isFalse(called);

			return app.hasWidget('foo').then(() => {
				assert.isFalse(called);

				const promise = app.getWidget('foo');
				assert.isFalse(called);

				return promise.then(() => {
					assert.isTrue(called);
				});
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
			let actual: { [p: string]: any };
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

		'factory is called with an options object that has a registryProvider property'() {
			let actual: { [p: string]: any };
			const app = createApp();
			app.registerWidgetFactory('foo', (options: any) => {
				actual = options;
				return createWidget();
			});

			return app.getWidget('foo').then(() => {
				assert.isOk(actual);
				assert.strictEqual(actual['registryProvider'], app.registryProvider);
			});
		},

		'the stateFrom option is set to the default widget store, if any'() {
			let actual: { [p: string]: any };
			const store = createStore();
			const app = createApp({ defaultWidgetStore: store });
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

		'the produced widget must be unique'() {
			const widget = createWidget();
			const app = createApp();
			app.registerWidget('foo', widget);
			app.registerWidgetFactory('bar', () => widget);

			return rejects(app.getWidget('bar'), Error, 'Could not add widget, already registered as widget with identity foo');
		},

		'destroying the returned handle': {
			'deregisters the factory'() {
				const app = createApp();
				const handle = app.registerWidgetFactory('foo', createWidget);
				handle.destroy();

				return app.hasWidget('foo').then((result) => {
					assert.isFalse(result);
				});
			},

			'prevents a pending widget instance from being registered'() {
				const widget = createWidget();
				const { resolve, promise } = defer();

				const app = createApp();
				const handle = app.registerWidgetFactory('foo', () => promise);

				app.getWidget('foo');
				handle.destroy();
				resolve(widget);

				return new Promise((resolve) => setTimeout(resolve, 10)).then(() => {
					assert.throws(() => app.identifyWidget(widget));
				});
			},

			'deregisters the widget if it has already been created'() {
				const app = createApp();
				const handle = app.registerWidgetFactory('foo', createWidget);

				return app.getWidget('foo').then(() => {
					handle.destroy();

					return app.hasWidget('foo').then((result) => {
						assert.isFalse(result);
					});
				});
			},

			'a second time has no effect'() {
				const app = createApp();
				const handle = app.registerWidgetFactory('foo', createWidget);

				return app.getWidget('foo').then(() => {
					handle.destroy();
					handle.destroy();

					return app.hasWidget('foo').then((result) => {
						assert.isFalse(result);
					});
				});
			}
		}
	},

	'#loadDefinition': {
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

			return Promise.all([
				app.hasWidget('foo'),
				app.hasWidget('bar')
			])
			.then(([fooResult, barResult]) => {
				assert.isTrue(fooResult);
				assert.isTrue(barResult);
				return Promise.all([
					strictEqual(app.getWidget('foo'), expected.foo),
					strictEqual(app.getWidget('bar'), expected.bar)
				]);
			});
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

		'options cannot include the registryProvider property'() {
			assert.throws(() => {
				createApp().loadDefinition({
					widgets: [
						{
							id: 'foo',
							factory: createWidget,
							options: {
								registryProvider: 'bar'
							}
						}
					]
				});
			}, TypeError, 'registryProvider option must not be specified');
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
							factory: '../../fixtures/widget-factory'
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
							factory: '../../fixtures/no-factory-export'
						}
					]
				});

				return rejects(app.getWidget('foo'), Error, 'Could not resolve \'../../fixtures/no-factory-export\' to a widget factory function');
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
							factory: '../../fixtures/widget-factory'
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

			'the factory\'s stateFrom option is set to the default widget store, if any'() {
				let actual: { [p: string]: any };
				const store = createStore();
				const app = createApp({ defaultWidgetStore: store });
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

			'the definition\'s stateFrom option takes precedence over the default widget store, if any'() {
				let actual: { [p: string]: any };
				const app = createApp({ defaultWidgetStore: createStore() });
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
								factory: '../../fixtures/widget-factory'
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
								factory: '../../fixtures/widget-factory'
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
				stubWidgetFactory((options: any) => {
					delete options.id;
					delete options.registryProvider;
					actual.bar = options;
					return createWidget();
				});

				const app = createApp({ toAbsMid });
				app.loadDefinition({
					widgets: [
						{
							id: 'foo',
							factory(options: any) {
								delete options.id;
								delete options.registryProvider;
								actual.foo = options;
								return createWidget();
							},
							options: expected.foo
						},
						{
							id: 'bar',
							factory: '../../fixtures/widget-factory',
							options: expected.bar
						}
					]
				});

				return Promise.all([
					app.getWidget('foo'),
					app.getWidget('bar')
				]).then(() => {
					assert.deepEqual(actual.foo, expected.foo);
					assert.deepEqual(actual.bar, expected.bar);
				});
			},

			'factory is always passed id and registryProvider options'() {
				interface Options {
					id: string;
					registryProvider: RegistryProvider;
				}

				let fooOptions: Options;
				let barOptions: Options;
				stubWidgetFactory((options: Options) => {
					barOptions = options;
					return createWidget();
				});

				const app = createApp({ toAbsMid });
				app.loadDefinition({
					widgets: [
						{
							id: 'foo',
							factory(options: Options) {
								fooOptions = options;
								return createWidget();
							}
						},
						{
							id: 'bar',
							factory: '../../fixtures/widget-factory'
						}
					]
				});

				return Promise.all([
					app.getWidget('foo'),
					app.getWidget('bar')
				]).then(() => {
					assert.equal(fooOptions.id, 'foo');
					assert.strictEqual(fooOptions.registryProvider, app.registryProvider);
					assert.equal(barOptions.id, 'bar');
					assert.strictEqual(barOptions.registryProvider, app.registryProvider);
				});
			},

			'with listeners option': {
				'factory is passed action references in its listeners option'() {
					const expected = {
						foo: createAction(),
						bar: createAction()
					};
					let actual: EventedListenersMap;

					const app = createApp();
					app.registerAction('foo', expected.foo);
					app.registerAction('bar', expected.bar);
					app.loadDefinition({
						widgets: [
							{
								id: 'baz',
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

					return app.getWidget('baz').then(() => {
						assert.strictEqual(actual['foo'], expected.foo);
						assert.strictEqual(actual['bar'], expected.bar);
					});
				},

				'listeners may be functions, rather than action identifiers'() {
					const expected = {
						foo: createAction(),
						bar(evt: any) {}
					};
					let actual: EventedListenersMap;

					const app = createApp();
					app.registerAction('foo', expected.foo);
					app.loadDefinition({
						widgets: [
							{
								id: 'bar',
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

					return app.getWidget('bar').then(() => {
						assert.strictEqual(actual['foo'], expected.foo);
						assert.strictEqual(actual['bar'], expected.bar);
					});
				},

				'an array of listeners may be specified'() {
					const expected = [createAction(), (evt: any) => {}];
					let actual: EventedListenersMap;

					const app = createApp();
					app.registerAction('foo', <ActionLike> expected[0]);
					app.loadDefinition({
						widgets: [
							{
								id: 'bar',
								factory(options: any) {
									actual = options.listeners;
									return createWidget();
								},
								listeners: {
									foo: ['foo', expected[1]],
									bar: [expected[1]],
									baz: expected
								}
							}
						]
					});

					return app.getWidget('bar').then(() => {
						const foo = <EventedListener<any>[]> actual['foo'];
						assert.strictEqual(foo[0], expected[0]);
						assert.strictEqual(foo[1], expected[1]);

						const bar = <EventedListener<any>[]> actual['bar'];
						assert.strictEqual(bar, expected[1]);

						const baz = <EventedListener<any>[]> actual['baz'];
						assert.strictEqual(baz[0], expected[0]);
						assert.strictEqual(baz[1], expected[1]);
					});
				}
			},

			'with stateFrom option': {
				'factory is passed a store reference in its stateFrom option'() {
					const expected = createStore();
					let actual: StoreLike;

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
					let actual: StoreLike;

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
						widgets: [
							{
								id: 'foo',
								factory() {
									calls.push('factory');
									return createWidget();
								},
								state,
								stateFrom: store
							}
						]
					});

					return app.getWidget('foo').then(() => {
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
					app.defaultWidgetStore = store;
					app.loadDefinition({
						widgets: [
							{
								id: 'foo',
								factory() {
									calls.push('factory');
									return createWidget();
								},
								state
							}
						]
					});

					return app.getWidget('foo').then(() => {
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
						widgets: [
							{
								id: 'foo',
								factory() {
									calls.push('factory');
									return createWidget();
								},
								state,
								stateFrom: store
							}
						]
					});

					return app.getWidget('foo').then(() => {
						assert.deepEqual(calls, ['add', 'factory']);
					});
				},

				'the factory is called even if there is no store to add state to'() {
					let calls: string[] = [];

					const app = createApp();
					app.loadDefinition({
						widgets: [
							{
								id: 'foo',
								factory() {
									calls.push('factory');
									return createWidget();
								},
								state: { foo: 'bar' }
							}
						]
					});

					return app.getWidget('foo').then(() => {
						assert.deepEqual(calls, ['factory']);
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
							instance: '../../fixtures/widget-instance'
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
							instance: '../../fixtures/no-instance-export'
						}
					]
				});

				return rejects(app.getWidget('foo'), Error, 'Could not resolve \'../../fixtures/no-instance-export\' to a widget instance');
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

			'state option is not allowed'() {
				assert.throws(() => {
					createApp().loadDefinition({
						widgets: [
							{
								id: 'foo',
								instance: createWidget(),
								state: {}
							}
						]
					});
				}, TypeError, 'Cannot specify state option when widget definition points directly at an instance');
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
	}
});

# dojo-app

[![Build Status](https://travis-ci.org/dojo/app.svg?branch=master)](https://travis-ci.org/dojo/app)
[![codecov.io](https://codecov.io/gh/dojo/app/branch/master/graph/badge.svg)](https://codecov.io/gh/dojo/app/branch/master)
[![npm version](https://badge.fury.io/js/dojo-app.svg)](http://badge.fury.io/js/dojo-app)

A library for wiring up Dojo 2 applications.

**WARNING** This is *alpha* software. It is not yet production ready, so you should use at your own risk.

Dojo 2 applications consist of widgets, stores and actions. Stores provide data to widgets, widgets call actions, and actions mutate data in stores.

This library provides an application factory which lets you define actions, stores and widgets. It takes care of lazily loading them, wiring actions to events emitted by widgets, and making widgets and actions observe stores that hold their state.

It provides an implementation of Custom Elements, allowing you to attach previously registered widgets or indeed register widget factories for custom elements.

## Features

The examples below are provided in TypeScript syntax. The package does work under JavaScript, but for clarity, the examples will only include one syntax.

### Creating an application

```ts
import createApp from 'dojo-app/createApp';

const app = createApp();
```

You can also define a default action and widget stores at creation time:

```ts
import createMemoryStore from 'dojo-widgets/util/createMemoryStore';

const defaultActionStore = createMemoryStore();
const defaultWidgetStore = createMemoryStore();
const app = createApp({ defaultActionStore, defaultWidgetStore });
```

Or you can, *just once*, assign default stores:

```ts
import createMemoryStore from 'dojo-widgets/util/createMemoryStore';

const app = createApp();
app.defaultActionStore = createMemoryStore();
app.defaultWidgetStore = createMemoryStore();
```

This store will be used as the `stateFrom` option to widget and custom element factories, unless another store is specified.

Similarly you can define a [router](https://github.com/dojo/routing) at creation time:

```ts
import createRouter from 'dojo-routing/createRouter';

const router = createRouter();
const app = createApp({ router });
```

Or (again just once), assign the router:

```ts
import createRouter from 'dojo-routing/createRouter';

const app = createApp();
app.router = createRouter();
```

### Functional API

#### Registering actions

If you already have instantiated an action:

```ts
import createAction from 'dojo-actions/createAction';

const action = createAction({
	do() {
		// something
	}
});

app.registerAction('my-action', action);
```

You can also register a factory method which creates the action only when needed:

```ts
app.registerActionFactory('my-lazy-action', (options) => {
	return createAction({
		do() {
			// something else
		}
	});
});
```

Note that an action instance may only be registered once. A factory is not allowed to return a previously registered instance.

The `options` object may have a `stateFrom` property, set to the default action store. A [registry provider](#registry-providers) is available under the `registryProvider` property.

#### Registering custom element factories

```ts
import createWidget from 'dojo-widgets/createWidget';

app.registerCustomElementFactory('tag-name', createWidget);
```

A factory for a custom element should return a unique widget instance. It receives an `options` object with an optional `id` property and other options from the custom element.

Tag names must be [valid according to the Custom Elements spec](https://www.w3.org/TR/custom-elements/#valid-custom-element-name). Additionally names starting with `app-` are reserved. Names are automatically lowercased before the factory is registered.

#### Registering stores

If you already have instantiated a store:

```ts
import createMemoryStore from 'dojo-widgets/util/createMemoryStore';

const store = createMemoryStore();

app.registerStore('my-store', store);
```

You can also register a factory method which creates the store only when needed:

```ts
app.registerStoreFactory('my-lazy-store', () => {
	return createMemoryStore();
});
```

Note that a store instance may only be registered once. A factory is not allowed to return a previously registered instance.

#### Registering widgets

If you already have instantiated a widget:

```ts
import createWidget from 'dojo-widgets/createWidget';

const widget = createWidget();

app.registerWidget('my-widget', widget);
```

You can also register a factory method which creates the widget only when needed:

```ts
app.registerWidgetFactory('my-lazy-widget', (options) => {
	return createWidget(options);
});
```

The `options` object will have an `id` property set to `my-lazy-widget`. A [registry provider](#registry-providers) is available under the `registryProvider` property.

Note that a widget instance may only be registered once. A factory is not allowed to return a previously registered instance.

#### Seeing if an action, store or widget is registered

To see whether a particular action, store or widget is registered, use the `has*()` methods:

```ts
app.hasAction('my-action');
app.hasStore('my-store');
app.hasWidget('my-widget');
```
The `hasAction` and `hasStore` methods return `true` if the respective item was registered, and `false` if not.

The `hasWidget` method returns a promise, rather than a boolean. It is resolved with `true` if a widget instance or factory has been registered with that ID, or if a widget can be created based on the default widget store and registered custom elements. Otherwise it's resolved with `false`. See [Loading an action, store or widget](#loading-an-action-store-or-widget) for more.

Besides checking `app.defaultActionStore` or `app.defaultWidgetStore` you can use the `DEFAULT_ACTION_STORE` and `DEFAULT_WIDGET_STORE` symbols to see if the respective default store was provided:

```ts
import { DEFAULT_ACTION_STORE, DEFAULT_WIDGET_STORE } from 'dojo-app/createApp';

app.hasStore(DEFAULT_ACTION_STORE);
app.hasStore(DEFAULT_WIDGET_STORE);
```

#### Finding the ID under which an action, store or widget was registered

To find the ID under which a particular action, store or widget instance was registered, use the `identify*()` methods:

```ts
app.identifyAction(action);
app.identifyStore(store);
app.identifyWidget(widget);
```

Each method returns the ID string if the respective instance was registered, or throws an error if not.

Note that the default action store, if any, is registered under the `DEFAULT_ACTION_STORE` symbol, *not* an ID string. The same goes for the default widget store, which is registered under the `DEFAULT_WIDGET_STORE` symbol.

#### Loading an action, store or widget

You can load previously registered actions, stores and widgets using the `get*()` methods:

```ts
app.getAction('my-action');
app.getStore('my-store');
app.getWidget('my-widget');
```

Each method returns a promise for the respective item. If the item was not registered or could not be loaded, the promise is rejected.

Widgets may be created dynamically based on state in the default widget store. If the store contains an item for the requested ID, and that item has a `type` attribute that matches a registered custom element name, the requested widget will be created using the custom element factory. This only happens if there was no registered instance or factory for the requested ID.

Besides accessing `app.defaultActionStore` or `app.defaultWidgetStore` you can use the `DEFAULT_ACTION_STORE` and `DEFAULT_WIDGET_STORE` symbols to get the respective default store:

```ts
import { DEFAULT_ACTION_STORE, DEFAULT_WIDGET_STORE } from 'dojo-app/createApp';

app.getStore(DEFAULT_ACTION_STORE);
app.getStore(DEFAULT_WIDGET_STORE);
```

#### Configuring actions

You might want to export an action from a module, and then register this module with the app factory:

```ts
// my-action.ts
import createAction from 'dojo-actions/createAction';

export default createAction({
	do() {
		// something
	}
});

// my-app.ts
import createApp from 'dojo-app/createApp';

import myAction from './my-action';

const app = createApp();
app.registerAction('my-action', myAction);
```

However if the action needs to access a store that is lazily loaded you'd then need a reference to the application factory in order to access the store.

To make this easier the application factory calls `configure()` on actions after they've been loaded. The configuration object is the [registry provider](#registry-providers).

For example, to store a reference to a particular store, you could do:

```ts
// my-action.ts
import createAction from 'dojo-actions/createAction';
import { RegistryProvider } from 'dojo-app/createApp';
import { MemoryStore } from 'dojo-widgets/util/createMemoryStore';

interface MyAction {
	store: MemoryStore<Object>;
}

export default createAction.extend<MyAction>({})({
	configure(registryProvider: RegistryProvider) {
		return registryProvider.get('stores').get('my-store').then((store) => {
			(<MyAction> this).store = store;
		});
	},

	do() {
		const { store } = <MyAction> this;
		return store.patch({ id: 'some-object', value: 'some-value' });
	}
});
```

If you registered an action factory you can do something similar, without having to implement the `configure()` method:

```ts
// my-action-factory.ts
import createAction from 'dojo-actions/createAction';
import { ActionFactory } from 'dojo-app/createApp';
import { MemoryStore } from 'dojo-widgets/util/createMemoryStore';

export default (function({ registryProvider }) {
	return registryProvider.get('stores').get('my-store').then((store) => {
		return createAction({
			do() {
				return (<MemoryStore<Object>> store).patch({ id: 'some-object', value: 'some-value' });
			}
		});
	});
} as ActionFactory);
```

#### Describing applications

The above examples show how to register individual objects and factories. However you can also describe and load entire applications with a single method call:

```ts
import createApp from 'dojo-app/createApp';

const app = createApp();
app.loadDefinition({
	actions: [
		// describe actions here
	],
	customElements: [
		// describe custom elements here
	],
	stores: [
		// describe stores here
	],
	widgets: [
		// describe widgets here
	]
});
```

Each action, store and widget definition is an object. It must have an `id` property which uniquely identifies that particular item. (You can have an action and a store with the same ID however, or a store and a widget.)

Further, definitions must either have a `factory` or an `instance` property. With `factory` you must specify either a module identifier string or a factory function that can create the appropriate action, store or widget. With `instance` you can also specify a module identifier string, or alternatively an action, store or widget instance as appropriate.

Note that if an action, store or widget instance is provided to the `instance` option, the `identify*()` methods will not return their associated ID until the respective `get*()` methods have been called.

The application factory must be loaded with [`dojo-loader`](https://github.com/dojo/loader) in order to resolve module identifiers. Both ES and UMD modules are supported. The default export is used as the `factory` or `instance` value.

Custom element definitions must have a `name` property, which must be a [valid custom element name](https://www.w3.org/TR/custom-elements/#valid-custom-element-name) (and not start with `app-`). They must also have the `factory` property, but *not* the `id` and `instance` properties

##### Action definitions

You might be tempted to specify `dojo-actions/createAction` as the `factory` in action definitions. However actions must be created with a `do()` implementation and this implementation cannot be specified in the definition object. You'll have to use your own factory method, like in the `registerActionFactory()` example above, or point directly at an action instance.

If you use your own factory method you can use the `stateFrom` option in the action definition. This can be an actual store or a string identifier for a store that is registered with the application factory. The store will be lazily loaded when the action is needed, and is then passed to the factory method as its second argument. You can now set up your action so it observes the store for its state.

If the `stateFrom` option is not used, but a default action store is provided, that default action store will be passed to the factory.

Use the `state` property to define an initial state that is added to the actions's store before the action is created, if any. This will be done lazily once the action is needed. The store is assumed to reject the initial state if it already contains state for the action. This error will be ignored and the action will be created with whatever state was already in the store.

##### Store definitions

If you use `factory` in your store definition you can use the `options` property to specify an object that is passed when the factory is called.

##### Widget definitions

Like stores, widget factories typically take an options argument. Widget definitions too support the `options` property, letting you specify the object that is passed when the factory is called.

The `options` object must not contain `id`, `listeners`, `state` and `stateFrom` properties. These need to be specified in the widget definition itself.

Use the `children` property to define nested widgets that are lazily loaded when their parent widget is needed. Values may be arrays or objects. The array may contain widget IDs or nested definitions. Similarly the object values may be widget IDs or nested definitions. Widgets from nested definitions are available across the app. It is assumed the parent widget can handle the array or object `children` option.

Use the `listeners` object to automatically wire events emitted by the widget. Keys are event types. Values are event listeners, actions, string identifiers for actions that are registered with the application factory, or an array containing such values.

Use the `state` property to define an initial state that is added to the widget's store before the widget is created, if any. This will be done lazily once the widget is needed. The store is assumed to reject the initial state if it already contains state for the widget. This error will be ignored and the widget will be created with whatever state was already in the store.

Use the `stateFrom` property to specify the store that the widget should observe for its state. It can be an actual store or a string identifier for a store that is registered with the application factory.

These actions and stores will be lazily loaded when the widget is needed.

##### Relative module identifiers

Module identifiers are resolved relative to the `dojo-app/createApp` module. You can provide a `toAbsMid()` function when creating the application factory to implement your own module resolution logic.

For instance if you bootstrap your application in `my-app/main`, and you want to use module identifiers relative to that module, you could do:

```ts
import createApp from 'dojo-app/createApp';

const app = createApp({ toAbsMid: require.toAbsMid });
app.loadDefinition({
	actions: [
		{
			id: 'my-action',
			factory: './actions/mine'
		}
	]
});
```

This uses the `require()` function available to `my-app/main`, which will resolve module identifiers relative to itself.

#### Deregistering

The various `register*()` and `register*Factory()` methods return a handle. Call `destroy()` on this handle to deregister the action, custom element, store or widget from the application factory.

`loadDefinition()` also returns a handle. Destroying it will deregister *all* actions, stores and widgets that were registered as part of the definition.

Note that destroying handles will not destroy any action, store or widget instances.

#### Registry providers

The registry provider can provide read-only registries for actions, stores and widgets. It's available under `app.registryProvider`, passed to action and widget factories as the `registryProvider` option, and used when configuring actions.

Use `registryProvider.get('actions')` to get an action registry. `registryProvider.get('stores')` gives you a store registry, and `registryProvider.get('widgets')` a widget registry.

Each registry has `get()` and `identify()` methods. These behave the same as the `get*()` and `identify*()` methods of the application.

### Declarative DSL

The application factory allows you to define actions and stores declaratively, in HTML. You can also render widgets and custom elements. This is done using the `App#realize(root: Element)` method.

`App#realize()` returns a promise. It is rejected when errors occur (e.g. bad `data-options` values, or a factory throwing an error). Otherwise it is fulfilled with a `Handle` object. Use the `destroy()` method to unregister the registered actions and stores, as well as destroy widgets.

The following custom elements are recognized:

* `<app-action>`
* `<app-actions>`
* `<app-element>`
* `<app-projector>`
* `<app-router>`
* `<app-store>`
* `<app-widget>`

These are matched case-insensitively. You can also use the `is` attribute, for example `<div is="app-projector">`.

#### Defining actions

Use `<app-action>` to define an action. Specify its ID using the `data-uid` or `id` attribute (`data-uid` takes precedence). Use the `data-factory` attribute to specify the module ID for a factory function which can create the action when it's needed. The function must be the default export of the module.

Alternatively use the `data-from` attribute to import an existing action, again by specifying its module ID. To import a specific member, use the `data-import` attribute. When using `data-from` it's not necessary to specify `data-uid` or `id`. If used, the `data-import` value will be used as the action ID. Otherwise the filename portion of the `data-from` module ID is used.

Modules are only loaded when the action is needed.

The `data-state-from` attribute may be used to specify a store that the action should observe for its state. This is only available when the action is created through a factory. If not set the default action store is used (if any).

Use the `data-state` attribute to specify an initial state object, encoded as a JSON string. This initial state will be added to the action's store before it's created. The store is assumed to reject the initial state if it already contains state for the action. This error will be ignored and the action will be created with whatever state was already in the store.

Use `<app-actions>` to load action instances from a module. The `data-from` attribute must be used to specify the module ID. The module is loaded immediately. Its non-default members are assumed to be action instances. The member names will be used as the action IDs.

#### Defining the router

Use `<app-router>` to define a router. Use the `data-from` attribute to import the router, again by specifying its module ID. To import a specific member, use the `data-import` attribute. Note that a router can only be defined once.

#### Defining stores

Use `<app-store>` to define a store. Specify its ID using the `data-uid` or `id` attribute (`data-uid` takes precedence). Use the `data-factory` attribute to specify the module ID for a factory function which can create the store when it's needed. The function must be the default export of the module.

Alternatively use the `data-from` attribute to import an existing store, again by specifying its module ID. To import a specific member, use the `data-import` attribute. When using `data-from` it's not necessary to specify `data-uid` or `id`. If used, the `data-import` value will be used as the store ID. Otherwise the filename portion of the `data-from` module ID is used.

Use the `data-type` attribute with value `action` or `widget` to define a default action or widget store. The store ID is ignored (and optional) when `data-type` is used. Note that default stores can only be defined once.

The optional `data-options` attribute can be used to specify an options object, encoded as a JSON string. It's passed to the factory when creating the store, so `data-options` can only be used together with `data-factory`.

Modules are only loaded when the store is needed.

#### Defining widgets

Use `<app-widget>` to define a widget. Specify its ID using the `data-uid` or `id` attribute (`data-uid` takes precedence). Use the `data-factory` attribute to specify the module ID for a factory function which can create the widget when it's needed. The function must be the default export of the module.

Alternatively use the `data-from` attribute to import an existing widget, again by specifying its module ID. To import a specific member, use the `data-import` attribute. When using `data-from` it's not necessary to specify `data-uid` or `id`. If used, the `data-import` value will be used as the widget ID. Otherwise the filename portion of the `data-from` module ID is used.

Modules are only loaded when the widget is needed.

The `data-listeners`, `data-options`, `data-state` and `data-state-from` attributes may be used together with `data-factory`. See the section on [rendering widgets](#rendering-widgets) for details.

#### Defining custom elements

Use `<app-element>` to define a custom element. Specify its name using the `data-name` attribute. Use the `data-factory` attribute to specify the module ID for a factory function which can create the widget when it's needed. The function must be the default export of the module.

Modules are only loaded when the widget is needed.

#### Rendering widgets

Widgets are rendered inside a projector. You can declare (multiple) projector slots in your DOM tree using the `app-projector` custom element. These projectors must not be nested. Other custom elements can only occur within a `app-projector`. You can pass a single `app-projector` element as the `root` argument to `App#realize()`.

All descending custom elements are replaced by rendered widgets. Widgets for nested elements are appended to their parent widget. Regular (non-custom) DOM nodes inside custom elements are not preserved, however regular DOM nodes within a `app-projector` element are.

Custom elements are matched (case-insensitively) to registered factories. First the tag name is matched. If no factory is found, and the element has an `is` attribute, that value is used to find a factory. Unrecognized elements are left in the DOM where possible.

A factory options object can be provided in the DOM by setting the `data-options` attribute to a JSON string. The options object must not have an `id` property, instead the `data-uid` or `id` attribute should be used. It also must not have a `stateFrom` property, the `data-state-from` should be used instead. Similarly use the `data-listeners` attribute instead of the `listeners` property, and the `data-state` attribute instead of the `state` property.

Widgets can be identified through a `data-uid` or `id` attribute. The `data-uid` attribute takes precedence over the `id` attribute. It's valid to use the different attributes, but only the most specific ID will be passed to the factory (in its `options` object).

The `data-listeners` attribute may be used to specify a widget listener map. Values for each event type can be action identifiers or arrays thereof. These properties are resolved to the actual store and action instances before the factory is called. Additional properties are passed to the factory as-is.

The `data-state-from` attribute may be used on custom elements to specify a store identifier. This will only take effect if a widget ID is also specified. The `stateFrom` property on the options object that is passed to the factory will be set to the referenced store.

A default widget store may be configured by setting the `data-state-from` attribute on the `app-projector` custom element. It applies to all descendant elements that have IDs, though they can override it by setting their own `data-state-from` attribute or configuring `stateFrom` in their `data-options`.

Custom elements that have widget IDs and a `stateFrom` store may set their `data-state` attribute to an initial state object, encoded as a JSON string. This initial state will be added to the store before the widget is created. The store is assumed to reject the initial state if it already contains state for the widget. This error will be ignored and the widget will be created with whatever state was already in the store.

The previously mentioned `app-widget` custom element can be used to render a specific widget. It can be declared using the `data-factory` or `data-from` attributes. Alternatively use the `data-uid` or `id` attribute to reference a widget that was registered using the functional API.

A widget ID can only be used once within an application. Similarly a widget instance can only be rendered once. The `getWidget()`, `hasWidget()` and `identifyWidget()` methods will work with widgets created by custom element factories.

Destroying the handle returned by `App#realize()` also destroys projectors. Widgets rendered through `app-widget` are left as-is.

Given this application definition:

```ts
import createContainer from 'dojo-widgets/createContainer';
import createWidget from 'dojo-widgets/createWidget';
import createMemoryStore from 'dojo-widgets/util/createMemoryStore';

app.loadDefinition({
	actions: [
		{
			id: 'an-action',
			instance: './my-action'
		}
	],
	customElements: [
		{
			name: 'dojo-container',
			factory: createContainer
		},
		{
			name: 'a-widget',
			factory: createWidget
		}
	],
	stores: [
		{
			id: 'widget-state',
			instance: createMemoryStore({
				data: [
					{ id: 'widget-1', classes: [ 'awesome' ] }
				]
			})
		}
	],
	widgets: [
		{
			id: 'widget-2',
			instance: createWidget({ tagName: 'strong' })
		}
	]
});

app.realize(document.body);
```

And this `<body>`:

```html
<body>
	<app-projector>
		<div>
			<dojo-container>
				<a-widget data-uid="widget-1" data-options='{"tagName":"mark"}' data-listeners='{"click":"an-action"}' data-state-from="widget-state"></a-widget>
				<div>
					<div is="app-widget" id="widget-2"></div>
				</div>
			</dojo-container>
		</div>
	</app-projector>
</body>
```

The realized DOM will be:

```html
<body>
	<app-projector>
		<div>
			<dojo-container>
				<mark class="awesome"></mark>
				<strong></strong>
			</dojo-container>
		</div>
	</app-projector>
</body>
```

### Starting the application

Use `App#start()` to start the application. If you provide the `root` option the `root` element is realized first. If a router was defined it is automatically started upon realization. The `dispatchCurrent` option is forwarded to `Router#start()`.

Sometimes an application requires more setup after realization, but before the router is started. Provide a callback for the `afterRealize` option that takes care of it. It may return a promise if necessary.

`App#start()` returns a promise for a pausable handle. Pausing and resuming is forwarded to the handle returned by `Router#start()`. Destroying the handle destroys the router and the realization of the `root` element.

`App#start()` may only be called once.

For example:

```ts
app.start({
	root: document.body,
	afterRealize() {
		return new Promise((resolve) => {
			// further setup
			resolve();
		});
	},
	dispatchCurrent: false
});
```

## How do I use this package?

TODO: Add appropriate usage and instruction guidelines

## How do I contribute?

We appreciate your interest!  Please see the [Dojo 2 Meta Repository](https://github.com/dojo/meta#readme) for the
Contributing Guidelines and Style Guide.

## Testing

Test cases MUST be written using [Intern](https://theintern.github.io) using the Object test interface and Assert assertion interface.

90% branch coverage MUST be provided for all code submitted to this repository, as reported by istanbul’s combined coverage results for all supported platforms.

To test locally in node run:

`grunt test`

To test against browsers with a local selenium server run:

`grunt test:local`

To test against BrowserStack or Sauce Labs run:

`grunt test:browserstack`

or

`grunt test:saucelabs`

## Licensing information

© 2017 JS Foundation & contributors. [New BSD](http://opensource.org/licenses/BSD-3-Clause) license.

# dojo-app

[![Build Status](https://travis-ci.org/dojo/app.svg?branch=master)](https://travis-ci.org/dojo/app)
[![codecov.io](http://codecov.io/gh/dojo/app/branch/master/graph/badge.svg)](http://codecov.io/gh/dojo/app/branch/master)

A library for wiring up Dojo 2 applications.

**WARNING** This is *alpha* software. It is not yet production ready, so you should use at your own risk.

Dojo 2 applications consist of widgets, stores and actions. Stores provide data to widgets, widgets call actions, and actions mutate data in stores.

This library provides an application factory which lets you define actions, stores and widgets. It takes care of lazily loading them, wiring actions to events emitted by widgets, and making widgets and actions observe stores that hold their state.

## Features

The examples below are provided in TypeScript syntax. The package does work under JavaScript, but for clarity, the examples will only include one syntax.

### Creating an application

```ts
import createApp from 'dojo-app/createApp';

const app = createApp();
```

### Registering actions

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
app.registerActionFactory('my-lazy-action', () => {
	return createAction({
		do() {
			// something else
		}
	});
});
```

### Registering stores

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

### Registering widgets

If you already have instantiated a widget:

```ts
import createWidget from 'dojo-widgets/createWidget';

const widget = createWidget();

app.registerWidget('my-widget', widget);
```

You can also register a factory method which creates the widget only when needed:

```ts
app.registerWidgetFactory('my-lazy-store', () => {
	return createWidget();
});
```

### Seeing if an action, store or widget is registered

To see whether a particular action, store or widget is registered, use the `has*()` methods:

```ts
app.hasAction('my-action');
app.hasStore('my-store');
app.hasWidget('my-widget');
```

Each method returns `true` if the respective item was registered, and `false` if not.

### Loading an action, store or widget

You can load previously registered actions, stores and widgets using the `get*()` methods:

```ts
app.getAction('my-action');
app.getStore('my-store');
app.getWidget('my-widget');
```

Each method returns a promise for the respective item. If the item was not registered or could not be loaded, the promise is rejected.

### Configuring actions

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

To make this easier the application factory calls `configure()` on actions after they've been loaded. The configuration object contains the same `has*()` and `get*()` methods that are available on the application factory itself.

For example, to store a reference to a particular store, you could do:

```ts
// my-action.ts
import createAction from 'dojo-actions/createAction';
import { CombinedRegistry } from 'dojo-app/createApp';
import { MemoryStore } from 'dojo-widgets/util/createMemoryStore';

interface MyAction {
	store: MemoryStore<Object>;
}

export default createAction.extend<MyAction>({})({
	configure(registry: CombinedRegistry) {
		return registry.getStore('my-store').then((store) => {
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
import { CombinedRegistry } from 'dojo-app/createApp';
import { MemoryStore } from 'dojo-widgets/util/createMemoryStore';

export default function(registry: CombinedRegistry) {
	return registry.getStore('my-store').then((store) => {
		return createAction({
			do() {
				return (<MemoryStore<Object>> store).patch({ id: 'some-object', value: 'some-value' });
			}
		});
	});
}
```

### Describing applications

The above examples show how to register individual objects and factories. However you can also describe and load entire applications with a single method call:

```ts
import createApp from 'dojo-app/createApp';

const app = createApp();
app.loadDefinition({
	actions: [
		// describe actions here
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

The application factory must be loaded with [`dojo-loader`](https://github.com/dojo/loader) in order to resolve module identifiers. Both ES and UMD modules are supported. The default export is used as the `factory` or `instance` value.

#### Action definitions

You might be tempted to specify `dojo-actions/createAction` as the `factory` in action definitions. However actions must be created with a `do()` implementation and this implementation cannot be specified in the definition object. You'll have to use your own factory method, like in the `registerActionFactory()` example above, or point directly at an action instance.

However this means you miss out on one feature of the `dojo-actions/createAction` factory: automatically observing a store for the action's state. Ordinarily this is done by passing the store in the `stateFrom` option when creating the action.

The application factory lets you specify a similar `stateFrom` option in the action definition itself. It can be an actual store or a string identifier for a store that is registered with the application factory.

The store will be lazily loaded when the action is needed, and the appropriate methods will be called so the action can observe the store for its state.

#### Store definitions

If you use `factory` in your store definition you can use the `options` property to specify an object that is passed when the factory is called.

#### Widget definitions

Like stores, widget factories typically take an options argument. Widget definitions too support the `options` property, letting you specify the object that is passed when the factory is called.

The `options` object must not contain `id`, `listeners` and `stateFrom` properties. These need to be specified in the widget definition itself.

Use the `listeners` object to automatically wire events emitted by the widget. Keys are event types, values are event listeners, actions, or string identifiers for actions that are registered with the application factory.

Use the `stateFrom` property to specify the store that the widget should observe for its state. It can be an actual store or a string identifier for a store that is registered with the application factory.

These actions and stores will be lazily loaded when the widget is needed.

#### Relative module identifiers

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

### Deregistering

The various `register*()` and `register*Factory()` methods return a handle. Call `destroy()` on this handle to deregister the action, store or widget from the application factory.

`loadDefinition()` also returns a handle. Destroying it will deregister *all* actions, stores and widgets that were registered as part of the definition.

Note that destroying handles will not destroy any action, store or widget instances.

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

© 2004–2016 Dojo Foundation & contributors. [New BSD](http://opensource.org/licenses/BSD-3-Clause) license.

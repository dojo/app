import { Action } from 'dojo-actions/createAction';
import compose, { ComposeFactory } from 'dojo-compose/compose';
import { EventedListener, EventedListenersMap } from 'dojo-compose/mixins/createEvented';
import { ObservableState, State } from 'dojo-compose/mixins/createStateful';
import { Handle } from 'dojo-core/interfaces';
import Promise from 'dojo-core/Promise';
import WeakMap from 'dojo-core/WeakMap';

import IdentityRegistry from './IdentityRegistry';

const noop = () => {};

/**
 * Any kind of action.
 */
export type ActionLike = Action<any, any, any>;

/**
 * Any kind of store.
 */
export type StoreLike = ObservableState<State>;

/**
 * Any kind of widget.
 * FIXME: There isn't an official Widget interface. Is this even useful?
 */
export type WidgetLike = Object;

/**
 * Actions, stores and widgets should have string identifiers.
 */
export type Identifier = string;

/**
 * Read-only interface for the combined registries of the app factory.
 */
export interface CombinedRegistry {
	/**
	 * Get the action with the given identifier.
	 *
	 * Note that the action may still need to be loaded when this method is called.
	 *
	 * @param id Identifier for the action
	 * @return A promise for when the action has been loaded. Rejected if loading fails or if no action is registered
	 *   with the given identifier.
	 */
	getAction(id: Identifier): Promise<ActionLike>;

	/**
	 * Check whether an action has been registered with the given identifier.
	 *
	 * @param id Identifier for the action
	 * @return `true` if an action has been registered, `false` otherwise.
	 */
	hasAction(id: Identifier): boolean;

	/**
	 * Get the store with the given identifier.
	 *
	 * Note that the store may still need to be loaded when this method is called.
	 *
	 * @param id Identifier for the store
	 * @return A promise for when the store has been loaded. Rejected if loading fails or if no store is registered
	 *   with the given identifier.
	 */
	getStore(id: Identifier): Promise<StoreLike>;

	/**
	 * Check whether a store has been registered with the given identifier.
	 *
	 * @param id Identifier for the store
	 * @return `true` if a store has been registered, `false` otherwise.
	 */
	hasStore(id: Identifier): boolean;

	/**
	 * Get the widget with the given identifier.
	 *
	 * Note that the widget may still need to be loaded when this method is called.
	 *
	 * @param id Identifier for the widget
	 * @return A promise for when the widget has been loaded. Rejected if loading fails or if no widget is registered
	 *   with the given identifier.
	 */
	getWidget(id: Identifier): Promise<WidgetLike>;

	/**
	 * Check whether a widget has been registered with the given identifier.
	 *
	 * @param id Identifier for the widget
	 * @return `true` if a widget has been registered, `false` otherwise.
	 */
	hasWidget(id: Identifier): boolean;
}

/**
 * Function that maps a (relative) module identifier to an absolute one.
 */
export interface ToAbsMid {
	(moduleId: string): string;
}

/**
 * Factory method to (asynchronously) create an action.
 *
 * @param registry The combined registries of the app
 * @return The action, or a promise for it
 */
export interface ActionFactory {
	(registry: CombinedRegistry): ActionLike | Promise<ActionLike>;
}

/**
 * Factory method to (asynchronously) create a store.
 *
 * @return The store, or a promise for it
 */
export interface StoreFactory {
	(options?: Object): StoreLike | Promise<StoreLike>;
}

/**
 * Factory method to (asynchronously) create a widget.
 *
 * @return The widget, or a promise for it
 */
export interface WidgetFactory {
	(options?: Object): WidgetLike | Promise<WidgetLike>;
}

/**
 * Plain old JavaScript object that contains definitions of actions, stores and widgets.
 */
export interface Definitions {
	/**
	 * Action definitions.
	 */
	actions?: ActionDefinition[];

	/**
	 * Store definitions.
	 */
	stores?: StoreDefinition[];

	/**
	 * Widget definitions.
	 */
	widgets?: WidgetDefinition[];
}

/**
 * Base definition for a single action, store or widget.
 */
export interface ItemDefinition<Factory, Instance> {
	/**
	 * Identifier for which the action, store or widget is to be registered.
	 */
	id: Identifier;

	/**
	 * Factory to create an action, store or widget, or a module identifier that resolves to
	 * such a factory.
	 */
	factory?: Factory | string;

	/**
	 * An action, store or widget instance, or a module identifier that resolves to such
	 * an instance.
	 */
	instance?: Instance | string;
}

/**
 * Definition for a single action.
 */
export interface ActionDefinition extends ItemDefinition<ActionFactory, ActionLike> {
	/**
	 * Identifier of a store which the action should observe for its state.
	 *
	 * When the action is created it'll automatically observe this store.
	 */
	stateFrom?: Identifier | StoreLike;
}

/**
 * Definition for a single store.
 */
export interface StoreDefinition extends ItemDefinition<StoreFactory, StoreLike> {
	/**
	 * Optional options object passed to the store factory.
	 */
	options?: Object;
}

/**
 * Definition for a single widget.
 */
export interface WidgetDefinition extends ItemDefinition<WidgetFactory, WidgetLike> {
	listeners?: WidgetListeners;

	/**
	 * Identifier of a store which the widget should observe for its state.
	 *
	 * When the widget is created, the store is passed as the `stateFrom` option.
	 */
	stateFrom?: Identifier | StoreLike;

	/**
	 * Optional options object passed to the widget factory. Must not contain `id` and `stateFrom` properties.
	 */
	options?: Object;
}

export interface WidgetListeners {
	[eventType: string]: Identifier | EventedListener<any>;
}

export type Factory = ActionFactory | StoreFactory | WidgetFactory;
export type Instance = ActionLike | StoreLike | WidgetLike;
export type FactoryTypes = 'action' | 'store' | 'widget';
const errorStrings: { [type: string]: string } = {
	action: 'an action',
	store: 'a store',
	widget: 'a widget'
};

interface RegisteredFactory<T> {
	(): Promise<T>;
}

const actions = new WeakMap<App, IdentityRegistry<RegisteredFactory<ActionLike>>>();
const stores = new WeakMap<App, IdentityRegistry<RegisteredFactory<StoreLike>>>();
const widgets = new WeakMap<App, IdentityRegistry<RegisteredFactory<WidgetLike>>>();

function resolveListeners(registry: CombinedRegistry, definition: WidgetDefinition) {
	const { listeners: defined } = definition;
	if (!defined) {
		return null;
	}

	const map: EventedListenersMap = {};
	const eventTypes = Object.keys(defined);
	return eventTypes.reduce((promise, eventType) => {
		const ref = defined[eventType];
		if (typeof ref !== 'string') {
			map[eventType] = ref;
			return promise;
		}

		return registry.getAction(<string> ref).then((action) => {
			map[eventType] = action;
			return promise;
		});
	}, Promise.resolve(map));
}

function resolveStore(registry: CombinedRegistry, definition: ActionDefinition | WidgetDefinition): void | StoreLike | Promise<StoreLike> {
	const { stateFrom } = definition;
	if (!stateFrom) {
		return null;
	}

	if (typeof stateFrom !== 'string') {
		return stateFrom;
	}

	return registry.getStore(<string> stateFrom);
}

export interface AppMixin {
	/**
	 * Register an action with the app.
	 *
	 * @param id How the action is identified
	 * @param action The action to be registered
	 * @return A handle to deregister the action
	 */
	registerAction(id: Identifier, action: ActionLike): Handle;

	/**
	 * Register an action factory with the app.
	 *
	 * The factory will be called the first time the action is needed. It'll be called with *one* argument:
	 * the combined registries of the app.
	 *
	 * Note that the `createAction()` factory from `dojo-actions` cannot be used here since it requires you to define
	 * the `do()` implementation, which the app factory does not allow.
	 *
	 * @param id How the action is identified
	 * @param factory A factory function that (asynchronously) creates an action.
	 * @return A handle to deregister the action factory, or the action itself once it's been created
	 */
	registerActionFactory(id: Identifier, factory: ActionFactory): Handle;

	/**
	 * Register a store with the app.
	 *
	 * @param id How the store is identified
	 * @param store The store to be registered
	 * @return A handle to deregister the store
	 */
	registerStore(id: Identifier, store: StoreLike): Handle;

	/**
	 * Register a store factory with the app.
	 *
	 * The factory will be called the first time the store is needed. It'll be called *without* any arguments.
	 *
	 * @param id How the store is identified
	 * @param factory A factory function that (asynchronously) creates a store.
	 * @return A handle to deregister the store factory, or the store itself once it's been created
	 */
	registerStoreFactory(id: Identifier, factory: StoreFactory): Handle;

	/**
	 * Register a widget with the app.
	 *
	 * @param id How the widget is identified
	 * @param widget The widget to be registered
	 * @return A handle to deregister the widget
	 */
	registerWidget(id: Identifier, widget: WidgetLike): Handle;

	/**
	 * Register a widget factory with the app.
	 *
	 * The factory will be called the first time the widget is needed. It'll be called *without* any arguments.
	 *
	 * @param id How the widget is identified
	 * @param factory A factory function that (asynchronously) creates a widget.
	 * @return A handle to deregister the widget factory, or the widget itself once it's been created
	 */
	registerWidgetFactory(id: Identifier, factory: WidgetFactory): Handle;

	/**
	 * Load a POJO definition containing actions, stores and widgets that need to be registered.
	 *
	 * Action factories will be called with one argument: the combined registries of the app.
	 * Store and widget factories will also be called with one argument: an options object.
	 *
	 * @return A handle to deregister *all* actions, stores and widgets that were registered.
	 */
	loadDefinition(definitions: Definitions): Handle;

	_resolveMid(mid: string): Promise<any>;
	_resolveFactory(type: 'action', definition: ActionDefinition): Promise<ActionFactory>;
	_resolveFactory(type: 'store', definition: StoreDefinition): Promise<StoreFactory>;
	_resolveFactory(type: 'widget', definition: WidgetDefinition): Promise<WidgetFactory>;
	_resolveFactory(type: FactoryTypes, definition: ItemDefinition<Factory, Instance>): Promise<Factory>;
	_makeActionFactory(definition: ActionDefinition): ActionFactory;
	_makeStoreFactory(definition: StoreDefinition): StoreFactory;
	_makeWidgetFactory(definition: WidgetDefinition): WidgetFactory;

	_toAbsMid: ToAbsMid;
	_registry: CombinedRegistry;
}

export type App = AppMixin & CombinedRegistry;

export interface AppOptions {
	toAbsMid?: ToAbsMid;
}

export interface AppFactory extends ComposeFactory<App, AppOptions> {}

const createApp = compose({
	registerAction(id: Identifier, action: ActionLike): Handle {
		let registryHandle = actions.get(this).register(id, () => {
			const promise = new Promise<void>((resolve) => {
				resolve(action.configure(this._registry));
			}).then(() => action);
			registryHandle.destroy();
			registryHandle = actions.get(this).register(id, () => promise);

			return promise;
		});

		return {
			destroy() {
				this.destroy = noop;
				registryHandle.destroy();
			}
		};
	},

	registerActionFactory(id: Identifier, factory: ActionFactory): Handle {
		let registryHandle = actions.get(this).register(id, () => {
			const promise = Promise.resolve().then(() => {
				// Always call the factory in a future turn. This harmonizes behavior regardless of whether the
				// factory is registered through this method or loaded from a definition.
				return factory(this._registry);
			});
			registryHandle.destroy();
			registryHandle = actions.get(this).register(id, () => promise);

			return promise.then((action) => {
				return Promise.resolve(action.configure(this._registry)).then(() => action);
			});
		});

		return {
			destroy() {
				this.destroy = noop;
				registryHandle.destroy();
			}
		};
	},

	registerStore(id: Identifier, store: StoreLike): Handle {
		const promise = Promise.resolve(store);
		return stores.get(this).register(id, () => promise);
	},

	registerStoreFactory(id: Identifier, factory: StoreFactory): Handle {
		let registryHandle = stores.get(this).register(id, () => {
			const promise = Promise.resolve().then(() => {
				// Always call the factory in a future turn. This harmonizes behavior regardless of whether the
				// factory is registered through this method or loaded from a definition.
				return factory();
			});
			registryHandle.destroy();
			registryHandle = stores.get(this).register(id, () => promise);
			return promise;
		});

		return {
			destroy() {
				this.destroy = noop;
				registryHandle.destroy();
			}
		};
	},

	registerWidget(id: Identifier, widget: WidgetLike): Handle {
		const promise = Promise.resolve(widget);
		return widgets.get(this).register(id, () => promise);
	},

	registerWidgetFactory(id: Identifier, factory: WidgetFactory): Handle {
		let registryHandle = widgets.get(this).register(id, () => {
			const promise = Promise.resolve().then(() => {
				// Always call the factory in a future turn. This harmonizes behavior regardless of whether the
				// factory is registered through this method or loaded from a definition.
				return factory();
			});
			registryHandle.destroy();
			registryHandle = widgets.get(this).register(id, () => promise);
			return promise;
		});

		return {
			destroy() {
				this.destroy = noop;
				registryHandle.destroy();
			}
		};
	},

	loadDefinition({ actions, stores, widgets }: Definitions): Handle {
		const handles: Handle[] = [];

		if (actions) {
			for (const definition of actions) {
				const factory = this._makeActionFactory(definition);
				const handle = this.registerActionFactory(definition.id, factory);
				handles.push(handle);
			}
		}

		if (stores) {
			for (const definition of stores) {
				const factory = this._makeStoreFactory(definition);
				const handle = this.registerStoreFactory(definition.id, factory);
				handles.push(handle);
			}
		}

		if (widgets) {
			for (const definition of widgets) {
				const factory = this._makeWidgetFactory(definition);
				const handle = this.registerWidgetFactory(definition.id, factory);
				handles.push(handle);
			}
		}

		return {
			destroy() {
				for (const handle of handles.splice(0, handles.length)) {
					handle.destroy();
				}
			}
		};
	},

	_resolveMid (mid: string): Promise<any> {
		return new Promise((resolve) => {
			// Assumes require() is an AMD loader!
			require([this._toAbsMid(mid)], (module) => {
				if (module.__esModule) {
					resolve(module.default);
				}
				else {
					resolve(module);
				}
			});
		});
	},

	_resolveFactory (type: FactoryTypes, { factory, instance }: ItemDefinition<Factory, Instance>): Promise<Factory> {
		if (typeof factory === 'function') {
			return Promise.resolve(factory);
		}

		if (typeof instance === 'object') {
			return Promise.resolve(() => instance);
		}

		const mid = <string> (factory || instance);
		return (<App> this)._resolveMid(mid).then((defaultExport) => {
			if (factory) {
				if (typeof defaultExport !== 'function') {
					throw new Error(`Could not resolve '${mid}' to ${errorStrings[type]} factory function`);
				}

				return defaultExport;
			}

			// istanbul ignore else Action factories are expected to guard against definitions with neither
			// factory or instance properties.
			if (instance) {
				if (!defaultExport || typeof defaultExport !== 'object') {
					throw new Error(`Could not resolve '${mid}' to ${errorStrings[type]} instance`);
				}

				return () => defaultExport;
			}
		});
	},

	_makeActionFactory(definition: ActionDefinition): ActionFactory {
		if (!('factory' in definition || 'instance' in definition)) {
			throw new Error('Action definitions must specify either the factory or instance option');
		}
		if ('instance' in definition && 'stateFrom' in definition) {
			throw new Error('Cannot specify stateFrom option when action definition points directly at an instance');
		}

		return (registry: CombinedRegistry) => {
			return Promise.all<any>([
				(<App> this)._resolveFactory('action', definition).then((factory) => {
					return factory(registry);
				}),
				resolveStore(registry, definition)
			]).then((values) => {
				let action: ActionLike;
				let store: StoreLike;
				[action, store] = values;

				if (store) {
					// No options are passed to the factory, since the do() implementation cannot be specified in
					// action definitions. This means the state observation has to be done after the action is created.
					action.own(action.observeState(definition.id, store));
				}

				return action;
			});
		};
	},

	_makeStoreFactory(definition: StoreDefinition): StoreFactory {
		if (!('factory' in definition || 'instance' in definition)) {
			throw new Error('Store definitions must specify either the factory or instance option');
		}
		if ('instance' in definition && 'options' in definition) {
			throw new Error('Cannot specify options when store definition points directly at an instance');
		}

		const options = Object.assign({}, definition.options);

		return () => {
			return (<App> this)._resolveFactory('store', definition).then((factory) => {
				return factory(options);
			});
		};
	},

	_makeWidgetFactory(definition: WidgetDefinition): WidgetFactory {
		if (!('factory' in definition || 'instance' in definition)) {
			throw new Error('Widget definitions must specify either the factory or instance option');
		}
		if ('instance' in definition) {
			if ('listeners' in definition) {
				throw new Error('Cannot specify listeners option when widget definition points directly at an instance');
			}
			if ('stateFrom' in definition) {
				throw new Error('Cannot specify stateFrom option when widget definition points directly at an instance');
			}
			if ('options' in definition) {
				throw new Error('Cannot specify options when widget definition points directly at an instance');
			}
		}

		let { options } = definition;
		if (options && ('id' in options || 'listeners' in options || 'stateFrom' in options)) {
			throw new Error('id, listeners and stateFrom options should be in the widget definition itself, not its options value');
		}
		options = Object.assign({ id: definition.id }, options);

		return () => {
			return Promise.all<any>([
				(<App> this)._resolveFactory('widget', definition),
				resolveListeners(this, definition),
				resolveStore(this, definition)
			]).then((values) => {
				let factory: WidgetFactory;
				let listeners: EventedListenersMap;
				let store: StoreLike;
				[factory, listeners, store] = values;

				if (listeners) {
					(<any> options).listeners = listeners;
				}

				if (store) {
					(<any> options).stateFrom = store;
				}

				return factory(options);
			});
		};
	}
})
.mixin({
	mixin: {
		getAction(id: Identifier): Promise<ActionLike> {
			return new Promise((resolve) => {
				resolve(actions.get(this).get(id)());
			});
		},

		hasAction(id: Identifier): boolean {
			return actions.get(this).hasId(id);
		},

		getStore(id: Identifier): Promise<StoreLike> {
			return new Promise((resolve) => {
				resolve(stores.get(this).get(id)());
			});
		},

		hasStore(id: Identifier): boolean {
			return stores.get(this).hasId(id);
		},

		getWidget(id: Identifier): Promise<WidgetLike> {
			return new Promise((resolve) => {
				resolve(widgets.get(this).get(id)());
			});
		},

		hasWidget(id: Identifier): boolean {
			return widgets.get(this).hasId(id);
		}
	},

	initialize (instance: App, { toAbsMid = (moduleId: string) => moduleId }: AppOptions = {}) {
		instance._toAbsMid = toAbsMid;

		instance._registry = {
			getAction: instance.getAction.bind(instance),
			hasAction: instance.hasAction.bind(instance),
			getStore: instance.getStore.bind(instance),
			hasStore: instance.hasStore.bind(instance),
			getWidget: instance.getWidget.bind(instance),
			hasWidget: instance.hasWidget.bind(instance)
		};
		Object.freeze(instance._registry);

		actions.set(instance, new IdentityRegistry<RegisteredFactory<ActionLike>>());
		stores.set(instance, new IdentityRegistry<RegisteredFactory<StoreLike>>());
		widgets.set(instance, new IdentityRegistry<RegisteredFactory<WidgetLike>>());
	}
}) as AppFactory;

export default createApp;

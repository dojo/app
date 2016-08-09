import { Action } from 'dojo-actions/createAction';
import compose, { ComposeFactory } from 'dojo-compose/compose';
import { EventedListener } from 'dojo-compose/mixins/createEvented';
import { ObservableState, State } from 'dojo-compose/mixins/createStateful';
import { Handle } from 'dojo-core/interfaces';
import Promise from 'dojo-shim/Promise';
import Set from 'dojo-shim/Set';
import Symbol from 'dojo-shim/Symbol';
import WeakMap from 'dojo-shim/WeakMap';
import { Renderable } from 'dojo-widgets/mixins/createRenderable';

import IdentityRegistry from './IdentityRegistry';
import {
	makeActionFactory,
	makeCustomElementFactory,
	makeStoreFactory,
	makeWidgetFactory
} from './lib/factories';
import InstanceRegistry from './lib/InstanceRegistry';
import makeMidResolver, { ToAbsMid, ResolveMid } from './lib/moduleResolver';
import realizeCustomElements, {
	isValidName,
	normalizeName
} from './lib/realizeCustomElements';
import RegistryProvider from './lib/RegistryProvider';

export { RegistryProvider, ToAbsMid };

/**
 * Any kind of action.
 */
export type ActionLike = Action<any, any, any>;

/**
 * Any kind of store.
 */
export type StoreLike = ObservableState<State> & {
	add<T>(item: T, options?: any): Promise<T>;
}

/**
 * Any kind of widget.
 */
export type WidgetLike = Renderable;

/**
 * Factory method to (asynchronously) create an action.
 *
 * @param registry The combined registries of the app
 * @param store The store that was defined for this action. It's the factories responsibility to create an action that
 *   observes the store
 * @return The action, or a promise for it
 */
export interface ActionFactory {
	(registry: CombinedRegistry, store: StoreLike): ActionLike | Promise<ActionLike>;
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
	 * Custom element definitions.
	 */
	customElements?: CustomElementDefinition[];

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
 * Actions, stores and widgets should have string identifiers.
 */
export type Identifier = string;

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
	 *
	 * Note that the `DEFAULT_ACTION_STORE` and `DEFAULT_WIDGET_STORE` identifiers are not supported. The default action
	 * store is automatically used if stateFrom is not provided.
	 */
	stateFrom?: Identifier | StoreLike;
}

/**
 * Definition for a custom element;
 */
export interface CustomElementDefinition {
	/**
	 * The name of the custom element. Must be valid according to
	 * <https://www.w3.org/TR/custom-elements/#valid-custom-element-name>.
	 */
	name: string;

	/**
	 * Factory to create a widget, or a module identifier that resolves to such a factory.
	 */
	factory: WidgetFactory | string;
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
	/**
	 * Any listeners that should automatically be attached to the widget.
	 */
	listeners?: WidgetListenersMap;

	/**
	 * Initial state, to be added to the widget's store, if any.
	 */
	state?: any;

	/**
	 * Identifier of a store which the widget should observe for its state.
	 *
	 * When the widget is created, the store is passed as the `stateFrom` option.
	 *
	 * Note that the `DEFAULT_ACTION_STORE` and `DEFAULT_WIDGET_STORE` identifiers are not supported. The default widget
	 * store is automatically used if stateFrom is not provided.
	 */
	stateFrom?: Identifier | StoreLike;

	/**
	 * Optional options object passed to the widget factory. Must not contain `id`, `listeners` and `stateFrom`
	 * properties.
	 */
	options?: Object;
}

/**
 * A listener for widgets, as used in definitions. May be an identifier for an action or an actual event listener.
 */
export type WidgetListener = Identifier | EventedListener<any>;

export type WidgetListenerOrArray = WidgetListener | WidgetListener[];

/**
 * A map of listeners where the key is the event type.
 */
export interface WidgetListenersMap {
	[eventType: string]: WidgetListenerOrArray;
}

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
	 * Look up the identifier for which the given action has been registered.
	 *
	 * Throws if the value hasn't been registered.
	 *
	 * @param action The action
	 * @return The identifier
	 */
	identifyAction(action: ActionLike): Identifier;

	/**
	 * Get the factory for the custom element with the given name.
	 *
	 * @param name Name of the custom element
	 * @return A factory to create a widget for the custom element.
	 */
	getCustomElementFactory(name: string): WidgetFactory;

	/**
	 * Check whether a custom element has been registered with the given name.
	 *
	 * @param name Name of the custom element
	 * @return `true` if a custom element has been registered, `false` otherwise.
	 */
	hasCustomElementFactory(name: string): boolean;

	/**
	 * Get the store with the given identifier.
	 *
	 * Note that the store may still need to be loaded when this method is called.
	 *
	 * @param id Identifier for the store
	 * @return A promise for when the store has been loaded. Rejected if loading fails or if no store is registered
	 *   with the given identifier.
	 */
	getStore(id: Identifier | symbol): Promise<StoreLike>;

	/**
	 * Check whether a store has been registered with the given identifier.
	 *
	 * @param id Identifier for the store
	 * @return `true` if a store has been registered, `false` otherwise.
	 */
	hasStore(id: Identifier | symbol): boolean;

	/**
	 * Look up the identifier for which the given store has been registered.
	 *
	 * Throws if the value hasn't been registered.
	 *
	 * @param store The store
	 * @return The identifier
	 */
	identifyStore(store: StoreLike): Identifier | symbol;

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

	/**
	 * Look up the identifier for which the given widget has been registered.
	 *
	 * Throws if the value hasn't been registered.
	 *
	 * @param widget The widget
	 * @return The identifier
	 */
	identifyWidget(widget: WidgetLike): Identifier;
}

export interface AppMixin {
	/**
	 * A default store to be used as the `stateFrom` option to action factories, unless another store is specified.
	 */
	defaultActionStore?: StoreLike;

	/**
	 * A default store to be used as the `stateFrom` option to widget and custom element factories, unless another
	 * store is specified.
	 */
	defaultWidgetStore?: StoreLike;

	/**
	 * Provides access to read-only registries for actions, stores and widgets.
	 */
	registryProvider: RegistryProvider;

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
	 * Register a widget factory for a custom element.
	 *
	 * The factory will be called each time a widget instance is needed. It may be called with an options argument
	 * derived from a `data-options` attribute on the custom element that is to be be replaced by the created widget.
	 *
	 * @param name The name of the custom element. Must be valid according to
	 *   <https://www.w3.org/TR/custom-elements/#valid-custom-element-name>.
	 * @param factory A factory that (asynchronously) creates a widget.
	 * @return A handle to deregister the custom element
	 */
	registerCustomElementFactory(name: string, factory: WidgetFactory): Handle;

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
	 * The factory will be called the first time the widget is needed. It'll be called with an options object
	 * that has its `id` property set to the widget ID.
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

	/**
	 * Take a root element and replace <app-widget> elements with widget instances.
	 *
	 * @param root The root element that is searched for <app-widget> elements
	 * @return A handle to detach rendered widgets from the DOM and remove them from the widget registry
	 */
	realize(root: Element): Promise<Handle>;
}

export type App = AppMixin & CombinedRegistry;

export interface AppOptions {
	/**
	 * A default store to be used as the `stateFrom` option to action factories, unless another store is specified.
	 */
	defaultActionStore?: StoreLike;

	/**
	 * A default store to be used as the `stateFrom` option to widget and custom element factories, unless another
	 * store is specified.
	 */
	defaultWidgetStore?: StoreLike;

	/**
	 * Function that maps a (relative) module identifier to an absolute one. Used to resolve relative module
	 * identifiers in definitions.
	 */
	toAbsMid?: ToAbsMid;
}

export interface AppFactory extends ComposeFactory<App, AppOptions> {}

/**
 * Identifier for the default action store, if any.
 */
export const DEFAULT_ACTION_STORE = Symbol('Identifier for default action stores');

/**
 * Identifier for the default widget store, if any.
 */
export const DEFAULT_WIDGET_STORE = Symbol('Identifier for default widget stores');

const noop = () => {};

type RegisteredFactory<T> = () => T | Promise<T>;
const actionFactories = new WeakMap<App, IdentityRegistry<RegisteredFactory<ActionLike>>>();
const customElementFactories = new WeakMap<App, IdentityRegistry<WidgetFactory>>();
const identifiers = new WeakMap<App, Set<Identifier>>();
const storeFactories = new WeakMap<App, IdentityRegistry<RegisteredFactory<StoreLike>>>();
const widgetFactories = new WeakMap<App, IdentityRegistry<RegisteredFactory<WidgetLike>>>();

const instanceRegistries = new WeakMap<App, InstanceRegistry>();
const midResolvers = new WeakMap<App, ResolveMid>();
const publicRegistries = new WeakMap<App, CombinedRegistry>();
const registryProviders = new WeakMap<App, RegistryProvider>();
const widgetInstances = new WeakMap<App, IdentityRegistry<WidgetLike>>();

function addIdentifier(app: App, id: Identifier) {
	const set = identifiers.get(app);
	if (set.has(id)) {
		throw new Error(`'${id}' has already been used as an identifier`);
	}

	set.add(id);

	return {
		destroy() {
			this.destroy = noop;
			set.delete(id);
		}
	};
}

function registerInstance(app: App, instance: WidgetLike, id: string): Handle {
	// Maps the instance to its ID
	const instanceHandle = instanceRegistries.get(app).addWidget(instance, id);
	// Maps the ID to the instance
	const idHandle = widgetInstances.get(app).register(id, instance);

	return {
		destroy() {
			this.destroy = noop;
			instanceHandle.destroy();
			idHandle.destroy();
		}
	};
}

const createApp = compose({
	set defaultActionStore(store: StoreLike) {
		const app: App = this;
		instanceRegistries.get(app).addStore(store, DEFAULT_ACTION_STORE);
		storeFactories.get(app).register(DEFAULT_ACTION_STORE, () => store);
	},

	get defaultActionStore() {
		const app: App = this;
		const factories = storeFactories.get(app);
		if (factories.hasId(DEFAULT_ACTION_STORE)) {
			return <StoreLike> factories.get(DEFAULT_ACTION_STORE)();
		}
		else {
			return null;
		}
	},

	set defaultWidgetStore(store: StoreLike) {
		const app: App = this;
		instanceRegistries.get(app).addStore(store, DEFAULT_WIDGET_STORE);
		storeFactories.get(app).register(DEFAULT_WIDGET_STORE, () => store);
	},

	get defaultWidgetStore() {
		const app: App = this;
		const factories = storeFactories.get(app);
		if (factories.hasId(DEFAULT_WIDGET_STORE)) {
			return <StoreLike> factories.get(DEFAULT_WIDGET_STORE)();
		}
		else {
			return null;
		}
	},

	get registryProvider() {
		const app: App = this;
		return registryProviders.get(app);
	},

	registerAction(id: Identifier, action: ActionLike): Handle {
		const app: App = this;

		const idHandle = addIdentifier(app, id);
		const instanceHandle = instanceRegistries.get(app).addAction(action, id);

		const promise = new Promise<void>((resolve) => {
			resolve(action.configure(publicRegistries.get(app)));
		}).then(() => action);
		const registryHandle = actionFactories.get(app).register(id, () => promise);

		return {
			destroy() {
				this.destroy = noop;
				idHandle.destroy();
				instanceHandle.destroy();
				registryHandle.destroy();
			}
		};
	},

	registerActionFactory(id: Identifier, factory: ActionFactory): Handle {
		const app: App = this;

		const idHandle = addIdentifier(app, id);

		let destroyed = false;
		let instanceHandle: Handle;
		let registryHandle = actionFactories.get(app).register(id, () => {
			const promise = Promise.resolve()
				.then(() => {
					// Always call the factory in a future turn. This harmonizes behavior regardless of whether the
					// factory is registered through this method or loaded from a definition.

					return factory(publicRegistries.get(app), app.defaultActionStore);
				})
				.then((action) => {
					if (!destroyed) {
						instanceHandle = instanceRegistries.get(app).addAction(action, id);
					}

					// Configure the action, allow for a promise to be returned.
					return Promise.resolve(action.configure(publicRegistries.get(app))).then(() => {
						return action;
					});
				});

			// Replace the registered factory to ensure next time this action is needed, the same action is returned.
			registryHandle.destroy();
			registryHandle = actionFactories.get(app).register(id, () => promise);

			return promise;
		});

		return {
			destroy() {
				this.destroy = noop;
				destroyed = true;
				idHandle.destroy();
				registryHandle.destroy();
				if (instanceHandle) {
					instanceHandle.destroy();
				}
			}
		};
	},

	registerCustomElementFactory(name: string, factory: WidgetFactory): Handle {
		if (!isValidName(name)) {
			throw new SyntaxError(`'${name}' is not a valid custom element name'`);
		}

		const app: App = this;

		// Wrap the factory since the registry cannot store frozen factories, and dojo-compose creates
		// frozen factories…
		const wrapped = (options: Object) => factory(options);

		// Note that each custom element requires a new widget, so there's no need to replace the
		// registered factory.
		const registryHandle = customElementFactories.get(app).register(normalizeName(name), wrapped);

		return {
			destroy() {
				this.destroy = noop;
				registryHandle.destroy();
			}
		};
	},

	registerStore(id: Identifier, store: StoreLike): Handle {
		const app: App = this;

		const idHandle = addIdentifier(app, id);
		const instanceHandle = instanceRegistries.get(app).addStore(store, id);
		const registryHandle = storeFactories.get(app).register(id, () => store);

		return {
			destroy() {
				this.destroy = noop;
				idHandle.destroy();
				instanceHandle.destroy();
				registryHandle.destroy();
			}
		};
	},

	registerStoreFactory(id: Identifier, factory: StoreFactory): Handle {
		const app: App = this;

		const idHandle = addIdentifier(app, id);

		let destroyed = false;
		let instanceHandle: Handle;
		let registryHandle = storeFactories.get(app).register(id, () => {
			const promise = Promise.resolve().then(() => {
				// Always call the factory in a future turn. This harmonizes behavior regardless of whether the
				// factory is registered through this method or loaded from a definition.
				return factory();
			}).then((store) => {
				if (!destroyed) {
					instanceHandle = instanceRegistries.get(app).addStore(store, id);
				}

				return store;
			});
			// Replace the registered factory to ensure next time this store is needed, the same store is returned.
			registryHandle.destroy();
			registryHandle = storeFactories.get(app).register(id, () => promise);
			return promise;
		});

		return {
			destroy() {
				this.destroy = noop;
				destroyed = true;
				idHandle.destroy();
				registryHandle.destroy();
				if (instanceHandle) {
					instanceHandle.destroy();
				}
			}
		};
	},

	registerWidget(id: Identifier, widget: WidgetLike): Handle {
		const app: App = this;

		const idHandle = addIdentifier(app, id);
		const instanceHandle = instanceRegistries.get(app).addWidget(widget, id);
		const registryHandle = widgetFactories.get(app).register(id, () => widget);

		return {
			destroy() {
				this.destroy = noop;
				idHandle.destroy();
				instanceHandle.destroy();
				registryHandle.destroy();
			}
		};
	},

	registerWidgetFactory(id: Identifier, factory: WidgetFactory): Handle {
		const app: App = this;

		const idHandle = addIdentifier(app, id);

		let destroyed = false;
		let instanceHandle: Handle;
		let registryHandle = widgetFactories.get(app).register(id, () => {
			const promise = Promise.resolve().then(() => {
				// Always call the factory in a future turn. This harmonizes behavior regardless of whether the
				// factory is registered through this method or loaded from a definition.

				const { registryProvider, defaultWidgetStore } = app;
				interface Options {
					id: string;
					registryProvider: RegistryProvider;
					stateFrom?: StoreLike;
				}
				const options: Options = { id, registryProvider };
				if (defaultWidgetStore) {
					options.stateFrom = defaultWidgetStore;
				}
				return factory(options);
			}).then((widget) => {
				if (!destroyed) {
					instanceHandle = instanceRegistries.get(app).addWidget(widget, id);
				}

				return widget;
			});
			// Replace the registered factory to ensure next time this widget is needed, the same widget is returned.
			registryHandle.destroy();
			registryHandle = widgetFactories.get(app).register(id, () => promise);
			return promise;
		});

		return {
			destroy() {
				this.destroy = noop;
				destroyed = true;
				idHandle.destroy();
				registryHandle.destroy();
				if (instanceHandle) {
					instanceHandle.destroy();
				}
			}
		};
	},

	loadDefinition({ actions, customElements, stores, widgets }: Definitions): Handle {
		const app: App = this;
		const handles: Handle[] = [];

		if (actions) {
			for (const definition of actions) {
				const factory = makeActionFactory(definition, midResolvers.get(app));
				const handle = app.registerActionFactory(definition.id, factory);
				handles.push(handle);
			}
		}

		if (customElements) {
			for (const definition of customElements) {
				const factory = makeCustomElementFactory(definition, midResolvers.get(app));
				const handle = app.registerCustomElementFactory(definition.name, factory);
				handles.push(handle);
			}
		}

		if (stores) {
			for (const definition of stores) {
				const factory = makeStoreFactory(definition, midResolvers.get(app));
				const handle = app.registerStoreFactory(definition.id, factory);
				handles.push(handle);
			}
		}

		if (widgets) {
			for (const definition of widgets) {
				const factory = makeWidgetFactory(definition, midResolvers.get(app), app);
				const handle = app.registerWidgetFactory(definition.id, factory);
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

	realize(root: Element) {
		const app: App = this;
		return realizeCustomElements(
			app.defaultWidgetStore,
			(id) => addIdentifier(app, id),
			(instance: WidgetLike, id: string) => registerInstance(app, instance, id),
			publicRegistries.get(app),
			app.registryProvider,
			root
		);
	}
})
.mixin({
	mixin: {
		getAction(id: Identifier): Promise<ActionLike> {
			return new Promise((resolve) => {
				resolve(actionFactories.get(this).get(id)());
			});
		},

		hasAction(id: Identifier): boolean {
			return actionFactories.get(this).hasId(id);
		},

		identifyAction(action: ActionLike): string {
			const app: App = this;
			return instanceRegistries.get(app).identifyAction(action);
		},

		getCustomElementFactory(name: string): WidgetFactory {
			return customElementFactories.get(this).get(name);
		},

		hasCustomElementFactory(name: string) {
			return customElementFactories.get(this).hasId(name);
		},

		getStore(id: Identifier | symbol): Promise<StoreLike> {
			return new Promise((resolve) => {
				resolve(storeFactories.get(this).get(id)());
			});
		},

		hasStore(id: Identifier | symbol): boolean {
			return storeFactories.get(this).hasId(id);
		},

		identifyStore(store: StoreLike): Identifier | symbol {
			const app: App = this;
			return instanceRegistries.get(app).identifyStore(store);
		},

		getWidget(id: Identifier): Promise<WidgetLike> {
			// Widgets either need to be resolved from a factory, or have been created when realizing
			// custom elements.
			const factories = widgetFactories.get(this);
			const instances = widgetInstances.get(this);
			return new Promise((resolve) => {
				// First see if a factory exists for the widget.
				let factory: WidgetFactory;
				try {
					factory = factories.get(id);
				} catch (missingFactory) {
					try {
						// Otherwise try and get an existing instance.
						const instance = instances.get(id);
						resolve(instance);
						return; // Make sure to return!
					} catch (_) {
						// Don't confuse people by complaining about missing instances, rethrow the
						// original error.
						throw missingFactory;
					}
				}
				// This is only reached when a factory exists. Call it and resolve with the result.
				// If it throws that's fine, it'll reject the promise.
				resolve(factory());
			});
		},

		hasWidget(id: Identifier): boolean {
			// See if there is a widget factory, or else an existing custom element instance.
			return widgetFactories.get(this).hasId(id) || widgetInstances.get(this).hasId(id);
		},

		identifyWidget(widget: WidgetLike): string {
			const app: App = this;
			return instanceRegistries.get(app).identifyWidget(widget);
		}
	},

	initialize (
		instance: App,
		{
			defaultActionStore = null,
			defaultWidgetStore = null,
			toAbsMid = (moduleId: string) => moduleId
		}: AppOptions = {}
	) {
		const publicRegistry = {
			getAction: instance.getAction.bind(instance),
			hasAction: instance.hasAction.bind(instance),
			identifyAction: instance.identifyAction.bind(instance),
			getCustomElementFactory: instance.getCustomElementFactory.bind(instance),
			hasCustomElementFactory: instance.hasCustomElementFactory.bind(instance),
			getStore: instance.getStore.bind(instance),
			hasStore: instance.hasStore.bind(instance),
			identifyStore: instance.identifyStore.bind(instance),
			getWidget: instance.getWidget.bind(instance),
			hasWidget: instance.hasWidget.bind(instance),
			identifyWidget: instance.identifyWidget.bind(instance)
		};
		Object.freeze(publicRegistry);

		actionFactories.set(instance, new IdentityRegistry<RegisteredFactory<ActionLike>>());
		customElementFactories.set(instance, new IdentityRegistry<RegisteredFactory<WidgetLike>>());
		identifiers.set(instance, new Set<Identifier>());
		storeFactories.set(instance, new IdentityRegistry<RegisteredFactory<StoreLike>>());
		widgetFactories.set(instance, new IdentityRegistry<RegisteredFactory<WidgetLike>>());

		instanceRegistries.set(instance, new InstanceRegistry());
		midResolvers.set(instance, makeMidResolver(toAbsMid));
		publicRegistries.set(instance, publicRegistry);
		registryProviders.set(instance, new RegistryProvider(publicRegistry));
		widgetInstances.set(instance, new IdentityRegistry<WidgetLike>());

		if (defaultActionStore) {
			instance.defaultActionStore = defaultActionStore;
		}
		if (defaultWidgetStore) {
			instance.defaultWidgetStore = defaultWidgetStore;
		}
	}
}) as AppFactory;

export default createApp;

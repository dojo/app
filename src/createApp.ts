import { Action } from 'dojo-actions/createAction';
import compose, { ComposeFactory } from 'dojo-compose/compose';
import { Destroyable } from 'dojo-compose/mixins/createDestroyable';
import { EventedListener } from 'dojo-compose/mixins/createEvented';
import { ObservableState, State } from 'dojo-compose/mixins/createStateful';
import { Handle } from 'dojo-core/interfaces';
import Promise from 'dojo-shim/Promise';
import WeakMap from 'dojo-shim/WeakMap';
import { RenderableMixin } from 'dojo-widgets/mixins/createRenderable';

import IdentityRegistry from './IdentityRegistry';
import {
	makeActionFactory,
	makeCustomElementFactory,
	makeStoreFactory,
	makeWidgetFactory
} from './_factories';
import InstanceRegistry from './_InstanceRegistry';
import makeMidResolver, { ToAbsMid, ResolveMid } from './_moduleResolver';
import realizeCustomElements, {
	isValidName,
	normalizeName
} from './_realizeCustomElements';
import RegistryProvider from './_RegistryProvider';

export { RegistryProvider, ToAbsMid };

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
 */
export type WidgetLike = Destroyable & RenderableMixin;

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
	getStore(id: Identifier): Promise<StoreLike>;

	/**
	 * Check whether a store has been registered with the given identifier.
	 *
	 * @param id Identifier for the store
	 * @return `true` if a store has been registered, `false` otherwise.
	 */
	hasStore(id: Identifier): boolean;

	/**
	 * Look up the identifier for which the given store has been registered.
	 *
	 * Throws if the value hasn't been registered.
	 *
	 * @param store The store
	 * @return The identifier
	 */
	identifyStore(store: StoreLike): Identifier;

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
	 * A default store to be used as the `stateFrom` option to widget and custom element factories, unless another
	 * store is specified.
	 */
	defaultStore?: StoreLike;

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
	 * Take a root element and replace <widget-instance> elements with widget instances.
	 *
	 * @param root The root element that is searched for <widget-instance> elements
	 * @return A handle to detach rendered widgets from the DOM and remove them from the widget registry
	 */
	realize(root: Element): Promise<Handle>;

	_instanceRegistry: InstanceRegistry;
	_registry: CombinedRegistry;
	_resolveMid: ResolveMid;
}

export type App = AppMixin & CombinedRegistry;

export interface AppOptions {
	/**
	 * A default store to be used as the `stateFrom` option to widget and custom element factories, unless another
	 * store is specified.
	 */
	defaultStore?: StoreLike;

	/**
	 * Function that maps a (relative) module identifier to an absolute one. Used to resolve relative module
	 * identifiers in definitions.
	 */
	toAbsMid?: ToAbsMid;
}

export interface AppFactory extends ComposeFactory<App, AppOptions> {}

const noop = () => {};

type RegisteredFactory<T> = () => Promise<T>;
const actionFactories = new WeakMap<App, IdentityRegistry<RegisteredFactory<ActionLike>>>();
const customElementFactories = new WeakMap<App, IdentityRegistry<WidgetFactory>>();
const customElementInstances = new WeakMap<App, IdentityRegistry<WidgetLike>>();
const storeFactories = new WeakMap<App, IdentityRegistry<RegisteredFactory<StoreLike>>>();
const widgetFactories = new WeakMap<App, IdentityRegistry<RegisteredFactory<WidgetLike>>>();

const createApp = compose({
	registerAction(id: Identifier, action: ActionLike): Handle {
		const app: App = this;
		const instanceHandle = app._instanceRegistry.addAction(action, id);

		const promise = new Promise<void>((resolve) => {
			resolve(action.configure(app._registry));
		}).then(() => action);
		const registryHandle = actionFactories.get(app).register(id, () => promise);

		return {
			destroy() {
				this.destroy = noop;
				instanceHandle.destroy();
				registryHandle.destroy();
			}
		};
	},

	registerActionFactory(id: Identifier, factory: ActionFactory): Handle {
		const app: App = this;
		let destroyed = false;
		let instanceHandle: Handle;
		let registryHandle = actionFactories.get(app).register(id, () => {
			const promise = Promise.resolve()
				.then(() => {
					// Always call the factory in a future turn. This harmonizes behavior regardless of whether the
					// factory is registered through this method or loaded from a definition.
					return factory(app._registry);
				})
				.then((action) => {
					if (!destroyed) {
						instanceHandle = app._instanceRegistry.addAction(action, id);
					}

					// Configure the action, allow for a promise to be returned.
					return Promise.resolve(action.configure(app._registry)).then(() => {
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
		const promise = Promise.resolve(store);
		const instanceHandle = app._instanceRegistry.addStore(store, id);
		const registryHandle = storeFactories.get(app).register(id, () => promise);

		return {
			destroy() {
				this.destroy = noop;
				registryHandle.destroy();
				instanceHandle.destroy();
			}
		};
	},

	registerStoreFactory(id: Identifier, factory: StoreFactory): Handle {
		const app: App = this;
		let destroyed = false;
		let instanceHandle: Handle;
		let registryHandle = storeFactories.get(app).register(id, () => {
			const promise = Promise.resolve().then(() => {
				// Always call the factory in a future turn. This harmonizes behavior regardless of whether the
				// factory is registered through this method or loaded from a definition.
				return factory();
			}).then((store) => {
				if (!destroyed) {
					instanceHandle = app._instanceRegistry.addStore(store, id);
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
				registryHandle.destroy();
				if (instanceHandle) {
					instanceHandle.destroy();
				}
			}
		};
	},

	registerWidget(id: Identifier, widget: WidgetLike): Handle {
		const app: App = this;
		const promise = Promise.resolve(widget);
		const instanceHandle = app._instanceRegistry.addWidget(widget, id);
		const registryHandle = widgetFactories.get(app).register(id, () => promise);

		return {
			destroy() {
				this.destroy = noop;
				registryHandle.destroy();
				instanceHandle.destroy();
			}
		};
	},

	registerWidgetFactory(id: Identifier, factory: WidgetFactory): Handle {
		const app: App = this;
		let destroyed = false;
		let instanceHandle: Handle;
		let registryHandle = widgetFactories.get(app).register(id, () => {
			const promise = Promise.resolve().then(() => {
				// Always call the factory in a future turn. This harmonizes behavior regardless of whether the
				// factory is registered through this method or loaded from a definition.

				const { registryProvider, defaultStore } = app;
				interface Options {
					id: string;
					registryProvider: RegistryProvider;
					stateFrom?: StoreLike;
				}
				const options: Options = { id, registryProvider };
				if (defaultStore) {
					options.stateFrom = defaultStore;
				}
				return factory(options);
			}).then((widget) => {
				if (!destroyed) {
					instanceHandle = app._instanceRegistry.addWidget(widget, id);
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
				const factory = makeActionFactory(definition, app._resolveMid);
				const handle = app.registerActionFactory(definition.id, factory);
				handles.push(handle);
			}
		}

		if (customElements) {
			for (const definition of customElements) {
				const factory = makeCustomElementFactory(definition, app._resolveMid);
				const handle = app.registerCustomElementFactory(definition.name, factory);
				handles.push(handle);
			}
		}

		if (stores) {
			for (const definition of stores) {
				const factory = makeStoreFactory(definition, app._resolveMid);
				const handle = app.registerStoreFactory(definition.id, factory);
				handles.push(handle);
			}
		}

		if (widgets) {
			for (const definition of widgets) {
				const factory = makeWidgetFactory(definition, app._resolveMid, app);
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
		const { defaultStore, _registry: registry, registryProvider } = app;

		const createdInstances = customElementInstances.get(app);
		const registerInstance = (instance: WidgetLike, id: string) => {
			// Maps the instance to its ID
			const instanceHandle = app._instanceRegistry.addWidget(instance, id);
			// Maps the ID to the instance
			const idHandle = createdInstances.register(id, instance);

			return {
				destroy() {
					this.destroy = noop;
					instanceHandle.destroy();
					idHandle.destroy();
				}
			};
		};

		return realizeCustomElements(defaultStore, registerInstance, registry, registryProvider, root);
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
			return app._instanceRegistry.identifyAction(action);
		},

		getCustomElementFactory(name: string): WidgetFactory {
			return customElementFactories.get(this).get(name);
		},

		hasCustomElementFactory(name: string) {
			return customElementFactories.get(this).hasId(name);
		},

		getStore(id: Identifier): Promise<StoreLike> {
			return new Promise((resolve) => {
				resolve(storeFactories.get(this).get(id)());
			});
		},

		hasStore(id: Identifier): boolean {
			return storeFactories.get(this).hasId(id);
		},

		identifyStore(store: StoreLike): string {
			const app: App = this;
			return app._instanceRegistry.identifyStore(store);
		},

		getWidget(id: Identifier): Promise<WidgetLike> {
			// Widgets either need to be resolved from a factory, or have been created when realizing
			// custom elements.
			const factories = widgetFactories.get(this);
			const instances = customElementInstances.get(this);
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
			return widgetFactories.get(this).hasId(id) || customElementInstances.get(this).hasId(id);
		},

		identifyWidget(widget: WidgetLike): string {
			const app: App = this;
			return app._instanceRegistry.identifyWidget(widget);
		}
	},

	initialize (instance: App, { defaultStore = null, toAbsMid = (moduleId: string) => moduleId }: AppOptions = {}) {
		instance._instanceRegistry = new InstanceRegistry();
		instance._registry = {
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
		Object.freeze(instance._registry);

		instance._resolveMid = makeMidResolver(toAbsMid);

		Object.defineProperty(instance, 'defaultStore', {
			configurable: false,
			enumerable: true,
			value: defaultStore,
			writable: false
		});

		Object.defineProperty(instance, 'registryProvider', {
			configurable: false,
			enumerable: true,
			value: new RegistryProvider(instance._registry),
			writable: false
		});

		actionFactories.set(instance, new IdentityRegistry<RegisteredFactory<ActionLike>>());
		customElementFactories.set(instance, new IdentityRegistry<RegisteredFactory<WidgetLike>>());
		customElementInstances.set(instance, new IdentityRegistry<WidgetLike>());
		storeFactories.set(instance, new IdentityRegistry<RegisteredFactory<StoreLike>>());
		widgetFactories.set(instance, new IdentityRegistry<RegisteredFactory<WidgetLike>>());
	}
}) as AppFactory;

export default createApp;

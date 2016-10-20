import { Action } from 'dojo-actions/createAction';
import compose, { ComposeFactory } from 'dojo-compose/compose';
import { EventedListener, EventedListenersMap } from 'dojo-compose/mixins/createEvented';
import { ObservableState, State } from 'dojo-compose/mixins/createStateful';
import { Handle } from 'dojo-core/interfaces';
import IdentityRegistry from 'dojo-core/IdentityRegistry';
import { assign } from 'dojo-core/lang';
import Promise from 'dojo-shim/Promise';
import Set from 'dojo-shim/Set';
import Symbol from 'dojo-shim/Symbol';
import WeakMap from 'dojo-shim/WeakMap';
import { Child } from 'dojo-widgets/mixins/interfaces';

import extractRegistrationElements from './lib/extractRegistrationElements';
import {
	makeActionFactory,
	makeCustomElementFactory,
	makeStoreFactory,
	makeWidgetFactory
} from './lib/factories';
import InstanceRegistry from './lib/InstanceRegistry';
import makeIdGenerator from './lib/makeIdGenerator';
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
	get<T>(id: string): Promise<T>;
}

/**
 * Any kind of widget.
 */
export type WidgetLike = Child;

/**
 * Options passed to action factories.
 */
export interface ActionFactoryOptions {
	/**
	 * Provides access to read-only registries for actions, stores and widgets.
	 */
	registryProvider: RegistryProvider;

	/**
	 * The store that was defined for this action.
	 *
	 * It's the factories responsibility to create an action that observes the store.
	 */
	stateFrom?: StoreLike;
}

/**
 * Options passed to widget factories.
 */
export interface WidgetFactoryOptions {
	/**
	 * The ID for the widget to be created by the factory.
	 */
	id?: string;

	/**
	 * Listeners that should be attached when the widget is created.
	 */
	listeners?: EventedListenersMap;

	/**
	 * Provides access to read-only registries for actions, stores and widgets.
	 */
	registryProvider: RegistryProvider;

	/**
	 * State that should be set while the widget is being created.
	 */
	state?: any;

	/**
	 * The store that was defined for this widget.
	 *
	 * It's the factories responsibility to create a widget that observes the store.
	 */
	stateFrom?: StoreLike;
}

/**
 * Factory method to (asynchronously) create an action.
 *
 * @return The action, or a promise for it
 */
export interface ActionFactory {
	(options: ActionFactoryOptions): ActionLike | Promise<ActionLike>;
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
	(options?: WidgetFactoryOptions): WidgetLike | Promise<WidgetLike>;
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
	 * Initial state, to be added to the action's store, if any.
	 */
	state?: any;

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
 * Read-only interface to access actions, custom element factories, stores and widgets.
 *
 * Used in helper modules which shouldn't write to the app registry.
 */
export interface ReadOnlyRegistry {
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
	 * Create a new widget and add it to the registry.
	 *
	 * @param factory Factory to create the widget
	 * @param options Options to be passed to the factory. Automatically extended with the `registryProvider` option,
	 *   and the `stateFrom` option if an `id` was present and the application factory has a default store.
	 * @return A promise for a tuple containing the ID of the created widget, and the widget instance itself.
	 */
	createWidget<U extends Child, O>(factory: ComposeFactory<U, O>, options?: O): Promise<[string, U]>;

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
	 * Check whether a widget has been registered or would be created based on an associated state record for the given identifier.
	 *
	 * @param id Identifier for the widget
	 * @return A promise that will resolve to `true` if a widget has been registered or would be created, `false` otherwise.
	 */
	hasWidget(id: Identifier): Promise<boolean>;

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
	readonly registryProvider: RegistryProvider;

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
	 * The factory will be called the first time the action is needed. It'll be called with an options object that has
	 * a `registryProvider` property containing a RegistryProvider implementation for the app. If a default action store
	 * is available it'll be passed as the `stateFrom` property. It's the factories responsibility to create an action
	 * that observes the store.
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
	 * that has its `id` property set to the widget ID, and a `registryProvider` property containing a RegistryProvider
	 * implementation for the app. If a default widget store is available it'll be passed as the `stateFrom` property.
	 *
	 * @param id How the widget is identified
	 * @param factory A factory function that (asynchronously) creates a widget.
	 * @return A handle to deregister the widget factory, or the widget itself once it's been created
	 */
	registerWidgetFactory(id: Identifier, factory: WidgetFactory): Handle;

	/**
	 * Load a POJO definition containing actions, stores and widgets that need to be registered.
	 *
	 * All factories will be called with an options object.
	 *
	 * @return A handle to deregister *all* actions, stores and widgets that were registered.
	 */
	loadDefinition(definitions: Definitions): Handle;

	/**
	 * Extract declarative definition custom elements in the root and render widgets.
	 *
	 * @param root The root element that is searched for custom elements
	 * @return A handle to detach rendered widgets from the DOM and remove them from the widget registry
	 */
	realize(root: Element): Promise<Handle>;
}

export type App = AppMixin & ReadOnlyRegistry;

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

const generateWidgetId = makeIdGenerator('app-widget-');

const noop = () => {};

type RegisteredFactory<T> = () => T | Promise<T>;

interface PrivateState {
	readonly actionFactories: IdentityRegistry<RegisteredFactory<ActionLike>>;
	readonly customElementFactories: IdentityRegistry<WidgetFactory>;
	readonly identifiers: Set<Identifier>;
	readonly instanceRegistry: InstanceRegistry;
	readonly registryProvider: RegistryProvider;
	readonly resolveMid: ResolveMid;
	readonly storeFactories: IdentityRegistry<RegisteredFactory<StoreLike>>;
	readonly widgetFactories: IdentityRegistry<RegisteredFactory<WidgetLike>>;
	readonly widgetInstances: IdentityRegistry<WidgetLike>;
}

const privateStateMap = new WeakMap<App, PrivateState>();

function addIdentifier(app: App, id: Identifier) {
	const { identifiers } = privateStateMap.get(app);
	if (identifiers.has(id)) {
		throw new Error(`'${id}' has already been used as an identifier`);
	}

	identifiers.add(id);

	return {
		destroy(this: Handle) {
			this.destroy = noop;
			identifiers.delete(id);
		}
	};
}

function createCustomWidget(app: App, id: string) {
	const { registryProvider, defaultWidgetStore } = app;
	let factoryHandle: Handle;
	// istanbul ignore if
	if (!defaultWidgetStore) {
		throw new Error('A default widget store must be configured in order to create custom widgets');
	}

	return defaultWidgetStore.get(id).then((state: any) => {
		const { customElementFactories, widgetFactories, widgetInstances } = privateStateMap.get(app);

		const hasRegisteredFactory = widgetFactories.has(id);
		const hasRegisteredInstance = widgetInstances.has(id);

		if (!hasRegisteredFactory && !hasRegisteredInstance) {
			const customFactory = customElementFactories.get(state.type);
			factoryHandle = app.registerWidgetFactory(id, customFactory);
		}

		return app.getWidget(id);
	}).then((widget) => {
		widget.own(factoryHandle);
		return widget;
	});
}

function registerInstance(app: App, instance: WidgetLike, id: string): Handle {
	const { instanceRegistry, widgetInstances } = privateStateMap.get(app);

	// Maps the instance to its ID
	const instanceHandle = instanceRegistry.addWidget(instance, id);
	// Maps the ID to the instance
	const idHandle = widgetInstances.register(id, instance);

	return {
		destroy(this: Handle) {
			this.destroy = noop;
			instanceHandle.destroy();
			idHandle.destroy();
		}
	};
}

const createApp = compose({
	set defaultActionStore(store: StoreLike) {
		const { instanceRegistry, storeFactories } = privateStateMap.get(this);
		instanceRegistry.addStore(store, DEFAULT_ACTION_STORE);
		storeFactories.register(DEFAULT_ACTION_STORE, () => store);
	},

	get defaultActionStore(this: App) {
		const { storeFactories } = privateStateMap.get(this);
		if (storeFactories.has(DEFAULT_ACTION_STORE)) {
			return <StoreLike> storeFactories.get(DEFAULT_ACTION_STORE)();
		}
	},

	set defaultWidgetStore(store: StoreLike) {
		const { instanceRegistry, storeFactories } = privateStateMap.get(this);
		instanceRegistry.addStore(store, DEFAULT_WIDGET_STORE);
		storeFactories.register(DEFAULT_WIDGET_STORE, () => store);
	},

	get defaultWidgetStore(this: App) {
		const { storeFactories } = privateStateMap.get(this);
		if (storeFactories.has(DEFAULT_WIDGET_STORE)) {
			return <StoreLike> storeFactories.get(DEFAULT_WIDGET_STORE)();
		}
	},

	get registryProvider(this: App) {
		return privateStateMap.get(this).registryProvider;
	},

	registerAction(this: App, id: Identifier, action: ActionLike): Handle {
		const { actionFactories, instanceRegistry } = privateStateMap.get(this);

		const idHandle = addIdentifier(this, id);
		const instanceHandle = instanceRegistry.addAction(action, id);

		let registryHandle = actionFactories.register(id, () => {
			const promise = new Promise<void>((resolve) => {
				resolve(action.configure(this.registryProvider));
			})
			.then(() => action);

			// Replace the registered factory to ensure the action is not configured twice.
			registryHandle.destroy();
			registryHandle = actionFactories.register(id, () => promise);

			return promise;
		});

		return {
			destroy(this: Handle) {
				this.destroy = noop;
				idHandle.destroy();
				instanceHandle.destroy();
				registryHandle.destroy();
			}
		};
	},

	registerActionFactory(this: App, id: Identifier, factory: ActionFactory): Handle {
		const { actionFactories, instanceRegistry } = privateStateMap.get(this);

		const idHandle = addIdentifier(this, id);

		let destroyed = false;
		let instanceHandle: Handle;
		let registryHandle = actionFactories.register(id, () => {
			const promise = Promise.resolve()
				.then(() => {
					// Always call the factory in a future turn. This harmonizes behavior regardless of whether the
					// factory is registered through this method or loaded from a definition.

					const { defaultActionStore: stateFrom, registryProvider } = this;
					return factory({ registryProvider, stateFrom });
				})
				.then((action) => {
					if (!destroyed) {
						instanceHandle = instanceRegistry.addAction(action, id);
					}

					// Configure the action, allow for a promise to be returned.
					return Promise.resolve(action.configure(this.registryProvider)).then(() => {
						return action;
					});
				});

			// Replace the registered factory to ensure next time this action is needed, the same action is returned.
			registryHandle.destroy();
			registryHandle = actionFactories.register(id, () => promise);

			return promise;
		});

		return {
			destroy(this: Handle) {
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

	registerCustomElementFactory(this: App, name: string, factory: WidgetFactory): Handle {
		if (!isValidName(name)) {
			throw new SyntaxError(`'${name}' is not a valid custom element name`);
		}

		// Wrap the factory since the registry cannot store frozen factories, and dojo-compose creates
		// frozen factories…
		const wrapped = (options: WidgetFactoryOptions) => factory(options);

		// Note that each custom element requires a new widget, so there's no need to replace the
		// registered factory.
		const registryHandle = privateStateMap.get(this).customElementFactories.register(normalizeName(name), wrapped);

		return {
			destroy(this: Handle) {
				this.destroy = noop;
				registryHandle.destroy();
			}
		};
	},

	registerStore(this: App, id: Identifier, store: StoreLike): Handle {
		const { instanceRegistry, storeFactories } = privateStateMap.get(this);

		const idHandle = addIdentifier(this, id);
		const instanceHandle = instanceRegistry.addStore(store, id);
		const registryHandle = storeFactories.register(id, () => store);

		return {
			destroy(this: Handle) {
				this.destroy = noop;
				idHandle.destroy();
				instanceHandle.destroy();
				registryHandle.destroy();
			}
		};
	},

	registerStoreFactory(this: App, id: Identifier, factory: StoreFactory): Handle {
		const { instanceRegistry, storeFactories } = privateStateMap.get(this);

		const idHandle = addIdentifier(this, id);

		let destroyed = false;
		let instanceHandle: Handle;
		let registryHandle = storeFactories.register(id, () => {
			const promise = Promise.resolve().then(() => {
				// Always call the factory in a future turn. This harmonizes behavior regardless of whether the
				// factory is registered through this method or loaded from a definition.
				return factory();
			}).then((store) => {
				if (!destroyed) {
					instanceHandle = instanceRegistry.addStore(store, id);
				}

				return store;
			});
			// Replace the registered factory to ensure next time this store is needed, the same store is returned.
			registryHandle.destroy();
			registryHandle = storeFactories.register(id, () => promise);
			return promise;
		});

		return {
			destroy(this: Handle) {
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

	registerWidget(this: App, id: Identifier, widget: WidgetLike): Handle {
		const { instanceRegistry, widgetFactories } = privateStateMap.get(this);

		const idHandle = addIdentifier(this, id);
		const instanceHandle = instanceRegistry.addWidget(widget, id);
		const registryHandle = widgetFactories.register(id, () => widget);

		return {
			destroy(this: Handle) {
				this.destroy = noop;
				idHandle.destroy();
				instanceHandle.destroy();
				registryHandle.destroy();
			}
		};
	},

	registerWidgetFactory(this: App, id: Identifier, factory: WidgetFactory): Handle {
		const { instanceRegistry, widgetFactories } = privateStateMap.get(this);

		const idHandle = addIdentifier(this, id);

		let destroyed = false;
		let instanceHandle: Handle;
		let registryHandle = widgetFactories.register(id, () => {
			const promise = Promise.resolve().then(() => {
				// Always call the factory in a future turn. This harmonizes behavior regardless of whether the
				// factory is registered through this method or loaded from a definition.

				const { registryProvider, defaultWidgetStore } = this;
				const options: WidgetFactoryOptions = { id, registryProvider };
				if (defaultWidgetStore) {
					options.stateFrom = defaultWidgetStore;
				}
				return factory(options);
			}).then((widget) => {
				if (!destroyed) {
					instanceHandle = instanceRegistry.addWidget(widget, id);
				}

				return widget;
			});
			// Replace the registered factory to ensure next time this widget is needed, the same widget is returned.
			registryHandle.destroy();
			registryHandle = widgetFactories.register(id, () => promise);
			return promise;
		});

		return {
			destroy(this: Handle) {
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

	loadDefinition(this: App, { actions, customElements, stores, widgets }: Definitions): Handle {
		const { resolveMid } = privateStateMap.get(this);

		const handles: Handle[] = [];

		if (actions) {
			for (const definition of actions) {
				const factory = makeActionFactory(definition, resolveMid, this);
				const handle = this.registerActionFactory(definition.id, factory);
				handles.push(handle);
			}
		}

		if (customElements) {
			for (const definition of customElements) {
				const factory = makeCustomElementFactory(definition, resolveMid);
				const handle = this.registerCustomElementFactory(definition.name, factory);
				handles.push(handle);
			}
		}

		if (stores) {
			for (const definition of stores) {
				const factory = makeStoreFactory(definition, resolveMid);
				const handle = this.registerStoreFactory(definition.id, factory);
				handles.push(handle);
			}
		}

		if (widgets) {
			for (const definition of widgets) {
				const factory = makeWidgetFactory(definition, resolveMid, this);
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

	realize(this: App, root: Element) {
		const { resolveMid } = privateStateMap.get(this);

		return extractRegistrationElements(resolveMid, root)
			.then(({ actions, customElements, defaultStores, stores, widgets }) => {
				const definitionHandle = this.loadDefinition({ actions, customElements, stores, widgets });
				if (defaultStores.length === 0) {
					return definitionHandle;
				}

				return Promise.all(defaultStores.map((definition) => {
					// N.B. The ID is ignored by the store factory
					const { id: type } = definition;
					const factory = makeStoreFactory(definition, resolveMid);
					return Promise.resolve(factory())
						.then((store) => {
							if (type === 'action') {
								this.defaultActionStore = store;
							}
							else {
								this.defaultWidgetStore = store;
							}
						});
				}))
				.then(() => definitionHandle);
			})
			.then((definitionHandle) => {
				return realizeCustomElements(
					(id) => addIdentifier(this, id),
					(instance: WidgetLike, id: string) => registerInstance(this, instance, id),
					this,
					this.registryProvider,
					root,
					this.defaultWidgetStore
				)
				.then((realizationHandle) => {
					return {
						destroy(this: Handle) {
							this.destroy = noop;
							definitionHandle.destroy();
							realizationHandle.destroy();
						}
					};
				});
			});
	}
})
.mixin({
	mixin: {
		getAction(this: App, id: Identifier): Promise<ActionLike> {
			return new Promise((resolve) => {
				resolve(privateStateMap.get(this).actionFactories.get(id)());
			});
		},

		hasAction(this: App, id: Identifier): boolean {
			return privateStateMap.get(this).actionFactories.has(id);
		},

		identifyAction(this: App, action: ActionLike): string {
			return privateStateMap.get(this).instanceRegistry.identifyAction(action);
		},

		getCustomElementFactory(this: App, name: string): WidgetFactory {
			return privateStateMap.get(this).customElementFactories.get(name);
		},

		hasCustomElementFactory(this: App, name: string) {
			return privateStateMap.get(this).customElementFactories.has(name);
		},

		getStore(this: App, id: Identifier | symbol): Promise<StoreLike> {
			return new Promise((resolve) => {
				resolve(privateStateMap.get(this).storeFactories.get(id)());
			});
		},

		hasStore(this: App, id: Identifier | symbol): boolean {
			return privateStateMap.get(this).storeFactories.has(id);
		},

		identifyStore(this: App, store: StoreLike): Identifier | symbol {
			return privateStateMap.get(this).instanceRegistry.identifyStore(store);
		},

		createWidget<U extends Child, O extends WidgetFactoryOptions>(
			this: App,
			factory: ComposeFactory<U, O>,
			options: any = {}
		): Promise<[ string, U ]> {
			const { defaultWidgetStore, registryProvider } = this;
			const { id = generateWidgetId() } = options;
			// Like for custom elements, don't add the generated ID to the options.

			const { widgetFactories, widgetInstances } = privateStateMap.get(this);

			// Ensure no other widget with this ID exists.
			if (widgetFactories.has(id) || widgetInstances.has(id)) {
				return Promise.reject(new Error(`A widget with ID '${id}' already exists`));
			}

			if (!options.registryProvider) {
				options.registryProvider = registryProvider;
			}

			return new Promise((resolve) => {
				if (options.id && (options.stateFrom || defaultWidgetStore)) {
					const store: StoreLike = options.stateFrom = options.stateFrom || defaultWidgetStore;

					// We will attempt to create an initial state, if it isn't present in the store
					const state = { id };
					if (options.state) {
						assign(state, options.state);
					}
					// TODO: What happens if the store rejects?
					resolve(store.add(state));
				}
				else {
					resolve();
				}
			})
			.then(() => {
				const widget = factory(options);
				// Add the instance to the various registries the app may maintain.
				//
				// No need to trap registerInstance for duplicates, because we are creating new
				// in this function
				widget.own(registerInstance(this, widget, id));
				return [ id, widget ];
			});
		},

		getWidget(this: App, id: Identifier): Promise<WidgetLike> {
			// Widgets either need to be resolved from a factory, or have been created when realizing
			// custom elements.
			const { widgetFactories: factories, widgetInstances: instances } = privateStateMap.get(this);

			let missingFactory: any;
			return new Promise((resolve) => {
				let factory: WidgetFactory;
				try {
					factory = factories.get(id);
					// Don't call the factory yet. Errors thrown during its execution should be differentiated from
					// errors thrown when getting the factory.
				}
				catch (err) {
					missingFactory = err;
					resolve(Promise.reject(err));
					return;
				}

				// Be sure to call the factory synchronously.
				resolve(factory());
			}).catch((err) => {
				if (missingFactory && instances.has(id)) {
					return instances.get(id);
				}
				else {
					return Promise.reject(err);
				}
			}).catch((err) => {
				if (missingFactory && this.defaultWidgetStore) {
					// Note that errors thrown by the createCustomWidget are masked by the missingFactory error.
					return createCustomWidget(this, id);
				}
				else {
					return Promise.reject(err);
				}
			}).catch((err) => {
				return Promise.reject(missingFactory || err);
			});
		},

		hasWidget(this: App, id: Identifier): Promise<boolean> {
			const { customElementFactories, widgetFactories, widgetInstances } = privateStateMap.get(this);
			const { defaultWidgetStore } = this;

			let exists: Promise<boolean> | boolean = widgetFactories.has(id) || widgetInstances.has(id);

			if (exists || !defaultWidgetStore) {
				return Promise.resolve(exists);
			}
			else {
				return defaultWidgetStore.get(id).then(({ type }) => customElementFactories.has(type));
			}
		},

		identifyWidget(this: App, widget: WidgetLike): string {
			return privateStateMap.get(this).instanceRegistry.identifyWidget(widget);
		}
	},

	initialize (
		instance: App,
		{
			defaultActionStore,
			defaultWidgetStore,
			toAbsMid = (moduleId: string) => moduleId
		}: AppOptions = {}
	) {
		privateStateMap.set(instance, {
			actionFactories: new IdentityRegistry<RegisteredFactory<ActionLike>>(),
			customElementFactories: new IdentityRegistry<RegisteredFactory<WidgetLike>>(),
			identifiers: new Set<Identifier>(),
			instanceRegistry: new InstanceRegistry(),
			registryProvider: new RegistryProvider(instance),
			resolveMid: makeMidResolver(toAbsMid),
			storeFactories: new IdentityRegistry<RegisteredFactory<StoreLike>>(),
			widgetFactories: new IdentityRegistry<RegisteredFactory<WidgetLike>>(),
			widgetInstances: new IdentityRegistry<WidgetLike>()
		});

		if (defaultActionStore) {
			instance.defaultActionStore = defaultActionStore;
		}
		if (defaultWidgetStore) {
			instance.defaultWidgetStore = defaultWidgetStore;
		}
	}
}) as AppFactory;

export default createApp;

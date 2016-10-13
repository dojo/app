import { ComposeFactory } from 'dojo-compose/compose';
import Promise from 'dojo-shim/Promise';
import { Child } from 'dojo-widgets/mixins/interfaces';

import {
	ActionLike,
	Identifier,
	ReadOnlyRegistry,
	StoreLike,
	WidgetFactoryOptions,
	WidgetLike
} from '../createApp';

/**
 * Registry to (asynchronously) get instances by their ID.
 */
export interface Registry<I, T> {
	/**
	 * Asynchronously get an instance by its ID.
	 *
	 * @param id Identifier for the instance that is to be retrieved
	 * @return A promise for the instance. The promise rejects if no instance was found.
	 */
	get(id: I): Promise<T>;

	/**
	 * Look up the identifier for which the given value has been registered.
	 *
	 * Throws if the value hasn't been registered.
	 *
	 * @param value The value
	 * @return The identifier
	 */
	identify(value: T): I;
}

interface UnderlyingRegistry {
	getAction(id: Identifier): Promise<ActionLike>;
	identifyAction(action: ActionLike): Identifier;
	getStore(id: Identifier | symbol): Promise<StoreLike>;
	identifyStore(store: StoreLike): Identifier | symbol;
	createWidget<
		U extends Child,
		O extends WidgetFactoryOptions
	>(factory: ComposeFactory<U, O>, options?: O): Promise<[string, U]>;
	getWidget(id: Identifier): Promise<WidgetLike>;
	hasWidget(id: Identifier): boolean;
	identifyWidget(widget: WidgetLike): Identifier;
}

/**
 * Registry to (asynchronously) get widget instances by their ID, as well as create new instances that are then added
 * to the registry.
 */
export interface WidgetRegistry<I, T extends Child> extends Registry<I, T> {
	/**
	 * Create a new instance and add it to the registry.
	 *
	 * @param factory Factory to create the new instance
	 * @param options Options to be passed to the factory. Automatically extended with the `registryProvider` option,
	 *   and the `stateFrom` option if an `id` was present and the application factory has a default store.
	 * @return A promise for a tuple containing the ID of the created widget, and the widget instance itself.
	 */
	create<U extends T, O>(factory: ComposeFactory<U, O>, options?: O): Promise<[string, U]>;

	/**
	 * Checks if an instance exists in the registry for a given identifier.
	 *
	 * @param id identifier of the instance to check exists in the registry.
	 * @return a boolean indicating if the instance exists in the registry.
	 */
	has(id: I): boolean;
}

/**
 * Provides access to read-only registries for actions, stores and widgets.
 */
export default class RegistryProvider {
	private actionRegistry: Registry<Identifier, ActionLike>;
	private storeRegistry: Registry<Identifier | symbol, StoreLike>;
	private widgetRegistry: WidgetRegistry<Identifier, WidgetLike>;

	private readonly underlyingRegistry: UnderlyingRegistry;
	constructor(registry: ReadOnlyRegistry) {
		this.underlyingRegistry = Object.freeze({
			getAction: registry.getAction.bind(registry),
			identifyAction: registry.identifyAction.bind(registry),
			getStore: registry.getStore.bind(registry),
			identifyStore: registry.identifyStore.bind(registry),
			createWidget: registry.createWidget.bind(registry),
			getWidget: registry.getWidget.bind(registry),
			hasWidget: registry.hasWidget.bind(registry),
			identifyWidget: registry.identifyWidget.bind(registry)
		});
	}

	/**
	 * Get an action, store or widget registry.
	 *
	 * @param type The type of registry that is required.
	 * @return The registry.
	 */
	get(type: 'actions'): Registry<Identifier, ActionLike>;
	get(type: 'stores'): Registry<Identifier | symbol, StoreLike>;
	get(type: 'widgets'): WidgetRegistry<Identifier, WidgetLike>;
	get(type: string): Registry<any, any>;
	get(type: string): Registry<any, any> {
		switch (type) {
			case 'actions':
				return this.actionRegistry || (this.actionRegistry = {
					get: this.underlyingRegistry.getAction,
					identify: this.underlyingRegistry.identifyAction
				});
			case 'stores':
				return this.storeRegistry || (this.storeRegistry = {
					get: this.underlyingRegistry.getStore,
					identify: this.underlyingRegistry.identifyStore
				});
			case 'widgets':
				return this.widgetRegistry || (this.widgetRegistry = {
					create: this.underlyingRegistry.createWidget,
					get: this.underlyingRegistry.getWidget,
					has: this.underlyingRegistry.hasWidget,
					identify: this.underlyingRegistry.identifyWidget
				});
			default:
				throw new Error(`No such store: ${type}`);
		}
	}
}

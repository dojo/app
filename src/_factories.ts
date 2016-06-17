import { EventedListenersMap } from 'dojo-compose/mixins/createEvented';
import { assign } from 'dojo-core/lang';
import Promise from 'dojo-core/Promise';

import {
	ActionDefinition,
	ActionFactory,
	ActionLike,
	CombinedRegistry,
	ItemDefinition,
	StoreDefinition,
	StoreFactory,
	StoreLike,
	WidgetDefinition,
	WidgetFactory,
	WidgetLike,
	WidgetListenerOrArray
} from './createApp';
import { ResolveMid } from './_moduleResolver';

function resolveListeners(registry: CombinedRegistry, ref: WidgetListenerOrArray): { value?: any; promise?: Promise<any>; } {
	if (Array.isArray(ref)) {
		const resolved = ref.map((item) => {
			return resolveListeners(registry, item);
		});

		let isSync = true;
		const values: any[] = [];
		for (const result of resolved) {
			if (result.value) {
				values.push(result.value);
			} else {
				isSync = false;
				values.push(result.promise);
			}
		}

		return isSync ? { value: values } : { promise: Promise.all(values) };
	}

	if (typeof ref !== 'string') {
		return { value: ref };
	}

	return { promise: registry.getAction(<string> ref) };
}

function resolveListenersMap(registry: CombinedRegistry, definition: WidgetDefinition) {
	const { listeners: defined } = definition;
	if (!defined) {
		return null;
	}

	const map: EventedListenersMap = {};
	const eventTypes = Object.keys(defined);
	return eventTypes.reduce((promise, eventType) => {
		const resolved = resolveListeners(registry, defined[eventType]);
		if (resolved.value) {
			map[eventType] = resolved.value;
			return promise;
		}

		return resolved.promise.then((value) => {
			map[eventType] = value;
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

type Factory = ActionFactory | StoreFactory | WidgetFactory;
type Instance = ActionLike | StoreLike | WidgetLike;
type FactoryTypes = 'action' | 'store' | 'widget';
const errorStrings: { [type: string]: string } = {
	action: 'an action',
	store: 'a store',
	widget: 'a widget'
};

function isInstance(value: any): value is Instance {
	return value && typeof value === 'object';
}

function resolveFactory(type: 'action', definition: ActionDefinition, resolveMid: ResolveMid): Promise<ActionFactory>;
function resolveFactory(type: 'store', definition: StoreDefinition, resolveMid: ResolveMid): Promise<StoreFactory>;
function resolveFactory(type: 'widget', definition: WidgetDefinition, resolveMid: ResolveMid): Promise<WidgetFactory>;
function resolveFactory(type: FactoryTypes, definition: ItemDefinition<Factory, Instance>, resolveMid: ResolveMid): Promise<Factory>;
function resolveFactory(type: FactoryTypes, { factory, instance }: ItemDefinition<Factory, Instance>, resolveMid: ResolveMid): Promise<Factory> {
	if (typeof factory === 'function') {
		return Promise.resolve(factory);
	}

	if (isInstance(instance)) {
		return Promise.resolve(() => instance);
	}

	const mid = <string> (factory || instance);
	return resolveMid(mid).then((defaultExport) => {
		if (factory) {
			if (typeof defaultExport !== 'function') {
				throw new Error(`Could not resolve '${mid}' to ${errorStrings[type]} factory function`);
			}

			const factory: Factory = defaultExport;
			return factory;
		}

		// istanbul ignore else Action factories are expected to guard against definitions with neither
		// factory or instance properties.
		if (instance) {
			if (!defaultExport || typeof defaultExport !== 'object') {
				throw new Error(`Could not resolve '${mid}' to ${errorStrings[type]} instance`);
			}

			const instance: Instance = defaultExport;
			return () => instance;
		}
	});
}

export function makeActionFactory(definition: ActionDefinition, resolveMid: ResolveMid): ActionFactory {
	if (!('factory' in definition || 'instance' in definition)) {
		throw new Error('Action definitions must specify either the factory or instance option');
	}
	if ('instance' in definition && 'stateFrom' in definition) {
		throw new Error('Cannot specify stateFrom option when action definition points directly at an instance');
	}

	return (registry: CombinedRegistry) => {
		return Promise.all<any>([
			resolveFactory('action', definition, resolveMid).then((factory) => {
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
}

export function makeStoreFactory(definition: StoreDefinition, resolveMid: ResolveMid): StoreFactory {
	if (!('factory' in definition || 'instance' in definition)) {
		throw new Error('Store definitions must specify either the factory or instance option');
	}
	if ('instance' in definition && 'options' in definition) {
		throw new Error('Cannot specify options when store definition points directly at an instance');
	}

	const options = assign({}, definition.options);

	return () => {
		return resolveFactory('store', definition, resolveMid).then((factory) => {
			return factory(options);
		});
	};
}

export function makeWidgetFactory(definition: WidgetDefinition, resolveMid: ResolveMid, registry: CombinedRegistry): WidgetFactory {
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
	options = assign({ id: definition.id }, options);

	return () => {
		return Promise.all<any>([
			resolveFactory('widget', definition, resolveMid),
			resolveListenersMap(registry, definition),
			resolveStore(registry, definition)
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

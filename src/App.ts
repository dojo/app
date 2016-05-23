import { Stateful, State } from 'dojo-compose/mixins/createStateful';
import { Handle } from 'dojo-core/interfaces';
import Promise from 'dojo-core/Promise';

import IdentityRegistry, { Identity } from './IdentityRegistry';

const noop = () => {};

export interface Registerable {
	register(registry: Object): Handle | void;
}

export type ActionLike = Registerable & Stateful<State>;

export interface ToAbsMid {
	(moduleId: string): string;
}

export interface CombinedRegistry {
	getAction(id: Identity): Promise<any>;
	hasAction(id: Identity): boolean;
	getStore(id: Identity): Promise<any>;
	hasStore(id: Identity): boolean;
	getWidget(id: Identity): Promise<any>;
	hasWidget(id: Identity): boolean;
}

export interface Factory<T> {
	(): Promise<T>;
}

export interface ActionFactory {
	(registry: CombinedRegistry): Promise<ActionLike>;
}

export { Identity };

export interface Definition {
	actions?: ActionDefinition[];
	stores?: StoreDefinition[];
	widgets?: WidgetDefinition[];
}

export type GenericFactoryFn = (options?: Object) => any;

export interface ItemDefinition {
	factory: GenericFactoryFn | string;
}

export interface ActionDefinition extends ItemDefinition {
	id: Identity;
	stateFrom?: string;
}

export interface StoreDefinition extends ItemDefinition {
	id: Identity;
	options?: Object;
}

export interface WidgetDefinition extends ItemDefinition {
	id: string;
	stateFrom?: string;
	options?: Object;
}

function resolveMid (toAbsMid: ToAbsMid, mid: string): Promise<any> {
	return new Promise(resolve => {
		require([toAbsMid(mid)], (module) => {
			if (module.__esModule) {
				resolve(module.default);
			}
			else {
				resolve(module);
			}
		});
	});
}

enum FactoryTypes { Action, Store, Widget };
const errorStrings: { [type: number]: string } = {
	[FactoryTypes.Action]: 'an action',
	[FactoryTypes.Store]: 'a store',
	[FactoryTypes.Widget]: 'a widget'
};

function resolveFactory (toAbsMid: ToAbsMid, { factory }: ItemDefinition, type: FactoryTypes): Promise<Function> {
	if (typeof factory === 'function') {
		return Promise.resolve(factory);
	}

	const mid = <string> factory;
	return resolveMid(toAbsMid, mid).then((factory) => {
		if (typeof factory !== 'function') {
			throw new Error(`Could not resolve ${mid} to ${errorStrings[type]} factory function`);
		}

		return <Function> factory;
	});
}

function makeActionFactory (toAbsMid: ToAbsMid, definition: ActionDefinition): ActionFactory {
	const { id, stateFrom } = definition;

	return (registry: CombinedRegistry) => {
		return Promise.all([
			stateFrom && registry.getStore(stateFrom),
			resolveFactory(toAbsMid, definition, FactoryTypes.Action).then((factory) => {
				return factory(registry);
			})
		]).then(([store, action]) => {
			if (store) {
				action.own(action.observeState(id, store));
			}
			return action;
		});
	};
}

function makeStoreFactory (toAbsMid: ToAbsMid, definition: StoreDefinition): Factory<any> {
	return () => {
		const { options } = definition;
		return resolveFactory(toAbsMid, definition, FactoryTypes.Store).then((factory) => {
			return factory(options);
		});
	};
}

function makeWidgetFactory (toAbsMid: ToAbsMid, definition: WidgetDefinition, app: App): Factory<any> {
	const { id, stateFrom } = definition;
	let { options } = definition;
	if (options && ('id' in options || 'stateFrom' in options)) {
		throw new Error('id and stateFrom options should be in the widget definition itself, not its options value');
	}
	options = Object.assign({ id }, options);

	return () => {
		return Promise.all([
			stateFrom && app.getStore(stateFrom),
			resolveFactory(toAbsMid, definition, FactoryTypes.Widget)
		]).then(([store, factory]) => {
			if (store) {
				(<any> options).stateFrom = store;
			}

			return factory(options);
		});
	};
}

export default class App {
	private _actions = new IdentityRegistry<Factory<any>>();
	private _stores = new IdentityRegistry<Factory<any>>();
	private _widgets = new IdentityRegistry<Factory<any>>();
	private _registry: CombinedRegistry;
	private _toAbsMid: ToAbsMid;

	constructor({ toAbsMid = (moduleId: string) => moduleId }: { toAbsMid?: ToAbsMid } = {}) {
		this._toAbsMid = toAbsMid;

		this._registry = {
			getAction: this.getAction.bind(this),
			hasAction: this.hasAction.bind(this),
			getStore: this.getStore.bind(this),
			hasStore: this.hasStore.bind(this),
			getWidget: this.getWidget.bind(this),
			hasWidget: this.hasWidget.bind(this)
		};
		Object.freeze(this._registry);
	}

	getAction(id: Identity): Promise<any> {
		return new Promise((resolve) => {
			resolve(this._actions.get(id)());
		});
	}

	hasAction(id: Identity): boolean {
		return this._actions.hasId(id);
	}

	registerAction(id: Identity, action: ActionLike): Handle {
		const promise: Promise<any> = Promise.resolve(action);
		const storeHandle = this._actions.register(id, () => promise);
		const actionHandle = action.register(this._registry);
		return {
			destroy() {
				this.destroy = noop;
				storeHandle.destroy();
				if (actionHandle) {
					(<Handle> actionHandle).destroy();
				}
			}
		};
	}

	registerActionFactory(id: Identity, factory: ActionFactory): Handle {
		let destroyed = false;

		let actionHandle: Handle | void;
		let storeHandle = this._actions.register(id, () => {
			const promise = factory(this._registry);
			storeHandle.destroy();
			storeHandle = this._actions.register(id, () => promise);

			return promise.then<any>(action => {
				if (!destroyed) {
					actionHandle = action.register(this._registry);
				}

				return action;
			});
		});

		return {
			destroy() {
				this.destroy = noop;
				destroyed = true;
				storeHandle.destroy();
				if (actionHandle) {
					(<Handle> actionHandle).destroy();
				}
			}
		};
	}

	getStore(id: Identity): Promise<any> {
		return new Promise((resolve) => {
			resolve(this._stores.get(id)());
		});
	}

	hasStore(id: Identity): boolean {
		return this._stores.hasId(id);
	}

	registerStore(id: Identity, store: any): Handle {
		const promise: Promise<any> = Promise.resolve(store);
		return this._stores.register(id, () => promise);
	}

	registerStoreFactory(id: Identity, factory: Factory<any>): Handle {
		let storeHandle = this._stores.register(id, () => {
			const promise = factory();
			storeHandle.destroy();
			storeHandle = this._stores.register(id, () => promise);
			return promise;
		});

		return {
			destroy() {
				this.destroy = noop;
				storeHandle.destroy();
			}
		};
	}

	getWidget(id: Identity): Promise<any> {
		return new Promise((resolve) => {
			resolve(this._widgets.get(id)());
		});
	}

	hasWidget(id: Identity): boolean {
		return this._widgets.hasId(id);
	}

	registerWidget(id: Identity, widget: any): Handle {
		const promise: Promise<any> = Promise.resolve(widget);
		return this._widgets.register(id, () => promise);
	}

	registerWidgetFactory(id: Identity, factory: Factory<any>): Handle {
		let storeHandle = this._widgets.register(id, () => {
			const promise = factory();
			storeHandle.destroy();
			storeHandle = this._widgets.register(id, () => promise);
			return promise;
		});

		return {
			destroy() {
				this.destroy = noop;
				storeHandle.destroy();
			}
		};
	}

	loadDefinition({ actions, stores, widgets }: Definition): void {
		if (actions) {
			for (const definition of actions) {
				this.registerActionFactory(definition.id, makeActionFactory(this._toAbsMid, definition));
			}
		}

		if (stores) {
			for (const definition of stores) {
				this.registerStoreFactory(definition.id, makeStoreFactory(this._toAbsMid, definition));
			}
		}

		if (widgets) {
			for (const definition of widgets) {
				this.registerWidgetFactory(definition.id, makeWidgetFactory(this._toAbsMid, definition, this));
			}
		}
	}
}

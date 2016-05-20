import { Handle } from 'dojo-core/interfaces';
import Promise from 'dojo-core/Promise';

import IdentityRegistry, { Identity } from './IdentityRegistry';

const noop = () => {};

export interface Registerable {
	register(registry: Object): Handle | void;
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

export { Identity };

export default class App {
	private _actions = new IdentityRegistry<Factory<any>>();
	private _stores = new IdentityRegistry<Factory<any>>();
	private _widgets = new IdentityRegistry<Factory<any>>();
	private _registry: CombinedRegistry;

	constructor() {
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

	registerAction(id: Identity, action: Registerable): Handle {
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

	registerActionFactory(id: Identity, factory: Factory<Registerable>): Handle {
		let destroyed = false;

		let actionHandle: Handle | void;
		let storeHandle = this._actions.register(id, () => {
			const promise = factory();
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
}

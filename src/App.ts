import { Handle } from 'dojo-core/interfaces';

import IdentityRegistry, { Identity } from './IdentityRegistry';

const noop = () => {};

export interface Registerable {
	register(registry: Object): Handle | void;
}

export interface CombinedRegistry {
	getAction(id: Identity): any;
	hasAction(id: Identity): boolean;
	getStore(id: Identity): any;
	hasStore(id: Identity): boolean;
	getWidget(id: Identity): any;
	hasWidget(id: Identity): boolean;
}

export default class App {
	private _actions = new IdentityRegistry<any>();
	private _stores = new IdentityRegistry<any>();
	private _widgets = new IdentityRegistry<any>();
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

	getAction(id: Identity): any {
		return this._actions.get(id);
	}

	hasAction(id: Identity): boolean {
		return this._actions.hasId(id);
	}

	registerAction(id: Identity, action: Registerable): Handle {
		const storeHandle = this._actions.register(id, action);
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

	getStore(id: Identity): any {
		return this._stores.get(id);
	}

	hasStore(id: Identity): boolean {
		return this._stores.hasId(id);
	}

	registerStore(id: Identity, store: any): Handle {
		return this._stores.register(id, store);
	}

	getWidget(id: Identity): any {
		return this._widgets.get(id);
	}

	hasWidget(id: Identity): boolean {
		return this._widgets.hasId(id);
	}

	registerWidget(id: Identity, widget: any): Handle {
		return this._widgets.register(id, widget);
	}
}

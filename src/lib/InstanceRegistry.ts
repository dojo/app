import { Handle } from 'dojo-core/interfaces';
import WeakMap from 'dojo-shim/WeakMap';

import {
	ActionLike,
	Identifier,
	StoreLike,
	WidgetLike
} from '../createApp';

type Instance = ActionLike | StoreLike | WidgetLike;
enum Type { Action, Store, Widget };
const errorStrings: { [type: number]: string } = {
	[Type.Action]: 'action',
	[Type.Store]: 'store',
	[Type.Widget]: 'widget'
};

export default class InstanceRegistry {
	private map = new WeakMap<Instance, { id: Identifier | symbol, type: Type }>();

	addAction(action: ActionLike, id: Identifier): Handle {
		return this.add(action, id, Type.Action);
	}

	identifyAction(action: ActionLike): Identifier {
		return this.identify(action, Type.Action);
	}

	addStore(store: StoreLike, id: Identifier | symbol): Handle {
		return this.add(store, id, Type.Store);
	}

	identifyStore(store: StoreLike): Identifier | symbol {
		return this.identify(store, Type.Store);
	}

	addWidget(widget: WidgetLike, id: Identifier): Handle {
		return this.add(widget, id, Type.Widget);
	}

	identifyWidget(widget: WidgetLike): Identifier {
		return this.identify(widget, Type.Widget);
	}

	private add(instance: ActionLike, id: Identifier, type: Type): Handle;
	private add(instance: StoreLike, id: Identifier | symbol, type: Type): Handle;
	private add(instance: WidgetLike, id: Identifier, type: Type): Handle;
	private add(instance: Instance, id: Identifier | symbol, type: Type): Handle {
		if (this.map.has(instance)) {
			const existing = this.map.get(instance);
			throw new Error(`Could not add ${errorStrings[type]}, already registered as ${errorStrings[existing.type]} with identity ${existing.id}`);
		}

		this.map.set(instance, { id, type });
		const handle = {
			destroy: () => {
				this.map.delete(instance);
			}
		};
		return handle;
	}

	private identify(instance: ActionLike, expectedType: Type): string;
	private identify(instance: StoreLike, expectedType: Type): string | symbol;
	private identify(instance: WidgetLike, expectedType: Type): string;
	private identify(instance: Instance, expectedType: Type): string | symbol {
		if (!this.map.has(instance)) {
			throw new Error(`Could not identify ${errorStrings[expectedType]}`);
		}

		const { id, type } = this.map.get(instance);
		if (type !== expectedType) {
			throw new Error(`Could not identify ${errorStrings[expectedType]}`);
		}

		return id;
	}
}

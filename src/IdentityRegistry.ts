import { Handle } from 'dojo-core/interfaces';
import Promise from 'dojo-core/Promise';

// Copied from dojo-compose to avoid a dependency.
interface Destroyable {
	own(handle: Handle): Handle;
	destroy(): Promise<boolean>;
}

export type Identity = string | symbol;

export default class IdentityRegistry<T extends Destroyable> {
	byId(id: Identity): T | void {
		return null;
	}

	hasId(id: Identity): boolean {
		return false;
	}

	identify(value: T): Identity | void {
		return null;
	}

	canIdentify(value: T): boolean {
		return false;
	}

	add(id: Identity, value: T): Handle {
		return { destroy() {} };
	}

	remove(id: Identity): boolean {
		return false;
	}
};

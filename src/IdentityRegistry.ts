import { Handle } from 'dojo-core/interfaces';
import Map from 'dojo-core/Map';
import Promise from 'dojo-core/Promise';
import WeakMap from 'dojo-core/WeakMap';

const noop = () => {};

// Copied from dojo-compose to avoid a dependency.
export interface Destroyable {
	own(handle: Handle): Handle;
	destroy(): Promise<boolean>;
}

interface Entry<T> {
	handle: Handle;
	value: T;
}

/**
 * Registry identities can be strings or symbols. Note that the empty string is allowed.
 */
export type Identity = string | symbol;

/**
 * A registry of values, mapped by identities. Values must be destroyable.
 */
export default class IdentityRegistry<T extends Destroyable> {
	private _entryMap: Map<Identity, Entry<T>>;
	private _idMap: WeakMap<T, Identity>;

	constructor() {
		this._entryMap = new Map<Identity, Entry<T>>();
		this._idMap = new WeakMap<T, Identity>();
	}

	/**
	 * Look up a value by its identifier.
	 * @param id The identifier
	 * @return `null` if no value was registered with the given identifier, or else the value
	 */
	byId(id: Identity): T | void {
		if (!this.hasId(id)) {
			return null;
		}

		return this._entryMap.get(id).value;
	}

	/**
	 * Determine whether the value has been registered.
	 * @param value The value
	 * @return `true` if the value has been registered, `false` otherwise
	 */
	contains(value: T): boolean {
		return this._idMap.has(value);
	}

	/**
	 * Remove from the registry the value for a given identifier.
	 * @param id The identifier
	 * @return `true` if the value was removed, `false` otherwise
	 */
	delete(id: Identity): boolean {
		if (!this._entryMap.has(id)) {
			return false;
		}

		const { handle } = this._entryMap.get(id);
		handle.destroy();

		return true;
	}

	/**
	 * Determine whether a value has been registered for the given identifier.
	 * @param id The identifier
	 * @return `true` if a value has been registered, `false` otherwise
	 */
	hasId(id: Identity): boolean {
		return this._entryMap.has(id);
	}

	/**
	 * Look up the identifier for which the given value has been registered.
	 * @param value The value
	 * @return `null` if the value has not been registered, the identifier otherwise
	 */
	identify(value: T): Identity | void {
		if (!this.contains(value)) {
			return null;
		}

		return this._idMap.get(value);
	}

	/**
	 * Register a new value with a new identity.
	 * Throws if a different value has already been registered for the given identity,
	 * or if the value has already been registered with a different identity.
	 * @param id The identifier
	 * @param value The value
	 * @return A handle for deregistering the value. Note that when called repeatedly with
	 *   the same identifier and value combination, the same handle is returned
	 */
	register(id: Identity, value: T): Handle {
		const existingValue = this.byId(id);
		if (existingValue && existingValue !== value) {
			const str = id.toString();
			throw new Error(`A value has already been registered for the given identity (${str})`);
		}

		const existingId = this.identify(value);
		if (existingId && existingId !== id) {
			const str = (<Identity> existingId).toString();
			throw new Error(`The value has already been registered with a different identity (${str})`);
		}

		// Adding the same value with the same id is a noop, return the original handle.
		if (existingValue && existingId) {
			return this._entryMap.get(id).handle;
		}

		const handle = {
			destroy: () => {
				handle.destroy = noop;
				this._entryMap.delete(id);
				this._idMap.delete(value);
			}
		};

		this._entryMap.set(id, { handle, value });
		this._idMap.set(value, id);

		return handle;
	}
};

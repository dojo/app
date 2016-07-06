import { Handle } from 'dojo-core/interfaces';
import Map from 'dojo-shim/Map';
import WeakMap from 'dojo-shim/WeakMap';

const noop = () => {};

interface Entry<V> {
	handle: Handle;
	value: V;
}

/**
 * Registry identities can be strings or symbols. Note that the empty string is allowed.
 */
export type Identity = string | symbol;

/**
 * A registry of values, mapped by identities.
 */
export default class IdentityRegistry<V extends Object> {
	private _entryMap: Map<Identity, Entry<V>>;
	private _idMap: WeakMap<V, Identity>;

	constructor() {
		this._entryMap = new Map<Identity, Entry<V>>();
		this._idMap = new WeakMap<V, Identity>();
	}

	/**
	 * Look up a value by its identifier.
	 *
	 * Throws if no value has been registered for the given identifier.
	 *
	 * @param id The identifier
	 * @return The value
	 */
	get(id: Identity): V {
		if (!this.hasId(id)) {
			throw new Error(`Could not find a value for identity '${id.toString()}'`);
		}

		return this._entryMap.get(id).value;
	}

	/**
	 * Determine whether the value has been registered.
	 * @param value The value
	 * @return `true` if the value has been registered, `false` otherwise
	 */
	contains(value: V): boolean {
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
	 *
	 * Throws if the value hasn't been registered.
	 *
	 * @param value The value
	 * @return The identifier otherwise
	 */
	identify(value: V): Identity {
		if (!this.contains(value)) {
			throw new Error('Could not identify non-registered value');
		}

		return this._idMap.get(value);
	}

	/**
	 * Register a new value with a new identity.
	 *
	 * Throws if a different value has already been registered for the given identity,
	 * or if the value has already been registered with a different identity.
	 *
	 * @param id The identifier
	 * @param value The value
	 * @return A handle for deregistering the value. Note that when called repeatedly with
	 *   the same identifier and value combination, the same handle is returned
	 */
	register(id: Identity, value: V): Handle {
		const existingValue = this.hasId(id) ? this.get(id) : null;
		if (existingValue && existingValue !== value) {
			const str = id.toString();
			throw new Error(`A value has already been registered for the given identity (${str})`);
		}

		const existingId = this.contains(value) ? this.identify(value) : null;
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

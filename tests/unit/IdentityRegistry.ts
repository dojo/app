import { Handle } from 'dojo-core/interfaces';
import Promise from 'dojo-core/Promise';
import * as registerSuite from 'intern!object';
import * as assert from 'intern/chai!assert';

import IdentityRegistry from 'src/IdentityRegistry';

class Value {
	own(handle: Handle): Handle {
		return { destroy() {} };
	}

	destroy(): Promise<boolean> {
		return Promise.resolve(true);
	}
}

registerSuite({
	name: 'IdentityRegistry',

	'#byId': {
		'not registered'() {
			const registry = new IdentityRegistry<Value>();
			assert.isNull(registry.byId('id'));
		},

		registered() {
			const registry = new IdentityRegistry<Value>();
			const expected = new Value();
			registry.register('id', expected);
			assert.strictEqual(registry.byId('id'), expected);
		}
	},

	'#contains': {
		'not registered'() {
			const registry = new IdentityRegistry<Value>();
			assert.isFalse(registry.contains(new Value()));
		},

		registered() {
			const registry = new IdentityRegistry<Value>();
			const value = new Value();
			registry.register('id', value);
			assert.isTrue(registry.contains(value));
		}
	},

	delete: {
		'not registered'() {
			const registry = new IdentityRegistry<Value>();
			assert.isFalse(registry.delete('id'));
		},

		registered() {
			const registry = new IdentityRegistry<Value>();
			registry.register('id', new Value());
			assert.isTrue(registry.hasId('id'));
			assert.isTrue(registry.delete('id'));
			assert.isFalse(registry.hasId('id'));
		}
	},

	'#hasId': {
		'not registered'() {
			const registry = new IdentityRegistry<Value>();
			assert.isFalse(registry.hasId('id'));
		},

		registered() {
			const registry = new IdentityRegistry<Value>();
			registry.register('id', new Value());
			assert.isTrue(registry.hasId('id'));
		}
	},

	'#identify': {
		'not registered'() {
			const registry = new IdentityRegistry<Value>();
			assert.isNull(registry.identify(new Value()));
		},

		registered() {
			const registry = new IdentityRegistry<Value>();
			const value = new Value();
			const expected = Symbol();
			registry.register(expected, value);
			assert.strictEqual(registry.identify(value), expected);
		}
	},

	'#register': {
		ok() {
			const registry = new IdentityRegistry<Value>();
			const expected = new Value();
			registry.register('id', expected);
			assert.strictEqual(registry.byId('id'), expected);
		},

		'string id is already used'() {
			const registry = new IdentityRegistry<Value>();
			registry.register('id', new Value());
			assert.throws(() => {
				registry.register('id', new Value());
			}, Error, 'A value has already been registered for the given identity (id)');
		},

		'symbol id is already used'() {
			const registry = new IdentityRegistry<Value>();
			const id = Symbol('id');
			registry.register(id, new Value());
			assert.throws(() => {
				registry.register(id, new Value());
			}, Error, 'A value has already been registered for the given identity (Symbol(id))');
		},

		'value has already been registered with a different (string) id'() {
			const registry = new IdentityRegistry<Value>();
			const value = new Value();
			registry.register('id1', value);
			assert.throws(() => {
				registry.register(Symbol('id2'), value);
			}, Error, 'The value has already been registered with a different identity (id1)');
		},

		'value has already been registered with a different (symbol) id'() {
			const registry = new IdentityRegistry<Value>();
			const value = new Value();
			registry.register(Symbol('id1'), value);
			assert.throws(() => {
				registry.register('id2', value);
			}, Error, 'The value has already been registered with a different identity (Symbol(id1))');
		},

		'value has already been registered with the same id'() {
			const registry = new IdentityRegistry<Value>();
			const value = new Value();
			const expected = registry.register('id', value);
			const actual = registry.register('id', value);
			assert.strictEqual(actual, expected);
		},

		'returns handle'() {
			const registry = new IdentityRegistry<Value>();
			const handle = registry.register('id', new Value());
			assert.isTrue(registry.hasId('id'));
			handle.destroy();
			assert.isFalse(registry.hasId('id'));
		}
	}
});

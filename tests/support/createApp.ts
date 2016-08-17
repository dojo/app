import Promise from 'dojo-shim/Promise';
import * as assert from 'intern/chai!assert';
import compose from 'dojo-compose/compose';
import Map from 'dojo-shim/Map';
import { h } from 'maquette';
import { Handle } from 'dojo-core/interfaces';

import {
	ActionLike,
	StoreLike,
	WidgetLike
} from 'src/createApp';

export function createAction(): ActionLike {
	return <ActionLike> {
		configure (configuration: Object) {}
	};
}

export function createStore(): StoreLike {
	return <StoreLike> {};
}

export const createSpyStore = compose({
	add(this: any, ...args: any[]): Promise<any> {
		this._add.push(args);
		const id = args ? args[0].id : null;
		if (id) {
			this._map.set(id, args[0]);
		}
		return Promise.resolve({});
	},
	get(this: any, id: string): Promise<any> {
		return Promise.resolve(this._map.get(id));
	},
	_add: <any[][]> null,
	_map: <Map<string, any>> null,
	observe(...args: any[]): any {},
	_observe: <any[][]> null,
	patch(this: any, ...args: any[]): Promise<any> {
		this._patch.push(args);
		return Promise.resolve({});
	},
	_patch: <any[][]> null,
	_options: <any> null
}, (instance, options) => {
	instance._options = options;
	instance._add = [];
	instance._map = new Map<string, any>();
	instance._observe = [];
	instance._patch = [];
});

export function createWidget(): WidgetLike {
	return <WidgetLike> {};
}

export const createSpyWidget = compose({
	render() {
		return h('div');
	},
	own(this: any, handle: any): Handle {
		this._own.push(handle);
		return {
			destroy() { }
		};
	},
	destroy(this: any) {
		return Promise.resolve(this._destroyed = true);
	},
	tagName: 'div',
	id: '',
	parent: null,
	_options: <any> null,
	_own: <any[]> null,
	_destroyed: false
}, (instance, options) => {
	instance._options = options;
	instance._own = [];
});

export function createAsyncSpyWidget(): Promise<WidgetLike> {
	return new Promise<WidgetLike>((resolve) => {
		resolve(createSpyWidget());
	});
}

export function invert(promise: Promise<any>): Promise<any> {
	return promise.then((value) => {
		throw value;
	}, (err) => {
		return err;
	});
}

export function rejects(promise: Promise<any>, errType: Function, msg?: string): Promise<any> {
	return promise.then(() => {
		throw new Error('Promise should have rejected');
	}, (err: any) => {
		assert.throws(() => { throw err; }, errType);
		if (msg) {
			assert.strictEqual(err.message, msg);
		}
		return err;
	});
}

export function strictEqual(promise: Promise<any>, expected: any): Promise<void> {
	return promise.then((actual: any) => {
		assert.strictEqual(actual, expected);
	});
}

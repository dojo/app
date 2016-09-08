import Promise from 'dojo-shim/Promise';
import * as assert from 'intern/chai!assert';
import compose from 'dojo-compose/compose';
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
		return Promise.resolve({});
	},
	_add: <any[][]> null,
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
	_options: <any> null,
	_own: <any[]> null,
	_destroyed: false
}, (instance, options) => {
	instance._options = options;
	instance._own = [];
});

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
